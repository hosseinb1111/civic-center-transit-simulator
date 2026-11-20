import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseCsv(input) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''));
    if (row.some((value) => value !== '')) rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows.shift().map((header) => header.trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

export function parseGtfsTime(value) {
  const match = /^(\d{1,3}):(\d{2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const [, hours, minutes, seconds] = match.map(Number);
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

export function serviceRunsOnDate(serviceId, serviceDate, calendarRows, exceptionRows) {
  const dateNumber = Number(serviceDate.replaceAll('-', ''));
  const date = new Date(`${serviceDate}T00:00:00Z`);
  const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getUTCDay()];
  const base = calendarRows.find((row) => row.service_id === serviceId);
  let active = Boolean(base && dateNumber >= Number(base.start_date) && dateNumber <= Number(base.end_date) && base[weekday] === '1');
  for (const exception of exceptionRows.filter((row) => row.service_id === serviceId && Number(row.date) === dateNumber)) {
    if (exception.exception_type === '1') active = true;
    if (exception.exception_type === '2') active = false;
  }
  return active;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    if (!args[index].startsWith('--')) continue;
    const key = args[index].slice(2);
    options[key] = args[index + 1] && !args[index + 1].startsWith('--') ? args[++index] : true;
  }
  return options;
}

async function readTable(feedDir, filename, required = true) {
  const fullPath = path.join(feedDir, filename);
  try {
    return parseCsv(await fs.readFile(fullPath, 'utf8'));
  } catch (error) {
    if (!required && error.code === 'ENOENT') return [];
    throw new Error(`Could not read ${fullPath}: ${error.message}`);
  }
}

function matchingStationStops(stops) {
  const matchedParents = new Set(
    stops.filter((stop) => /civic\s*center|united nations plaza|un plaza/i.test(stop.stop_name || ''))
      .map((stop) => stop.parent_station || stop.stop_id),
  );
  return new Set(stops.filter((stop) =>
    matchedParents.has(stop.stop_id) || matchedParents.has(stop.parent_station) ||
    /civic\s*center|united nations plaza|un plaza/i.test(stop.stop_name || ''),
  ).map((stop) => stop.stop_id));
}

function normalizeColor(value, fallback) {
  const color = String(value || '').replace(/^#/, '').trim();
  return /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : fallback;
}

export async function importAgencyFeed({ feedDir, system, serviceDate }) {
  const [stops, routes, trips, stopTimes, calendar, calendarDates] = await Promise.all([
    readTable(feedDir, 'stops.txt'),
    readTable(feedDir, 'routes.txt'),
    readTable(feedDir, 'trips.txt'),
    readTable(feedDir, 'stop_times.txt'),
    readTable(feedDir, 'calendar.txt', false),
    readTable(feedDir, 'calendar_dates.txt', false),
  ]);
  const stationStopIds = matchingStationStops(stops);
  if (!stationStopIds.size) throw new Error(`${system.toUpperCase()}: no Civic Center / UN Plaza stops found in stops.txt.`);

  const routeById = new Map(routes.map((route) => [route.route_id, route]));
  const tripById = new Map(trips.map((trip) => [trip.trip_id, trip]));
  const activeServices = new Set();
  for (const trip of trips) {
    if (serviceRunsOnDate(trip.service_id, serviceDate, calendar, calendarDates)) activeServices.add(trip.service_id);
  }

  const allowedMuni = new Set(['J', 'K', 'L', 'M', 'N']);
  const allowedBart = new Set(['yellow', 'red', 'orange', 'blue']);
  const routeIsRelevant = (route) => {
    if (!route) return false;
    const short = String(route.route_short_name || '').trim();
    const type = String(route.route_type || '');
    if (system === 'bart') return type === '1' && allowedBart.has(short.toLowerCase());
    return type === '0' && allowedMuni.has(short.toUpperCase());
  };

  const departuresByTrip = new Map();
  for (const stopTime of stopTimes) {
    if (!stationStopIds.has(stopTime.stop_id)) continue;
    const trip = tripById.get(stopTime.trip_id);
    if (!trip || !activeServices.has(trip.service_id)) continue;
    const route = routeById.get(trip.route_id);
    if (!routeIsRelevant(route)) continue;
    const seconds = parseGtfsTime(stopTime.departure_time || stopTime.arrival_time);
    if (seconds == null) continue;
    const previous = departuresByTrip.get(trip.trip_id);
    if (!previous || seconds < previous.seconds) departuresByTrip.set(trip.trip_id, { trip, route, seconds });
  }

  const grouped = new Map();
  for (const { trip, route, seconds } of departuresByTrip.values()) {
    const routeShortName = String(route.route_short_name || '').trim();
    const routeLongName = String(route.route_long_name || routeShortName).trim();
    const directionId = String(trip.direction_id || '0');
    const destination = String(trip.trip_headsign || routeLongName || routeShortName).trim();
    const key = [route.route_id, directionId, destination].join('|');
    if (!grouped.has(key)) {
      const fallback = system === 'bart'
        ? ({ yellow: '#f7cf42', red: '#ff6170', orange: '#ee8d35', blue: '#5da9ff' }[routeShortName.toLowerCase()] || '#687b91')
        : ({ J: '#c9935d', K: '#4d91ca', L: '#8360a9', M: '#43a16e', N: '#2e79c7' }[routeShortName.toUpperCase()] || '#347c9f');
      grouped.set(key, {
        id: `${system}-${route.route_id}-${directionId}-${grouped.size + 1}`,
        system,
        routeId: route.route_id,
        routeShortName,
        routeLongName,
        color: `#${normalizeColor(route.route_color, fallback).slice(1)}`,
        textColor: normalizeColor(route.route_text_color, '#ffffff'),
        directionId,
        direction: directionId === '1' ? 'B' : 'A',
        directionLabel: directionId === '1' ? 'Inbound' : 'Outbound',
        destination,
        departures: [],
      });
    }
    grouped.get(key).departures.push(seconds);
  }

  const services = [...grouped.values()];
  for (const service of services) {
    service.departures = [...new Set(service.departures)].sort((a, b) => a - b);
  }
  return {
    agency: system === 'bart' ? 'Bay Area Rapid Transit (BART)' : 'San Francisco Municipal Transportation Agency (SFMTA)',
    matchedStopCount: stationStopIds.size,
    services,
  };
}

export async function buildSchedule({ bartDir, muniDir, serviceDate }) {
  const [bart, muni] = await Promise.all([
    importAgencyFeed({ feedDir: bartDir, system: 'bart', serviceDate }),
    importAgencyFeed({ feedDir: muniDir, system: 'muni', serviceDate }),
  ]);
  const services = [...bart.services, ...muni.services];
  if (!services.length) throw new Error('No BART or Muni rail departures matched Civic Center / UN Plaza for this service date.');
  return {
    schemaVersion: 1,
    mode: 'gtfs-static',
    station: 'Civic Center / UN Plaza',
    timezone: 'America/Los_Angeles',
    serviceDate,
    generatedAt: new Date().toISOString(),
    sources: [
      { agency: bart.agency, feedType: 'GTFS static', matchedStationStops: bart.matchedStopCount },
      { agency: muni.agency, feedType: 'GTFS static', matchedStationStops: muni.matchedStopCount },
    ],
    attribution: 'BART and SFMTA GTFS static schedule data. Schedule departures are imported from stop_times.txt; vehicle movement, dwell times and passenger behavior remain simulated.',
    services,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.bart || !options.muni) {
    throw new Error('Usage: node scripts/import-gtfs.mjs --bart ./feeds/bart --muni ./feeds/muni [--date YYYY-MM-DD] [--out ./data/real-schedule.json]');
  }
  const serviceDate = String(options.date || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) throw new Error('The service date must use YYYY-MM-DD.');
  const schedule = await buildSchedule({
    bartDir: path.resolve(String(options.bart)),
    muniDir: path.resolve(String(options.muni)),
    serviceDate,
  });
  const output = path.resolve(String(options.out || './data/real-schedule.json'));
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(schedule, null, 2)}\n`, 'utf8');
  const departures = schedule.services.reduce((sum, service) => sum + service.departures.length, 0);
  process.stdout.write(`Wrote ${output}\n${schedule.services.length} service patterns · ${departures} scheduled departures · ${serviceDate}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
