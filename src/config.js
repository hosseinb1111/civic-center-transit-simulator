/** Static scene geometry and drawing palettes. Timetable and service values live in data/config.json. */
export const W = 1440;                 // world width  (canvas units)
export const H = 920;                  // world height (canvas units)
export const TAU = Math.PI * 2;


  // Passenger lanes and vertical geometry.
export const SHAFT_X = [120, 1318];
export const STREET_LANE_Y = 91;
export const CONCOURSE_LANE_Y = 230;
export const SHAFT_TOP = 95;
export const SHAFT_BOTTOM = 745;
export const FARE_GATE_X = [550, 594, 638, 682, 726, 770, 814, 858];
export const COLUMN_X = [175, 360, 545, 730, 915, 1100, 1265];

export const PLATFORM = {
    muni: { trackA: 344, trackB: 450, islandTop: 366, islandBottom: 428, doorY: 382 },
    bart: { trackA: 592, trackB: 688, islandTop: 614, islandBottom: 670, doorY: 632 },
  };

  // Scene palettes. Route colours are loaded from data/config.json.
export const PALETTES = {
    light: {
      paper: '#f6f5f1',
      wall: '#dfe4e8',
      wallRule: 'rgba(27, 31, 36, 0.05)',
      lamp: 'rgba(255, 252, 240, 0.95)',
      lampGlow: 'rgba(255, 252, 240, 0.35)',
      ink: '#1b1f24',
      ink2: '#4a525c',
      signal: '#f2c230',
      streetBand: '#cbd2d9',
      entrance: '#ffffff',
      entranceBar: '#b8c1ca',
      gate: '#ffffff',
      gateEdge: '#b3bdc7',
      gateBart: '#3b7dd8',
      gateMuni: '#2f9d64',
      validator: '#2a3138',
      panel: '#ffffff',
      board: '#1b1f24',
      boardText: '#f2c230',
      signBg: '#1b1f24',
      signText: '#f6f5f1',
      track: '#7b858f',
      trackBed: '#b9c1c9',
      tie: 'rgba(27, 31, 36, 0.12)',
      island: '#e7eaee',
      tactile: 'rgba(242, 194, 48, 0.55)',
      column: '#c3cad2',
      columnHi: 'rgba(255, 255, 255, 0.7)',
      columnBase: '#aab3bd',
      escalator: '#6b7580',
      escalatorStep: 'rgba(27, 31, 36, 0.22)',
      escalatorPlate: '#8d97a2',
      shaft: 'rgba(90, 140, 180, 0.10)',
      shaftEdge: 'rgba(60, 100, 140, 0.32)',
      lift: 'rgba(242, 194, 48, 0.16)',
      carWindow: '#2a3138',
      carLit: 'rgba(255, 244, 205, 0.85)',
      carBoard: '#14181d',
      carBoardText: '#ffc93c',
      wheel: '#2a3138',
      bogie: '#3a434d',
      headlight: '#fffdf2',
      glow: 'rgba(255, 250, 225, 0.55)',
      trainShadow: 'rgba(27, 31, 36, 0.18)',
      paxShadow: 'rgba(27, 31, 36, 0.16)',
      bag: '#3e4650',
      arrowMuni: '#2f7d57',
      arrowBart: '#b98a00',
    },
    dark: {
      paper: '#101317',
      wall: '#1f262e',
      wallRule: 'rgba(255, 255, 255, 0.035)',
      lamp: 'rgba(255, 240, 200, 0.9)',
      lampGlow: 'rgba(255, 240, 200, 0.22)',
      ink: '#e9edf2',
      ink2: '#aab3be',
      signal: '#f2c230',
      streetBand: '#2a323c',
      entrance: '#232b34',
      entranceBar: '#3a4450',
      gate: '#2a323c',
      gateEdge: '#46515d',
      gateBart: '#6aa7ff',
      gateMuni: '#49c188',
      validator: '#0b0f14',
      panel: '#20272f',
      board: '#0b0e12',
      boardText: '#f2c230',
      signBg: '#e9edf2',
      signText: '#101317',
      track: '#8b96a2',
      trackBed: '#141a20',
      tie: 'rgba(255, 255, 255, 0.07)',
      island: '#2b333c',
      tactile: 'rgba(242, 194, 48, 0.4)',
      column: '#343d48',
      columnHi: 'rgba(255, 255, 255, 0.06)',
      columnBase: '#2a323c',
      escalator: '#8d98a4',
      escalatorStep: 'rgba(255, 255, 255, 0.2)',
      escalatorPlate: '#4a5561',
      shaft: 'rgba(120, 170, 220, 0.08)',
      shaftEdge: 'rgba(140, 180, 220, 0.3)',
      lift: 'rgba(242, 194, 48, 0.12)',
      carWindow: '#0c1116',
      carLit: 'rgba(255, 236, 180, 0.55)',
      carBoard: '#0b0e12',
      carBoardText: '#ffc93c',
      wheel: '#0c1116',
      bogie: '#252d36',
      headlight: '#fffbe8',
      glow: 'rgba(255, 240, 200, 0.32)',
      trainShadow: 'rgba(0, 0, 0, 0.45)',
      paxShadow: 'rgba(0, 0, 0, 0.35)',
      bag: '#6b7682',
      arrowMuni: '#49c188',
      arrowBart: '#f2c230',
    },
  };

export const PASSENGER_COLORS = [
    '#b5562e', '#3d7a5c', '#2f5d8a', '#8a4f9e',
    '#b8861a', '#4d6370', '#a23e4c', '#2c7e86',
  ];

export const ENTRANCES = [
    ['A1', 'Civic Center / Grove'], ['A2', 'Market & Hyde'],
    ['A3', 'UN Plaza'],             ['A4', 'Market & 7th'],
    ['B1', 'Market, north side'],   ['B2', 'Market, south side'],
    ['B3', 'Market, 1100 block'],   ['B4', 'Market, 7th side'],
  ];


export const THEME_KEY = 'civic-center-theme';
export const MAX_LOG_EVENTS = 14;
export const MAX_SCHEDULE_ROWS = 11;
export const HUD_INTERVAL = 0.12;
export const DEFAULT_START_TIME = 8 * 3600;

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const rand = (min, max) => min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(rand(min, max + 1));
export const pick = (items) => items[Math.floor(Math.random() * items.length)];
export const easeOutCubic = (progress) => 1 - Math.pow(1 - progress, 3);

export function fmtClock(seconds) {
  const value = ((Math.floor(seconds) % 86400) + 86400) % 86400;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value / 60) % 60;
  const remainder = value % 60;
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, '0')).join(':');
}

export function periodName(seconds, simulationConfig) {
  const value = ((seconds % 86400) + 86400) % 86400;
  return simulationConfig.periods.find((period) => value >= period.start && value < period.end)?.name || 'Overnight';
}

export function isPeak(seconds, simulationConfig) {
  const value = ((seconds % 86400) + 86400) % 86400;
  return simulationConfig.peakPeriods.some((period) => value >= period.start && value < period.end);
}

export function headwayFor(service, seconds, simulationConfig, scenario = { headwayMultiplier: 1 }) {
  const peak = isPeak(seconds, simulationConfig);
  const base = peak ? service.line.peakHeadwaySeconds : service.line.offPeakHeadwaySeconds;
  return Math.max(1, Math.round(base * (scenario.headwayMultiplier || 1)));
}

export function firstDepartureAfter(service, now, simulationConfig, scenario) {
  let departure = service.offsetSeconds || 0;
  let guard = 0;
  while (departure < now && guard++ < 10000) departure += headwayFor(service, departure, simulationConfig, scenario);
  return departure;
}

export function formatEta(row, now) {
  if (row.status === 'At platform') return 'Now';
  const seconds = row.eta - now;
  if (!Number.isFinite(seconds)) return '—';
  if (seconds <= 25) return 'Now';
  if (seconds < 60) return '<1 min';
  return `${Math.round(seconds / 60)} min`;
}

export function buildEntryPath({ startX, shaftX, destinationX, streetY, concourseY, platformY }) {
  return [
    { x: startX, y: streetY },
    { x: shaftX, y: streetY },
    { x: shaftX, y: concourseY },
    { x: shaftX, y: platformY },
    { x: destinationX, y: platformY },
  ];
}

export function buildExitPath({ startX, shaftX, exitX, platformY, concourseY, streetY, topY = 20 }) {
  return [
    { x: startX, y: platformY },
    { x: shaftX, y: platformY },
    { x: shaftX, y: concourseY },
    { x: shaftX, y: streetY },
    { x: exitX, y: streetY },
    { x: exitX, y: topY },
  ];
}

export function validateConfig(config) {
  if (!config || !config.simulation || !config.lines || !Array.isArray(config.services)) {
    throw new Error('Invalid configuration: simulation, lines and services are required.');
  }
  for (const service of config.services) {
    if (!config.lines[service.lineId]) throw new Error(`Unknown lineId in service ${service.id}: ${service.lineId}`);
    if (!['A', 'B'].includes(service.direction)) throw new Error(`Invalid direction in service ${service.id}`);
  }
  return config;
}
