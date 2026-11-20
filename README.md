# Civic Center / UN Plaza — BART & Muni Operations Simulator

An interactive four-level cutaway simulator of **Civic Center / UN Plaza** in San Francisco. Watch BART and Muni trains approach, dwell and depart while passengers move between the street, fare concourse and platforms.

The browser runtime uses plain HTML, CSS and dependency-free JavaScript ES modules. Route definitions, illustrative headways, dwell ranges, passenger demand and disruption presets are configurable in JSON. No bundler or runtime package dependencies are required.

## Schedule modes

The simulator has two explicitly labeled modes:

- **Illustrative** uses synthetic departures, passenger demand, dwell times and occasional delays. It works immediately and is useful for exploring the visual simulation.
- **Real schedule** uses static schedule departures imported from BART and SFMTA GTFS feeds. It is available after `data/real-schedule.json` has been generated. Only the timetable comes from GTFS; train movement, passenger behavior and dwell times remain simulated. GTFS static is not real-time vehicle tracking.

No timetable has been mislabeled as real: this project archive does not include a downloaded GTFS feed snapshot. The importer below creates that file locally from current official feeds.

## Features

- Four-level station cutaway: street, fare concourse, Muni Metro and BART platforms
- BART Yellow, Red, Orange and Blue lines plus Muni Metro J, K, L, M and N
- JSON-configurable routes, headways, dwell ranges, passenger demand and peak periods
- Disruption presets for single-tracking and platform crowding
- Train door cycles, platform boards, passenger agents and a rolling station log
- Accessible text-only station activity summary, text route labels and keyboard controls
- Reduced-motion default pause, light/dark themes and visible focus states
- Shareable URL state for time, speed, theme, schedule mode and disruption scenario
- Reset and replay controls
- Unit tests, static-server smoke test and CI validation

## Run locally

Use a local static server because the application loads JSON and ES modules with `fetch`:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>.

## Enable real GTFS schedule mode

Download the official static feeds and extract them into separate directories. For example:

```bash
mkdir -p feeds/bart feeds/muni
curl -L https://www.bart.gov/dev/schedules/google_transit.zip -o /tmp/bart-gtfs.zip
curl -L https://muni-gtfs.apps.sfmta.com/data/muni_gtfs-current.zip -o /tmp/muni-gtfs.zip
unzip -o /tmp/bart-gtfs.zip -d feeds/bart
unzip -o /tmp/muni-gtfs.zip -d feeds/muni
```

On Windows PowerShell, download each ZIP in a browser and use `Expand-Archive` to extract it.

Then run the importer with a service date covered by both feeds:

```bash
npm run gtfs:import -- --bart ./feeds/bart --muni ./feeds/muni --date 2026-11-20
```

The importer reads `stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt`, and the service calendar files. It finds Civic Center / UN Plaza station stops, selects BART subway services and Muni Metro J/K/L/M/N light-rail services, applies the GTFS calendar and exceptions for the requested date, and writes `data/real-schedule.json`.

The app detects that file at startup and enables **Real schedule** in the Schedule mode selector. The file is generated locally and is not included in this source archive. Review and comply with current BART and SFMTA licensing terms before redistributing any feed-derived schedule data. SFMTA has specific attribution/disclaimer requirements.

Official sources:

- [BART GTFS schedules and developer terms](https://www.bart.gov/schedules/developers/gtfs)
- [SFMTA GTFS data and license](https://www.sfmta.com/reports/gtfs-transit-data)
- [Current SFMTA GTFS static ZIP](https://muni-gtfs.apps.sfmta.com/data/muni_gtfs-current.zip)

## Controls

| Input | Action |
| --- | --- |
| `Space` or Pause / Resume | Pause or resume |
| `1`, `2`, `4`, `8` or speed buttons | Set simulation speed |
| Time buttons | Jump to 06:30, 08:00, 12:00, 17:30 or 22:00 |
| Schedule mode | Switch between Illustrative and imported Real schedule |
| Disruption | Change normal service, single-tracking or platform crowding |
| Reset | Restore the default illustrative setup |
| Replay | Restart the current mode/scenario at the default simulation time |
| Share link | Copy current time, speed, theme, mode and scenario into a URL |

## Tests and validation

Node.js 20 or newer is recommended. There are no external packages to install.

```bash
npm test
npm run validate
npm run smoke
```

`npm test` runs pure-function, timetable, passenger-routing, GTFS parsing and simulation-engine tests. `npm run validate` checks JavaScript syntax, JSON configuration, required HTML IDs and CSS brace balance. `npm run smoke` starts a local HTTP server and verifies that the app and its modules/config are served successfully.

## Project structure

```text
.
├── data/
│   └── config.json              # routes, services, headways, dwell, demand, scenarios
├── docs/
│   └── DEVELOPER.md             # architecture, coordinate system and timing guide
├── scripts/
│   ├── import-gtfs.mjs          # GTFS static CSV importer
│   ├── smoke-test.mjs           # static-server smoke test
│   └── validate.mjs             # source/config/markup validation
├── src/
│   ├── config.js                # geometry, palettes and pure helpers
│   ├── agents.js                # train/passenger state machines
│   ├── simulation.js            # timetable, simulation state and scenarios
│   ├── rendering.js              # canvas renderer
│   ├── ui.js                    # controls, HUD, sharing and animation loop
│   └── main.js                  # application bootstrap
├── test/
│   ├── config.test.js
│   ├── gtfs-importer.test.js
│   └── simulation.test.js
├── index.html
├── styles.css
└── package.json
```

For implementation details, see [docs/DEVELOPER.md](docs/DEVELOPER.md).

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages**.
3. Choose **Deploy from a branch**, select `main` and `/ (root)`, then save.

The project is static and can be hosted from the repository root.

## Author

Created with ❤️ & ☕ by [Hossein Seyed Bagheri](https://github.com/hosseinb1111).
