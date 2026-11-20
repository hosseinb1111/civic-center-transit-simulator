import { validateConfig } from './config.js';
import { createSimulationEngine } from './simulation.js';
import { createRenderer } from './rendering.js';
import { createUI } from './ui.js';

async function loadJson(path, optional = false) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    if (optional && response.status === 404) return null;
    throw new Error(`Could not load ${path} (${response.status}).`);
  }
  return response.json();
}

function validateRealSchedule(schedule) {
  if (!schedule || schedule.mode !== 'gtfs-static' || !Array.isArray(schedule.services)) return null;
  const services = schedule.services.filter((service) =>
    service && Array.isArray(service.departures) && service.departures.length &&
    ['bart', 'muni'].includes(service.system),
  );
  return services.length ? { ...schedule, services } : null;
}

async function boot() {
  try {
    const config = validateConfig(await loadJson('./data/config.json'));
    const realSchedule = validateRealSchedule(await loadJson('./data/real-schedule.json', true));
    const engine = createSimulationEngine(config, realSchedule);
    const canvas = document.getElementById('stage');
    const renderer = createRenderer({ canvas, engine });
    createUI({
      config,
      engine,
      renderer,
      realScheduleAvailable: Boolean(realSchedule),
    });
  } catch (error) {
    console.error(error);
    const message = document.getElementById('appError');
    if (message) {
      message.hidden = false;
      message.textContent = `The simulator could not start: ${error.message} Serve the project from a local web server and check that data/config.json is present.`;
    }
  }
}

boot();
