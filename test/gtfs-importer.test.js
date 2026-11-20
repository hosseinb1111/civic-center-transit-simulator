import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseGtfsTime, serviceRunsOnDate } from '../scripts/import-gtfs.mjs';

test('CSV parser handles commas, quoted line breaks and escaped quotes', () => {
  const parsed = parseCsv('route_id,route_long_name,notes\nR1,"Market, Civic Center","Said ""hello"""\n');
  assert.equal(parsed[0].route_long_name, 'Market, Civic Center');
  assert.equal(parsed[0].notes, 'Said "hello"');
});

test('GTFS times support after-midnight service times', () => {
  assert.equal(parseGtfsTime('08:15:30'), 29730);
  assert.equal(parseGtfsTime('25:10:00'), 90600);
  assert.equal(parseGtfsTime('08:75:00'), null);
});

test('calendar exceptions override weekly service', () => {
  const calendar = [{ service_id: 'WEEKDAY', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: '20260101', end_date: '20261231' }];
  const exceptions = [
    { service_id: 'WEEKDAY', date: '20261120', exception_type: '2' },
    { service_id: 'WEEKDAY', date: '20261121', exception_type: '1' },
  ];
  assert.equal(serviceRunsOnDate('WEEKDAY', '2026-11-20', calendar, exceptions), false);
  assert.equal(serviceRunsOnDate('WEEKDAY', '2026-11-21', calendar, exceptions), true);
});

test('GTFS import selects station rail trips and produces feed-compatible service records', async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const { importAgencyFeed, buildSchedule } = await import('../scripts/import-gtfs.mjs');
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'civic-gtfs-test-'));
  const bartDir = path.join(tempRoot, 'bart');
  const muniDir = path.join(tempRoot, 'muni');
  await fs.mkdir(bartDir);
  await fs.mkdir(muniDir);

  async function writeFeed(directory, system) {
    const bart = system === 'bart';
    const route = bart
      ? 'route_id,agency_id,route_short_name,route_long_name,route_type,route_color,route_text_color\nY,BA,Yellow,Yellow Line,1,F7CF42,151A20\n'
      : 'route_id,agency_id,route_short_name,route_long_name,route_type,route_color,route_text_color\nJ,SM,J,J Church,0,C9935D,FFFFFF\n';
    const trip = bart
      ? 'route_id,service_id,trip_id,direction_id,trip_headsign\nY,WK,trip-yellow,0,Antioch\n'
      : 'route_id,service_id,trip_id,direction_id,trip_headsign\nJ,WK,trip-j,1,Balboa Park\n';
    await fs.writeFile(path.join(directory, 'stops.txt'), 'stop_id,stop_name,location_type,parent_station\nCCC,Civic Center / UN Plaza,1,\nPLAT,Platform,0,CCC\n');
    await fs.writeFile(path.join(directory, 'routes.txt'), route);
    await fs.writeFile(path.join(directory, 'trips.txt'), trip);
    await fs.writeFile(path.join(directory, 'stop_times.txt'), `trip_id,arrival_time,departure_time,stop_id,stop_sequence\n${bart ? 'trip-yellow' : 'trip-j'},08:00:00,08:00:30,PLAT,1\n`);
    await fs.writeFile(path.join(directory, 'calendar.txt'), 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,0,0,20260101,20261231\n');
    await fs.writeFile(path.join(directory, 'calendar_dates.txt'), 'service_id,date,exception_type\n');
  }

  try {
    await writeFeed(bartDir, 'bart');
    await writeFeed(muniDir, 'muni');
    const bart = await importAgencyFeed({ feedDir: bartDir, system: 'bart', serviceDate: '2026-11-20' });
    assert.equal(bart.services.length, 1);
    assert.equal(bart.services[0].departures[0], 28830);
    const combined = await buildSchedule({ bartDir, muniDir, serviceDate: '2026-11-20' });
    assert.equal(combined.mode, 'gtfs-static');
    assert.equal(combined.services.length, 2);
    assert.equal(combined.services.find((service) => service.system === 'muni').destination, 'Balboa Park');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
