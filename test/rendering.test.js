import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../data/config.json' with { type: 'json' };
import { createSimulationEngine } from '../src/simulation.js';
import { createRenderer } from '../src/rendering.js';

function createCanvasContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: () => ({ width: 10 }),
  }, {
    get(target, property) {
      if (property in target) return target[property];
      if (typeof property === 'string' && property.startsWith('create')) return () => gradient;
      return () => {};
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
}

test('renderer resizes and draws a complete empty station scene without a browser DOM', () => {
  const engine = createSimulationEngine(config);
  const context = createCanvasContext();
  const canvas = {
    width: 1,
    height: 1,
    getContext: () => context,
    getBoundingClientRect: () => ({ width: 1200, height: 760 }),
  };
  const renderer = createRenderer({ canvas, engine });
  renderer.setTheme('dark');
  renderer.setReducedMotion(true);
  renderer.resizeCanvas();
  renderer.draw(1000);
  assert.ok(canvas.width > 1);
  assert.ok(canvas.height > 1);
});
