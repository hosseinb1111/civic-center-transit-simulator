/*
 * Civic Center / UN Plaza — station operations simulator.
 *
 * Illustrative only. Station geometry and the route set follow public
 * BART / SFMTA station information. Headways, passenger counts, dwell
 * times and delays are synthetic.
 *
 *   1. Configuration     world geometry, routes, timetable
 *   2. State             clock, trains, passengers, log
 *   3. Agents            Train and Passenger
 *   4. Simulation step   timetable, spawning, movement
 *   5. Rendering         canvas scene
 *   6. Interface         HUD, schedule, log, controls, main loop
 */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. Configuration
   * ------------------------------------------------------------------ */

  const W = 1440;                 // world width  (canvas units)
  const H = 920;                  // world height (canvas units)
  const TAU = Math.PI * 2;

  const START_TIME = 8 * 3600;    // 08:00
  const MAX_TRAINS = 25;
  const MAX_PASSENGERS = 285;
  const SEED_PASSENGERS = 95;
  const ENTRY_RATE = { offPeak: 0.10, peak: 0.19 };   // arrivals per simulated second
  const SCHEDULE_LOOKAHEAD = 30;  // seconds before arrival that a train is spawned
  const MAX_LOG_EVENTS = 14;
  const MAX_SCHEDULE_ROWS = 11;
  const HUD_INTERVAL = 0.12;      // seconds (real time) between HUD refreshes

  // Passenger lanes and vertical geometry.
  const SHAFT_X = [120, 1318];
  const STREET_LANE_Y = 91;
  const CONCOURSE_LANE_Y = 230;
  const SHAFT_TOP = 95;
  const SHAFT_BOTTOM = 745;
  const FARE_GATE_X = [550, 594, 638, 682, 726, 770, 814, 858];
  const COLUMN_X = [175, 360, 545, 730, 915, 1100, 1265];

  const PLATFORM = {
    muni: { trackA: 344, trackB: 450, islandTop: 366, islandBottom: 428, doorY: 382 },
    bart: { trackA: 592, trackB: 688, islandTop: 614, islandBottom: 670, doorY: 632 },
  };

  const PASSENGER_COLORS = [
    '#e5b38b', '#c89978', '#a6b98e', '#8fb3cc', '#cda8ae', '#d9bf8b',
    '#80a99f', '#c9b0d2', '#a9bfd3', '#c7a17e', '#aeb8c4',
  ];

  const ENTRANCES = [
    ['A1', 'Civic Center / Grove'], ['A2', 'Market & Hyde'],
    ['A3', 'UN Plaza'],             ['A4', 'Market & 7th'],
    ['B1', 'Market · north side'],  ['B2', 'Market · south side'],
    ['B3', 'Market · 1100 block'],  ['B4', 'Market · 7th side'],
  ];

  // Routes. `peak` and `off` are headways in seconds; `a` and `b` are the
  // termini for the two directions (A = outbound, B = inbound).
  const LINES = {
    yellow: { system: 'bart', label: 'Yellow', short: 'Y', color: '#f7cf42', ink: '#151a20', cars: [8, 9, 10], peak: 150, off: 300, a: 'SFIA / Millbrae', b: 'Antioch' },
    red:    { system: 'bart', label: 'Red',    short: 'R', color: '#ff6170', ink: '#ffffff', cars: [8, 9, 10], peak: 300, off: 600, a: 'Richmond', b: 'Millbrae / SFIA' },
    orange: { system: 'bart', label: 'Orange', short: 'O', color: '#ee8d35', ink: '#ffffff', cars: [8, 9, 10], peak: 300, off: 600, a: 'Daly City', b: 'Berryessa / North San José' },
    blue:   { system: 'bart', label: 'Blue',   short: 'B', color: '#5da9ff', ink: '#ffffff', cars: [8, 9, 10], peak: 300, off: 600, a: 'Daly City', b: 'Dublin / Pleasanton' },
    J: { system: 'muni', label: 'J Church',     short: 'J', color: '#c9935d', ink: '#ffffff', cars: [1, 2], peak: 360, off: 600, a: 'Embarcadero', b: 'Balboa Park' },
    K: { system: 'muni', label: 'K Ingleside',  short: 'K', color: '#4d91ca', ink: '#ffffff', cars: [1, 2], peak: 480, off: 720, a: 'Embarcadero', b: 'Balboa Park' },
    L: { system: 'muni', label: 'L Taraval',    short: 'L', color: '#8360a9', ink: '#ffffff', cars: [1, 2], peak: 480, off: 720, a: 'Embarcadero', b: 'SF Zoo' },
    M: { system: 'muni', label: 'M Ocean View', short: 'M', color: '#43a16e', ink: '#ffffff', cars: [1, 2], peak: 480, off: 720, a: 'Embarcadero', b: 'Balboa Park' },
    N: { system: 'muni', label: 'N Judah',      short: 'N', color: '#2e79c7', ink: '#ffffff', cars: [1, 2], peak: 360, off: 540, a: 'Embarcadero', b: 'Ocean Beach' },
  };

  // Each service is one line in one direction, with a staggered first
  // departure offset that gives the dense downtown rhythm.
  const SERVICES = [
    ['yellow', 'A', 0],   ['yellow', 'B', 30],
    ['orange', 'A', 60],  ['orange', 'B', 90],
    ['blue',   'A', 120], ['blue',   'B', 150],
    ['red',    'A', 180], ['red',    'B', 210],
    ['N', 'A', 15],  ['N', 'B', 195],
    ['J', 'A', 75],  ['J', 'B', 255],
    ['K', 'A', 135], ['K', 'B', 315],
    ['L', 'A', 225], ['L', 'B', 45],
    ['M', 'A', 285], ['M', 'B', 105],
  ].map(([id, dir, offset]) => ({ id, line: LINES[id], dir, offset }));

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
  const pick = (items) => items[Math.floor(Math.random() * items.length)];
  const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);

  const levelOf = (system) => PLATFORM[system];
  const waitLaneY = (svc) => {
    const level = levelOf(svc.line.system);
    return svc.dir === 'A' ? level.doorY - 25 : level.doorY + 25;
  };
  const destinationOf = (svc) => (svc.dir === 'A' ? svc.line.a : svc.line.b);
  const directionOf = (svc) => (svc.dir === 'A' ? 'Outbound' : 'Inbound');

  function fmtClock(t) {
    const s = ((Math.floor(t) % 86400) + 86400) % 86400;
    const h = Math.floor(s / 3600);
    const m = Math.floor(s / 60) % 60;
    const sec = s % 60;
    return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
  }

  function periodName(t) {
    const h = (t % 86400) / 3600;
    if (h < 5) return 'Overnight';
    if (h < 6.5) return 'Early Morning';
    if (h < 9.5) return 'Morning Rush';
    if (h < 15) return 'Midday Service';
    if (h < 19) return 'Evening Rush';
    if (h < 22) return 'Evening Service';
    return 'Late Night';
  }

  function fmtMinutes(sec) {
    return `${Math.round(sec / 6) / 10} min`;
  }

  /* ------------------------------------------------------------------ *
   * 2. State
   * ------------------------------------------------------------------ */

  const sim = {
    time: START_TIME,        // simulated seconds since midnight
    speed: 4,
    paused: false,
    trains: [],
    passengers: [],
    nextArrival: [],         // per service: next scheduled arrival time
    entryBudget: 0,          // fractional passenger arrivals carried between frames
    peak: false,
    stats: { boarded: 0, departed: 0 },
    events: [],
  };

  /* ------------------------------------------------------------------ *
   * Timetable
   * ------------------------------------------------------------------ */

  function isPeak(t) {
    const h = (t % 86400) / 3600;
    return (h >= 6.5 && h < 9.5) || (h >= 16 && h < 19);
  }

  function headway(svc, t) {
    return isPeak(t) ? svc.line.peak : svc.line.off;
  }

  function firstDepartureAfter(svc, now) {
    let t = svc.offset;
    while (t < now) t += headway(svc, t);
    return t;
  }

  /* ------------------------------------------------------------------ *
   * 3. Agents
   * ------------------------------------------------------------------ */

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

      this.delay = Math.random() < 0.08 ? rand(5, 35) : 0;
      this.approachTime = rand(25, 30) + this.delay;
      this.dwellTime = (this.isBart ? 22 : 17) + rand(0, 6);

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
      const delayNote = this.delay > 0 ? ` · +${Math.round(this.delay)}s delay` : '';
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
        `${this.boardingAssigned} boarding · ${this.alightingCount} alighting`,
      );
    }

    depart() {
      this.state = 'depart';
      this.t = 0;
      this.doorsOpen = false;
      logEvent(
        `${this.line.label} departing`,
        `${this.boardingAssigned} boarded · ${this.alightingCount} alighted · doors closed`,
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

  /* ------------------------------------------------------------------ *
   * 4. Simulation step
   * ------------------------------------------------------------------ */

  function chooseService() {
    // Busier services are more likely to be the source of a new arrival.
    const weights = SERVICES.map((svc) => 1 / headway(svc, sim.time));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < SERVICES.length; i++) {
      r -= weights[i];
      if (r <= 0) return SERVICES[i];
    }
    return SERVICES[0];
  }

  function spawnEntry() {
    if (sim.passengers.length >= MAX_PASSENGERS) return;
    const svc = chooseService();
    const p = new Passenger(rand(270, 1170), rand(18, 76));
    p.svc = svc;
    const shaft = pick(SHAFT_X);
    const laneY = waitLaneY(svc);
    const dest = rand(190, 1250);
    p.walk(
      [
        { x: p.x, y: STREET_LANE_Y },
        { x: shaft, y: STREET_LANE_Y },
        { x: shaft, y: CONCOURSE_LANE_Y },
        { x: shaft, y: laneY },
        { x: dest, y: laneY },
      ],
      (q) => {
        q.state = 'waiting';
      },
    );
    sim.passengers.push(p);
  }

  function spawnAlighting(train, count) {
    const y = waitLaneY(train.svc);
    for (let i = 0; i < count && sim.passengers.length < MAX_PASSENGERS; i++) {
      const p = new Passenger(train.x + rand(-train.length * 0.35, train.length * 0.35), y);
      const shaft = Math.abs(p.x - SHAFT_X[0]) < Math.abs(p.x - SHAFT_X[1]) ? SHAFT_X[0] : SHAFT_X[1];
      const exit = rand(250, 1180);
      p.walk(
        [
          { x: shaft, y },
          { x: shaft, y: CONCOURSE_LANE_Y },
          { x: shaft, y: STREET_LANE_Y },
          { x: exit, y: STREET_LANE_Y },
          { x: exit, y: 20 },
        ],
        (q) => {
          q.dead = true;
        },
      );
      sim.passengers.push(p);
    }
  }

  function seedPassenger() {
    const svc = chooseService();
    const p = new Passenger(rand(180, 1260), waitLaneY(svc));
    p.svc = svc;
    p.state = 'waiting';
    sim.passengers.push(p);
  }

  function spawnTrain(svc, arriveAt) {
    if (sim.trains.length >= MAX_TRAINS) return;
    sim.trains.push(new Train(svc, arriveAt));
    logEvent(`${svc.line.label} service approaching`, `${directionOf(svc)} · ${destinationOf(svc)}`);
  }

  function step(dt) {
    const peak = isPeak(sim.time);
    if (peak !== sim.peak) {
      sim.peak = peak;
      logEvent(
        peak ? 'Peak service begins' : 'Peak service eases',
        'Headways updated for the new service period',
      );
    }

    // Spawn trains shortly before their scheduled arrival.
    SERVICES.forEach((svc, i) => {
      let guard = 0;
      while (sim.nextArrival[i] - sim.time < SCHEDULE_LOOKAHEAD && guard++ < 8) {
        spawnTrain(svc, sim.nextArrival[i]);
        sim.nextArrival[i] += headway(svc, sim.nextArrival[i]);
      }
    });

    for (let i = sim.trains.length - 1; i >= 0; i--) {
      const train = sim.trains[i];
      train.update(dt);
      if (train.gone) sim.trains.splice(i, 1);
    }

    // Passengers arrive at the street entrances at a steady rate.
    sim.entryBudget = Math.min(5, sim.entryBudget + dt * (peak ? ENTRY_RATE.peak : ENTRY_RATE.offPeak));
    for (let guard = 0; sim.entryBudget >= 1 && guard < 5; guard++) {
      sim.entryBudget--;
      spawnEntry();
    }

    for (let i = sim.passengers.length - 1; i >= 0; i--) {
      const p = sim.passengers[i];
      p.update(dt);
      if (p.dead) sim.passengers.splice(i, 1);
    }
  }

  function resetSimulation(time) {
    sim.time = time;
    sim.trains = [];
    sim.passengers = [];
    sim.entryBudget = 0;
    sim.stats = { boarded: 0, departed: 0 };
    sim.events = [];
    sim.peak = isPeak(time);
    sim.nextArrival = SERVICES.map((svc) => firstDepartureAfter(svc, time));
    for (let i = 0; i < SEED_PASSENGERS; i++) seedPassenger();
  }

  // Trains due to arrive soon (or at the platform now), soonest first.
  function upcoming(filter, limit) {
    const rows = [];
    for (const train of sim.trains) {
      if (train.state === 'depart' || !filter(train.line)) continue;
      rows.push({
        eta: train.arriveAt,
        svc: train.svc,
        status: train.state === 'dwell' ? 'At platform' : 'Approaching',
        delay: train.delay,
      });
    }
    SERVICES.forEach((svc, i) => {
      if (filter(svc.line)) rows.push({ eta: sim.nextArrival[i], svc, status: 'Scheduled', delay: 0 });
    });
    rows.sort((a, b) => a.eta - b.eta);
    return rows.slice(0, limit);
  }

  function formatEta(row) {
    if (row.status === 'At platform') return 'Now';
    const sec = row.eta - sim.time;
    if (sec <= 25) return 'Now';
    if (sec < 60) return '<1 min';
    return `${Math.round(sec / 60)} min`;
  }

  /* ------------------------------------------------------------------ *
   * Event log
   * ------------------------------------------------------------------ */

  function logEvent(title, detail = '') {
    sim.events.unshift({ time: fmtClock(sim.time), title, detail });
    if (sim.events.length > MAX_LOG_EVENTS) sim.events.length = MAX_LOG_EVENTS;
    renderLog();
  }

  /* ------------------------------------------------------------------ *
   * 5. Rendering
   * ------------------------------------------------------------------ */

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const view = { dpr: 1, scale: 1, ox: 0, oy: 0 };

  const FONT_UI = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
  const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * view.dpr));
    canvas.height = Math.max(1, Math.round(rect.height * view.dpr));
    view.scale = Math.min(rect.width / W, rect.height / H);
    view.ox = (rect.width - W * view.scale) / 2;
    view.oy = (rect.height - H * view.scale) / 2;
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawText(str, x, y, { font, color, align = 'left', baseline = 'alphabetic' }) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(str, x, y);
  }

  function drawWall(top, bottom) {
    ctx.fillStyle = '#10151c';
    ctx.fillRect(0, top, W, bottom - top);
    ctx.strokeStyle = 'rgba(255,255,255,0.022)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 48) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    ctx.stroke();
  }

  function drawCeilingLights(y) {
    for (let x = 60; x < W; x += 180) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 115);
      glow.addColorStop(0, 'rgba(255,240,210,0.15)');
      glow.addColorStop(1, 'rgba(255,240,210,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 115, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,245,220,0.62)';
      roundRect(x - 26, y - 3, 52, 5, 2);
      ctx.fill();
    }
  }

  function drawTrack(y0, y1) {
    ctx.fillStyle = '#090c11';
    ctx.fillRect(0, y0, W, y1 - y0);
    ctx.strokeStyle = '#38414d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y1 - 9);
    ctx.lineTo(W, y1 - 9);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < W; x += 22) {
      ctx.moveTo(x, y1 - 17);
      ctx.lineTo(x, y1 - 2);
    }
    ctx.stroke();
  }

  function drawIsland(top, bottom) {
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, '#303741');
    g.addColorStop(0.5, '#292f38');
    g.addColorStop(1, '#21262f');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, W, bottom - top);
    ctx.fillStyle = '#d1af34';
    ctx.fillRect(0, top, W, 5);
    ctx.fillRect(0, bottom - 5, W, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, top + 6, W, 1);
  }

  function drawBeams(y) {
    ctx.fillStyle = '#252c35';
    for (const x of COLUMN_X) ctx.fillRect(x, y, 24, 16);
  }

  function drawEscalator(x, y0, y1, w) {
    ctx.strokeStyle = '#75808e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x + w, y1);
    ctx.stroke();
    for (let i = 0; i < 13; i++) {
      const p = i / 12;
      const xx = x + p * w;
      const yy = y0 + p * (y1 - y0);
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx + 6, yy + 4);
      ctx.stroke();
    }
    ctx.fillStyle = '#1f2630';
    ctx.fillRect(x - 6, y0 - 3, w + 12, 6);
    ctx.fillRect(x - 6, y1 - 3, w + 12, 6);
  }

  function drawLevelLabel(str, y) {
    drawText(str, 24, y, {
      font: '800 18px ' + FONT_UI,
      color: 'rgba(235,242,248,0.22)',
      baseline: 'middle',
    });
  }

  function drawStreet() {
    drawWall(0, 92);
    ctx.fillStyle = '#191e27';
    ctx.fillRect(0, 0, W, 16);
    drawText('MARKET STREET', 25, 36, { font: '800 18px ' + FONT_UI, color: '#c8d0db' });
    drawText('STREET LEVEL · CIVIC CENTER / UN PLAZA', 25, 54, {
      font: '600 10px ' + FONT_MONO,
      color: '#7d8b9b',
    });
    drawCeilingLights(72);

    ENTRANCES.forEach(([code, name], i) => {
      const x = 70 + i * 164;
      ctx.fillStyle = '#262d37';
      roundRect(x, 70, 138, 32, 5);
      ctx.fill();
      drawText(code, x + 8, 84, { font: '900 9px ' + FONT_MONO, color: '#6ee7ff' });
      drawText(name, x + 28, 84, { font: '600 9px ' + FONT_UI, color: '#dae3ec' });
      ctx.fillStyle = '#11161d';
      ctx.fillRect(x + 11, 92, 116, 3);
    });
  }

  function drawConcourse() {
    drawWall(105, 250);
    drawCeilingLights(116);
    drawText('FARE CONCOURSE', 24, 130, { font: '800 11px ' + FONT_UI, color: '#d4dbe3' });
    drawText('BART PAID AREA', 425, 136, { font: '600 9px ' + FONT_MONO, color: '#8794a5' });
    drawText('MUNI PAID AREA', 928, 136, { font: '600 9px ' + FONT_MONO, color: '#8794a5' });

    FARE_GATE_X.forEach((x, i) => {
      ctx.fillStyle = '#242c36';
      roundRect(x, 150, 34, 62, 4);
      ctx.fill();
      ctx.fillStyle = i % 2 ? '#32d56e' : '#54a7ff';
      ctx.beginPath();
      ctx.arc(x + 17, 168, 2.3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#0c1117';
      ctx.fillRect(x + 7, 178, 20, 17);
    });

    [
      [300, 'BART', '#5da9ff'],
      [1030, 'MUNI', '#2e79c7'],
    ].forEach(([x, label, color]) => {
      ctx.fillStyle = '#1a2029';
      roundRect(x, 147, 180, 66, 6);
      ctx.fill();
      drawText(label, x + 14, 170, { font: '900 12px ' + FONT_UI, color });
      drawText('Clipper / information', x + 14, 189, { font: '9px ' + FONT_UI, color: '#8e9aa8' });
    });

    ctx.strokeStyle = '#4a5563';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(90, 235);
    ctx.lineTo(90, 160);
    ctx.lineTo(180, 160);
    ctx.moveTo(1350, 235);
    ctx.lineTo(1350, 160);
    ctx.lineTo(1260, 160);
    ctx.stroke();
  }

  function drawMuni() {
    drawWall(278, 300);
    drawTrack(326, 358);
    drawTrack(432, 464);
    drawIsland(366, 428);
    drawCeilingLights(298);
    drawLevelLabel('MUNI METRO', 386);
    drawText('PLATFORM · J K L M N', W - 210, 386, { font: '600 9px ' + FONT_MONO, color: '#8592a1' });
    drawBeams(277);
    drawEscalator(205, 252, 368, 48);
    drawEscalator(1185, 252, 368, 48);
  }

  function drawBart() {
    drawWall(523, 545);
    drawTrack(574, 606);
    drawTrack(670, 702);
    drawIsland(614, 670);
    drawCeilingLights(543);
    drawLevelLabel('BART', 632);
    drawText('PLATFORM 2 · NORTHBOUND', W - 270, 626, { font: '600 9px ' + FONT_MONO, color: '#8592a1' });
    drawText('PLATFORM 1 · SOUTHBOUND', W - 270, 650, { font: '600 9px ' + FONT_MONO, color: '#8592a1' });
    drawBeams(522);
    drawEscalator(245, 487, 616, 66);
    drawEscalator(1145, 487, 616, 66);
  }

  function drawColumns() {
    for (const x of COLUMN_X) {
      ctx.fillStyle = '#1f2630';
      ctx.fillRect(x, 292, 24, 438);
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fillRect(x + 3, 292, 4, 438);
    }
  }

  function drawShafts() {
    for (const x of SHAFT_X) {
      ctx.fillStyle = 'rgba(175,215,255,0.06)';
      ctx.fillRect(x - 24, SHAFT_TOP, 48, SHAFT_BOTTOM - SHAFT_TOP);
      ctx.strokeStyle = 'rgba(190,220,255,0.20)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 23.5, SHAFT_TOP + 0.5, 47, SHAFT_BOTTOM - SHAFT_TOP - 1);
      ctx.fillStyle = 'rgba(255,240,200,0.10)';
      ctx.fillRect(x - 24, 365, 48, 62);
      ctx.fillRect(x - 24, 615, 48, 55);
      drawText('ELEVATOR', x, 350, { font: '8px ' + FONT_MONO, color: '#92a2b3', align: 'center' });
    }
  }

  function drawStationSigns() {
    [
      ['CIVIC CENTER', W / 2 - 90, 233],
      ['UN PLAZA', W / 2 + 30, 233],
      ['CIVIC CENTER', W / 2 - 70, 500],
    ].forEach(([label, x, y]) => {
      ctx.fillStyle = '#0b1118';
      roundRect(x, y, 120, 22, 4);
      ctx.fill();
      ctx.strokeStyle = '#42505f';
      ctx.stroke();
      drawText(label, x + 60, y + 14, { font: '800 8px ' + FONT_UI, color: '#eaf0f6', align: 'center' });
    });
  }

  function drawLedBoard(x, y, w, title, system) {
    ctx.fillStyle = '#11151b';
    roundRect(x, y, w, 52, 4);
    ctx.fill();
    ctx.strokeStyle = '#2c3643';
    ctx.lineWidth = 1;
    ctx.stroke();
    drawText(title, x + 9, y + 12, { font: '800 8px ' + FONT_MONO, color: '#ff515d' });

    upcoming((line) => line.system === system, 3).forEach((row, i) => {
      const ty = y + 25 + i * 10;
      drawText(`${row.svc.line.short}  ${destinationOf(row.svc)}`, x + 9, ty, {
        font: '600 8px ' + FONT_MONO,
        color: '#f9c865',
      });
      drawText(formatEta(row), x + w - 9, ty, {
        font: '600 8px ' + FONT_MONO,
        color: '#f9c865',
        align: 'right',
      });
    });
  }

  function drawFloorDetails() {
    for (const y of [366, 428, 614, 670]) {
      ctx.fillStyle = 'rgba(249,210,69,0.24)';
      for (let x = 22; x < W; x += 22) {
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, TAU);
        ctx.fill();
      }
    }
    for (const x of COLUMN_X) {
      ctx.fillStyle = '#11161d';
      roundRect(x - 5, 352, 34, 12, 2);
      ctx.fill();
      roundRect(x - 5, 600, 34, 12, 2);
      ctx.fill();
    }
  }

  function drawCar(train, x, y, w, h, lead) {
    ctx.fillStyle = train.line.color;
    roundRect(x, y, w, h, lead ? 8 : 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x, y, w, 2);

    // Windows and door seams.
    ctx.fillStyle = '#202a35';
    roundRect(x + w * 0.08, y + h * 0.18, w * 0.84, h * 0.32, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let k = 1; k < 4; k++) ctx.fillRect(x + w * 0.08 + k * (w * 0.84 / 4), y + h * 0.19, 1, h * 0.29);
    ctx.fillStyle = 'rgba(10,14,20,0.36)';
    for (let k = 1; k < 3; k++) ctx.fillRect(x + (w * k) / 3, y + h * 0.12, 2, h * 0.72);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + w * 0.06, y + h * 0.68, w * 0.88, 2);

    if (lead) {
      const front = train.sign > 0 ? x + w - 5 : x + 5;
      ctx.fillStyle = '#fff9df';
      ctx.beginPath();
      ctx.arc(front, y + h * 0.78, 2.3, 0, TAU);
      ctx.fill();
      drawText(train.destination, train.sign > 0 ? x + w - 12 : x + 12, y + h * 0.58, {
        font: '700 7px ' + FONT_MONO,
        color: '#0b1118',
        align: train.sign > 0 ? 'right' : 'left',
      });
    }
  }

  function drawTrain(train) {
    const x0 = train.x - train.length / 2;
    const y = train.trackY - train.height / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(x0 + 8, y + train.height - 1, train.length - 16, 8, 4);
    ctx.fill();

    for (let i = 0; i < train.cars; i++) {
      const lead = i === 0 || i === train.cars - 1;
      drawCar(train, x0 + i * train.carLength + 2, y, train.carLength - 4, train.height, lead);
    }

    if (train.doorsOpen) {
      ctx.fillStyle = 'rgba(255,240,192,0.10)';
      ctx.fillRect(x0, y - 12, train.length, train.height + 24);
    }

    if (train.state !== 'dwell') {
      const fx = train.x + (train.sign * train.length) / 2;
      const glow = ctx.createRadialGradient(fx, train.trackY, 0, fx, train.trackY, 120);
      glow.addColorStop(0, 'rgba(255,248,220,0.4)');
      glow.addColorStop(1, 'rgba(255,248,220,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(fx, train.trackY, 120, 0, TAU);
      ctx.fill();
    }
  }

  function drawPassenger(p, now) {
    const bob = p.state === 'waiting' ? Math.sin(now / 500 + p.phase) * 0.4 : 0;

    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.radius * 1.05, p.radius * 1.1, p.radius * 0.35, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y + bob, p.radius, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.beginPath();
    ctx.arc(p.x - p.radius * 0.28, p.y - p.radius * 0.3 + bob, p.radius * 0.35, 0, TAU);
    ctx.fill();

    if (p.hasBag) {
      ctx.fillStyle = '#465260';
      roundRect(p.x - p.radius * 0.9, p.y - p.radius * 0.1, Math.max(2, p.radius * 0.6), p.radius * 1.15, 1.5);
      ctx.fill();
    }
    if (p.hasBike) {
      ctx.strokeStyle = '#bdc7d1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x - 5, p.y + 7, 4, 0, TAU);
      ctx.arc(p.x + 5, p.y + 7, 4, 0, TAU);
      ctx.moveTo(p.x - 5, p.y + 7);
      ctx.lineTo(p.x, p.y);
      ctx.lineTo(p.x + 5, p.y + 7);
      ctx.stroke();
    }
  }

  function drawDirectionArrow(x, y, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 12, y);
    ctx.lineTo(x + 12, y);
    ctx.moveTo(x + 12, y);
    ctx.lineTo(x + 5, y - 5);
    ctx.moveTo(x + 12, y);
    ctx.lineTo(x + 5, y + 5);
    ctx.stroke();
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 850);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.58)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function draw(now) {
    // Map world units to device pixels once per frame.
    const k = view.dpr * view.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(k, 0, 0, k, view.dpr * view.ox, view.dpr * view.oy);

    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, W, H);

    drawStreet();
    drawConcourse();
    drawMuni();
    drawBart();
    drawColumns();
    drawShafts();
    drawStationSigns();
    drawLedBoard(72, 330, 240, 'MUNI', 'muni');
    drawLedBoard(970, 585, 360, 'BART', 'bart');
    drawFloorDetails();

    for (const train of sim.trains) drawTrain(train);
    for (const p of sim.passengers) drawPassenger(p, now);

    drawDirectionArrow(W - 100, 384, '#45d483');
    drawDirectionArrow(W - 100, 632, '#f7cf42');
    drawVignette();
  }

  /* ------------------------------------------------------------------ *
   * 6. Interface
   * ------------------------------------------------------------------ */

  const $ = (id) => document.getElementById(id);
  const dom = {
    clock: $('clock'),
    period: $('period'),
    clockState: $('clockState'),
    dwelling: $('stDwelling'),
    waiting: $('stWaiting'),
    boarded: $('stBoarded'),
    departed: $('stDeparted'),
    service: $('serviceStatus'),
    headways: $('headways'),
    trains: $('trainsInService'),
    paxInStation: $('paxInStation'),
    boardCount: $('boardCount'),
    schedule: $('schedule'),
    feed: $('feed'),
    pause: $('pauseBtn'),
    speedButtons: document.querySelectorAll('[data-speed]'),
    jumpButtons: document.querySelectorAll('[data-jump]'),
  };

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function renderLog() {
    dom.feed.replaceChildren(
      ...sim.events.map((e) => {
        const item = el('div', 'event');
        const head = el('b');
        head.append(el('span', 'ts', e.time), e.title);
        item.append(head, el('span', null, e.detail));
        return item;
      }),
    );
  }

  function renderSchedule() {
    const rows = upcoming(() => true, MAX_SCHEDULE_ROWS);
    dom.schedule.replaceChildren(
      ...rows.map((row) => {
        const eta = formatEta(row);
        const line = row.svc.line;
        const item = el('div', eta === 'Now' ? 'row now' : 'row');
        item.append(el('div', 'rtime', eta));

        const main = el('div');
        main.append(el('div', 'dest', destinationOf(row.svc)));
        const details = [line.label, line.system === 'bart' ? 'BART' : 'Muni', directionOf(row.svc), row.status];
        if (row.delay > 8) details.push(`+${Math.round(row.delay)}s`);
        main.append(el('div', 'meta', details.join(' · ')));
        item.append(main);

        const badge = el('div', 'badge', line.system === 'bart' ? line.label : line.short);
        badge.style.background = line.color;
        badge.style.color = line.ink;
        item.append(badge);
        return item;
      }),
    );
    dom.boardCount.textContent = `${rows.length} upcoming`;
  }

  function fastestHeadway(system) {
    const values = Object.values(LINES)
      .filter((line) => line.system === system)
      .map((line) => (isPeak(sim.time) ? line.peak : line.off));
    return Math.min(...values);
  }

  function updateHud() {
    dom.clock.textContent = fmtClock(sim.time);
    dom.period.textContent = periodName(sim.time);
    dom.clockState.textContent = `${sim.paused ? 'Paused' : 'Running'} · ${sim.speed}×`;

    dom.dwelling.textContent = sim.trains.filter((t) => t.state === 'dwell').length;
    dom.waiting.textContent = sim.passengers.filter((p) => p.state === 'waiting').length;
    dom.boarded.textContent = sim.stats.boarded;
    dom.departed.textContent = sim.stats.departed;

    const delayed = sim.trains.some((t) => t.delay > 10 && t.state !== 'depart');
    dom.service.textContent = delayed ? 'Minor delay · recovering' : 'On schedule';
    dom.service.className = `status-value ${delayed ? 'warn' : 'ok'}`;
    dom.headways.textContent = `BART ${fmtMinutes(fastestHeadway('bart'))} · Muni ${fmtMinutes(fastestHeadway('muni'))}`;
    dom.trains.textContent = sim.trains.length;
    dom.paxInStation.textContent = sim.passengers.length;

    renderSchedule();
  }

  function setSpeed(speed) {
    sim.speed = speed;
    dom.speedButtons.forEach((button) => {
      const on = Number(button.dataset.speed) === speed;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    });
    updateHud();
  }

  function setPaused(paused) {
    sim.paused = paused;
    dom.pause.textContent = paused ? 'Resume' : 'Pause';
    dom.pause.classList.toggle('active', paused);
    updateHud();
  }

  function jumpTo(time) {
    resetSimulation(time);
    logEvent('Simulation time changed', `Jumped to ${fmtClock(time)} · timetable recalculated`);
    updateHud();
  }

  function bindControls() {
    dom.pause.addEventListener('click', () => setPaused(!sim.paused));
    dom.speedButtons.forEach((button) =>
      button.addEventListener('click', () => setSpeed(Number(button.dataset.speed))),
    );
    dom.jumpButtons.forEach((button) =>
      button.addEventListener('click', () => jumpTo(Number(button.dataset.jump))),
    );

    window.addEventListener('keydown', (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target && target.closest('input, textarea, select')) return;
      if (e.code === 'Space') {
        // A focused button already handles Space natively; don't toggle twice.
        if (target && target.closest('button')) return;
        e.preventDefault();
        setPaused(!sim.paused);
      } else if (['1', '2', '4', '8'].includes(e.key)) {
        setSpeed(Number(e.key));
      }
    });
  }

  let lastFrame = performance.now();
  let hudTimer = 0;

  function frame(now) {
    const real = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    if (!sim.paused) {
      const dt = real * sim.speed;
      sim.time += dt;
      step(dt);
    }
    draw(now);

    hudTimer += real;
    if (hudTimer >= HUD_INTERVAL) {
      hudTimer = 0;
      updateHud();
    }
    requestAnimationFrame(frame);
  }

  function init() {
    resetSimulation(START_TIME);
    logEvent('Simulation started', 'Civic Center / UN Plaza · 08:00 · normal service profile');
    bindControls();
    setSpeed(sim.speed);
    setPaused(sim.paused);
    resizeCanvas();
    if (window.ResizeObserver) {
      new ResizeObserver(resizeCanvas).observe(canvas);
    } else {
      window.addEventListener('resize', resizeCanvas);
    }
    updateHud();
    requestAnimationFrame(frame);
  }

  init();
})();
