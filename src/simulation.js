import { createAgentTypes } from './agents.js';
import {
  PLATFORM, SHAFT_X, STREET_LANE_Y, CONCOURSE_LANE_Y,
  W, TAU, PASSENGER_COLORS, easeOutCubic, clamp, rand, randInt, pick, fmtClock, isPeak, headwayFor,
  firstDepartureAfter, buildEntryPath, buildExitPath,
} from './config.js';

const SCHEDULE_ROWS = 11;

function normalizeRealService(record, config) {
  const short = String(record.routeShortName || record.lineId || record.routeId || '?').trim();
  const key = Object.keys(config.lines).find((lineId) => {
    const line = config.lines[lineId];
    return lineId.toLowerCase() === short.toLowerCase() ||
      line.short.toLowerCase() === short.toLowerCase() ||
      line.label.toLowerCase() === short.toLowerCase();
  });
  const base = key ? config.lines[key] : null;
  const system = record.system === 'bart' ? 'bart' : 'muni';
  const line = {
    ...(base || {}),
    system,
    label: record.routeLongName || base?.label || `${short} line`,
    short,
    color: record.color || base?.color || (system === 'bart' ? '#687b91' : '#347c9f'),
    ink: base?.ink || '#ffffff',
    cars: base?.cars || (system === 'bart' ? [8, 9, 10] : [1, 2]),
    peakHeadwaySeconds: base?.peakHeadwaySeconds || 600,
    offPeakHeadwaySeconds: base?.offPeakHeadwaySeconds || 900,
    a: base?.a || record.destination || 'Unknown destination',
    b: base?.b || record.destination || 'Unknown destination',
  };
  const departures = [...new Set((record.departures || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  return {
    id: record.id || `${record.system}-${record.routeId}-${record.directionId}`,
    line,
    dir: record.direction === 'B' ? 'B' : 'A',
    directionLabel: record.directionLabel || (record.direction === 'B' ? 'Inbound' : 'Outbound'),
    destination: record.destination || 'Unknown destination',
    departures,
    source: 'GTFS static',
  };
}

export function createSimulationEngine(config, realSchedule = null) {
  const scenarioMap = config.scenarios;
  const initialScenario = scenarioMap.normal || Object.values(scenarioMap)[0];
  const sim = {
    time: config.simulation.startTime,
    speed: config.simulation.defaultSpeed,
    paused: false,
    mode: 'illustrative',
    scenario: 'normal',
    scenarioConfig: initialScenario,
    services: [],
    trains: [],
    passengers: [],
    nextArrival: [],
    nextDepartureIndex: [],
    entryBudget: 0,
    peak: false,
    stats: { boarded: 0, departed: 0 },
    events: [],
  };

  function levelOf(system) {
    return PLATFORM[system];
  }

  function waitLaneY(service) {
    const level = levelOf(service.line.system);
    return service.dir === 'A' ? level.doorY - 25 : level.doorY + 25;
  }

  function destinationOf(service) {
    return service.destination || (service.dir === 'A' ? service.line.a : service.line.b);
  }

  function directionOf(service) {
    return service.directionLabel || (service.dir === 'A' ? 'Outbound' : 'Inbound');
  }

  function logEvent(title, detail = '') {
    sim.events.unshift({ time: fmtClock(sim.time), title, detail });
    if (sim.events.length > 14) sim.events.length = 14;
  }

  function illustrativeServices() {
    return config.services.map((item) => ({
      id: item.id,
      line: { ...config.lines[item.lineId] },
      dir: item.direction,
      offsetSeconds: item.offsetSeconds,
      source: 'Illustrative',
    }));
  }

  function realServices() {
    if (!realSchedule?.services?.length) return [];
    return realSchedule.services.map((record) => normalizeRealService(record, config))
      .filter((service) => service.departures.length > 0);
  }

  function nextDepartureFor(service, now, startIndex = 0) {
    if (sim.mode === 'real') {
      const index = service.departures.findIndex((time, i) => i >= startIndex && time >= now);
      return index < 0 ? { time: Infinity, index: service.departures.length } : { time: service.departures[index], index };
    }
    return { time: firstDepartureAfter(service, now, config.simulation, sim.scenarioConfig), index: 0 };
  }

  function recalculateArrivals() {
    sim.nextArrival = [];
    sim.nextDepartureIndex = [];
    sim.services.forEach((service) => {
      const next = nextDepartureFor(service, sim.time, 0);
      sim.nextArrival.push(next.time);
      sim.nextDepartureIndex.push(next.index);
    });
  }

  function setMode(mode, { reset = true } = {}) {
    if (mode === 'real' && !realSchedule?.services?.length) return false;
    sim.mode = mode === 'real' ? 'real' : 'illustrative';
    sim.services = sim.mode === 'real' ? realServices() : illustrativeServices();
    if (reset) resetSimulation(sim.time);
    return sim.services.length > 0;
  }

  function setScenario(id, { reset = true } = {}) {
    const scenario = scenarioMap[id];
    if (!scenario) return false;
    sim.scenario = id;
    sim.scenarioConfig = scenario;
    if (reset) resetSimulation(sim.time);
    return true;
  }

  function chooseService() {
    const candidates = sim.services.filter((service, index) => Number.isFinite(sim.nextArrival[index]));
    if (!candidates.length) return sim.services[0];
    const weights = candidates.map((service) => 1 / serviceHeadway(service));
    const total = weights.reduce((sum, value) => sum + value, 0);
    let cursor = Math.random() * total;
    for (let index = 0; index < candidates.length; index++) {
      cursor -= weights[index];
      if (cursor <= 0) return candidates[index];
    }
    return candidates[0];
  }

  function serviceHeadway(service) {
    if (sim.mode === 'real') {
      const index = sim.services.indexOf(service);
      const current = sim.nextDepartureIndex[index] ?? 0;
      const a = service.departures[current];
      const b = service.departures[current + 1];
      return Number.isFinite(a) && Number.isFinite(b) ? Math.max(1, b - a) : 600;
    }
    return headwayFor(service, sim.time, config.simulation, sim.scenarioConfig);
  }

  function spawnEntry() {
    if (sim.passengers.length >= config.simulation.maxPassengers || !sim.services.length) return;
    const service = chooseService();
    const passenger = new Passenger(rand(270, 1170), rand(18, 76));
    passenger.svc = service;
    const shaft = pick(SHAFT_X);
    const laneY = waitLaneY(service);
    const destinationX = rand(190, 1250);
    passenger.walk(buildEntryPath({
      startX: passenger.x,
      shaftX: shaft,
      destinationX,
      streetY: STREET_LANE_Y,
      concourseY: CONCOURSE_LANE_Y,
      platformY: laneY,
    }), (arrived) => { arrived.state = 'waiting'; });
    sim.passengers.push(passenger);
  }

  function spawnAlighting(train, count) {
    const laneY = waitLaneY(train.svc);
    for (let index = 0; index < count && sim.passengers.length < config.simulation.maxPassengers; index++) {
      const passenger = new Passenger(train.x + rand(-train.length * 0.35, train.length * 0.35), laneY);
      const shaft = Math.abs(passenger.x - SHAFT_X[0]) < Math.abs(passenger.x - SHAFT_X[1]) ? SHAFT_X[0] : SHAFT_X[1];
      const exitX = rand(250, 1180);
      passenger.walk(buildExitPath({
        startX: passenger.x,
        shaftX: shaft,
        exitX,
        platformY: laneY,
        concourseY: CONCOURSE_LANE_Y,
        streetY: STREET_LANE_Y,
      }), (arrived) => { arrived.dead = true; });
      sim.passengers.push(passenger);
    }
  }

  function seedPassenger() {
    if (!sim.services.length) return;
    const service = chooseService();
    const passenger = new Passenger(rand(180, 1260), waitLaneY(service));
    passenger.svc = service;
    passenger.state = 'waiting';
    sim.passengers.push(passenger);
  }

  function spawnTrain(service, scheduledTime) {
    if (sim.trains.length >= config.simulation.maxTrains) return;
    sim.trains.push(new Train(service, scheduledTime));
    logEvent(`${service.line.label} service approaching`, `${directionOf(service)}, ${destinationOf(service)}`);
  }

  const { Train, Passenger } = createAgentTypes({
    W,
    TAU,
    PLATFORM,
    PASSENGER_COLORS,
    config,
    sim,
    clamp,
    rand,
    randInt,
    pick,
    easeOutCubic,
    levelOf,
    waitLaneY,
    destinationOf,
    directionOf,
    spawnAlighting,
    logEvent,
  });

  function resetSimulation(time = config.simulation.startTime) {
    sim.time = Math.max(0, Number(time) || 0);
    sim.trains = [];
    sim.passengers = [];
    sim.entryBudget = 0;
    sim.stats = { boarded: 0, departed: 0 };
    sim.events = [];
    sim.peak = isPeak(sim.time, config.simulation);
    recalculateArrivals();
    for (let index = 0; index < config.simulation.seedPassengers; index++) seedPassenger();
  }

  function step(deltaSeconds) {
    const peak = isPeak(sim.time, config.simulation);
    if (peak !== sim.peak) {
      sim.peak = peak;
      logEvent(peak ? 'Peak service begins' : 'Peak service eases', 'Headway profile updated for the new time period');
    }

    sim.services.forEach((service, index) => {
      let guard = 0;
      while (Number.isFinite(sim.nextArrival[index]) && sim.nextArrival[index] - sim.time < config.simulation.scheduleLookaheadSeconds && guard++ < 12) {
        const scheduled = sim.nextArrival[index];
        spawnTrain(service, scheduled);
        if (sim.mode === 'real') {
          const nextIndex = (sim.nextDepartureIndex[index] ?? 0) + 1;
          sim.nextDepartureIndex[index] = nextIndex;
          sim.nextArrival[index] = service.departures[nextIndex] ?? Infinity;
        } else {
          sim.nextArrival[index] += headwayFor(service, sim.nextArrival[index], config.simulation, sim.scenarioConfig);
        }
      }
    });

    for (let index = sim.trains.length - 1; index >= 0; index--) {
      const train = sim.trains[index];
      train.update(deltaSeconds);
      if (train.gone) sim.trains.splice(index, 1);
    }

    const entryRate = config.simulation.entryRatePerSecond[peak ? 'peak' : 'offPeak'] * sim.scenarioConfig.demandMultiplier;
    sim.entryBudget = Math.min(8, sim.entryBudget + deltaSeconds * entryRate);
    for (let guard = 0; sim.entryBudget >= 1 && guard < 8; guard++) {
      sim.entryBudget--;
      spawnEntry();
    }

    for (let index = sim.passengers.length - 1; index >= 0; index--) {
      const passenger = sim.passengers[index];
      passenger.update(deltaSeconds);
      if (passenger.dead) sim.passengers.splice(index, 1);
    }
  }

  function upcoming(filter = () => true, limit = SCHEDULE_ROWS) {
    const rows = [];
    for (const train of sim.trains) {
      if (train.state === 'depart' || !filter(train.line)) continue;
      rows.push({ eta: train.arriveAt, svc: train.svc, status: train.state === 'dwell' ? 'At platform' : 'Approaching', delay: train.delay });
    }
    sim.services.forEach((service, index) => {
      const eta = sim.nextArrival[index];
      if (filter(service.line) && Number.isFinite(eta)) rows.push({ eta, svc: service, status: 'Scheduled', delay: 0 });
    });
    rows.sort((a, b) => a.eta - b.eta);
    return rows.slice(0, limit);
  }

  function fastestHeadway(system) {
    const values = sim.services
      .filter((service) => service.line.system === system)
      .map((service) => serviceHeadway(service))
      .filter(Number.isFinite);
    return values.length ? Math.min(...values) : null;
  }

  function getPassengerCounts() {
    return {
      waitingMuni: sim.passengers.filter((passenger) => passenger.state === 'waiting' && passenger.svc?.line.system === 'muni').length,
      waitingBart: sim.passengers.filter((passenger) => passenger.state === 'waiting' && passenger.svc?.line.system === 'bart').length,
      walking: sim.passengers.filter((passenger) => passenger.state !== 'waiting').length,
    };
  }

  // Build the initial service table before constructing agents and resetting.
  sim.services = illustrativeServices();
  resetSimulation(config.simulation.startTime);

  return {
    sim,
    realSchedule,
    resetSimulation,
    step,
    upcoming,
    logEvent,
    setMode,
    setScenario,
    fastestHeadway,
    getPassengerCounts,
    destinationOf,
    directionOf,
    serviceHeadway,
    scheduleMetadata: () => realSchedule ? {
      serviceDate: realSchedule.serviceDate,
      generatedAt: realSchedule.generatedAt,
      sources: realSchedule.sources || [],
    } : null,
  };
}
