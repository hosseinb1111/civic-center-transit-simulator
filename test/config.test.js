import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../data/config.json' with { type: 'json' };
import {
  validateConfig, isPeak, periodName, headwayFor, firstDepartureAfter,
  formatEta, buildEntryPath, buildExitPath,
} from '../src/config.js';

const checkedConfig = validateConfig(config);

test('config schema contains complete line and service definitions', () => {
  assert.equal(Object.keys(checkedConfig.lines).length, 9);
  assert.equal(checkedConfig.services.length, 18);
  assert.ok(checkedConfig.scenarios.singleTracking);
  assert.ok(checkedConfig.scenarios.platformCrowding);
});

test('peak periods and named periods use configured time boundaries', () => {
  assert.equal(isPeak(6.5 * 3600, config.simulation), true);
  assert.equal(isPeak(9.5 * 3600, config.simulation), false);
  assert.equal(isPeak(16 * 3600, config.simulation), true);
  assert.equal(periodName(12 * 3600, config.simulation), 'Midday');
});

test('headway uses the configured peak/off-peak interval and scenario multiplier', () => {
  const service = { line: config.lines.yellow };
  assert.equal(headwayFor(service, 8 * 3600, config.simulation, config.scenarios.normal), 150);
  assert.equal(headwayFor(service, 12 * 3600, config.simulation, config.scenarios.normal), 300);
  assert.equal(headwayFor(service, 8 * 3600, config.simulation, config.scenarios.singleTracking), 270);
});

test('next illustrative departure advances through changing headways', () => {
  const service = { line: config.lines.yellow, offsetSeconds: 0 };
  assert.equal(firstDepartureAfter(service, 8 * 3600, config.simulation, config.scenarios.normal), 8 * 3600);
});

test('ETA formatting handles arriving, approaching and unbounded departures', () => {
  assert.equal(formatEta({ status: 'At platform', eta: 100 }, 100), 'Now');
  assert.equal(formatEta({ status: 'Scheduled', eta: 145 }, 100), '<1 min');
  assert.equal(formatEta({ status: 'Scheduled', eta: 250 }, 100), '3 min');
  assert.equal(formatEta({ status: 'Scheduled', eta: Infinity }, 100), '—');
});

test('passenger route builders preserve the station-level transitions', () => {
  const entry = buildEntryPath({ startX: 10, shaftX: 100, destinationX: 200, streetY: 91, concourseY: 230, platformY: 382 });
  assert.deepEqual(entry.map((point) => point.y), [91, 91, 230, 382, 382]);
  assert.equal(entry.at(-1).x, 200);
  const exit = buildExitPath({ startX: 200, shaftX: 100, exitX: 10, platformY: 382, concourseY: 230, streetY: 91 });
  assert.deepEqual(exit.map((point) => point.y), [382, 382, 230, 91, 91, 20]);
});
