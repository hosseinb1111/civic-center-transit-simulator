/** Train and passenger agents. Dependencies are injected to keep agent behavior testable. */
export function createAgentTypes(dependencies) {
  const {
    W, TAU, PLATFORM, PASSENGER_COLORS, config, sim,
    clamp, rand, randInt, pick, easeOutCubic, levelOf, waitLaneY,
    destinationOf, directionOf, spawnAlighting, logEvent,
  } = dependencies;

  class Train {
    constructor(svc, arriveAt) {
      this.svc = svc;
      this.line = svc.line;
      this.sign = svc.dir === 'A' ? 1 : -1;
      this.isBart = svc.line.system === 'bart';
      this.trackY = levelOf(svc.line.system)[svc.dir === 'A' ? 'trackA' : 'trackB'];
      this.arriveAt = arriveAt;

      this.cars = pick(svc.line.cars);
      this.carLength = this.isBart ? 76 : 70;
      this.length = this.cars * this.carLength;
      this.height = this.isBart ? 45 : 34;

      this.delay = sim.mode === 'illustrative' && Math.random() < 0.08 ? rand(5, 35) : 0;
      this.approachTime = rand(25, 30) + this.delay;
      const dwell = config.simulation.dwellSeconds[this.isBart ? 'bart' : 'muni'];
      this.dwellTime = rand(dwell.min, dwell.max) * sim.scenarioConfig.dwellMultiplier;

      this.startX = this.sign > 0 ? -this.length - 150 : W + this.length + 150;
      this.endX = this.sign > 0 ? W + this.length + 150 : -this.length - 150;
      this.x = this.startX;

      this.state = 'approach';  // approach → dwell → depart
      this.t = 0;
      this.doorsOpen = false;
      this.boardingAssigned = 0;
      this.alightingCount = 0;
      this.gone = false;
    }

    get destination() {
      return destinationOf(this.svc);
    }

    get vehicle() {
      return this.isBart ? 'train' : 'LRV';
    }

    update(dt) {
      this.t += dt;
      if (this.state === 'approach') {
        const p = Math.min(1, this.t / this.approachTime);
        this.x = this.startX + (W / 2 - this.startX) * easeOutCubic(p);
        if (p >= 1) this.arrive();
      } else if (this.state === 'dwell') {
        if (!this.doorsOpen && this.t > 1.3) this.openDoors();
        if (this.t >= this.dwellTime) this.depart();
      } else {
        const p = Math.min(1, this.t / 16);
        this.x = W / 2 + (this.endX - W / 2) * p * p * p;
        if (p >= 1) {
          this.gone = true;
          sim.stats.departed++;
        }
      }
    }

    arrive() {
      this.x = W / 2;
      this.state = 'dwell';
      this.t = 0;
      const delayNote = this.delay > 0 ? `, ${Math.round(this.delay)} s late` : '';
      logEvent(`${this.line.label} ${this.vehicle} at platform`, `${this.destination}${delayNote}`);
    }

    openDoors() {
      this.doorsOpen = true;
      this.alightingCount = this.isBart ? randInt(5, 16) : randInt(1, 6);
      spawnAlighting(this, this.alightingCount);

      const doorY = levelOf(this.svc.line.system).doorY;
      const laneY = waitLaneY(this.svc);
      for (const p of sim.passengers) {
        if (p.state !== 'waiting' || p.svc !== this.svc) continue;
        const targetX = clamp(p.x, this.x - this.length / 2 + 26, this.x + this.length / 2 - 26);
        this.boardingAssigned++;
        p.walk(
          [{ x: p.x, y: p.y }, { x: targetX, y: laneY }, { x: targetX, y: doorY }],
          () => {
            p.dead = true;
            sim.stats.boarded++;
          },
        );
      }
      logEvent(
        `${this.line.label} doors open`,
        `${this.boardingAssigned} boarding, ${this.alightingCount} alighting`,
      );
    }

    depart() {
      this.state = 'depart';
      this.t = 0;
      this.doorsOpen = false;
      logEvent(
        `${this.line.label} departing`,
        `${this.boardingAssigned} boarded, ${this.alightingCount} alighted, doors closed`,
      );
    }
  }

  class Passenger {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.svc = null;          // service the passenger is waiting for
      this.state = 'walk';      // walk → waiting (platform) or done
      this.path = [];
      this.index = 0;
      this.onArrive = null;
      this.dead = false;

      this.speed = rand(28, 48);
      this.radius = rand(3.6, 5.2);
      this.color = pick(PASSENGER_COLORS);
      this.hasBag = Math.random() < 0.32;
      this.hasBike = Math.random() < 0.045;
      this.pause = Math.random() * 1.3;
      this.phase = Math.random() * TAU;
    }

    walk(path, onArrive) {
      this.path = path;
      this.index = 0;
      this.onArrive = onArrive;
      this.state = 'walk';
    }

    update(dt) {
      if (this.dead || this.state === 'waiting') return;
      if (this.pause > 0) {
        this.pause -= dt;
        return;
      }
      const target = this.path[this.index];
      if (!target) {
        this.finish();
        return;
      }
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const d = Math.hypot(dx, dy);
      const step = this.speed * dt;
      if (d <= step || d < 0.6) {
        this.x = target.x;
        this.y = target.y;
        this.index++;
        if (this.index >= this.path.length) this.finish();
      } else {
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
      }
    }

    finish() {
      this.state = 'done';
      const callback = this.onArrive;
      this.onArrive = null;
      if (callback) callback(this);
    }
  }

  return { Train, Passenger };
}
