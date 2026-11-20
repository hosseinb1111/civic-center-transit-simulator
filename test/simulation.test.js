import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../data/config.json' with { type: 'json' };
import { createSimulationEngine } from '../src/simulation.js';

test('engine initializes illustrative services and produces a next-trains board', () => {
  const engine = createSimulationEngine(config);
  assert.equal(engine.sim.services.length, 18);
  assert.equal(engine.sim.mode, 'illustrative');
  assert.ok(engine.upcoming().length > 0);
  assert.ok(engine.getPassengerCounts().waitingMuni + engine.getPassengerCounts().waitingBart > 0);
});

test('disruption scenarios recalculate service and passenger inputs', () => {
  const engine = createSimulationEngine(config);
  const normalNext = engine.sim.nextArrival[0];
  engine.setScenario('singleTracking');
  assert.ok(engine.sim.nextArrival[0] > normalNext);
  assert.equal(engine.sim.scenario, 'singleTracking');
  engine.setScenario('platformCrowding');
  assert.equal(engine.sim.scenarioConfig.demandMultiplier, 2.4);
});

test('real mode cannot be selected without an imported GTFS schedule', () => {
  const engine = createSimulationEngine(config);
  assert.equal(engine.setMode('real'), false);
  assert.equal(engine.sim.mode, 'illustrative');
});

test('GTFS services are used as scheduled departures when supplied', () => {
  const schedule = {
    mode: 'gtfs-static',
    serviceDate: '2026-11-20',
    services: [{
      id: 'bart-yellow-0', system: 'bart', routeId: 'Y', routeShortName: 'Yellow', routeLongName: 'Yellow Line',
      direction: 'A', destination: 'Antioch', color: '#f7cf42', departures: [28830, 29130, 29430],
    }],
  };
  const engine = createSimulationEngine(config, schedule);
  assert.equal(engine.setMode('real'), true);
  assert.equal(engine.sim.mode, 'real');
  assert.equal(engine.sim.services.length, 1);
  assert.equal(engine.sim.nextArrival[0], 28830);
  assert.equal(engine.upcoming()[0].eta, 28830);
});
