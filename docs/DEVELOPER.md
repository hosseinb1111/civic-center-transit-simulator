# Developer guide

## Architecture

The browser runtime is dependency-free ES modules. `src/main.js` loads the JSON configuration and an optional imported GTFS schedule, then constructs the simulation engine, canvas renderer and UI controller.

- `src/config.js` contains scene geometry, palettes and pure helpers for timetable periods, headways, ETA labels and passenger waypoints.
- `src/simulation.js` owns the clock, service table, timetable advancement, disruption presets, passenger entry/alighting and station telemetry.
- `src/agents.js` contains the `Train` and `Passenger` state machines. Dependencies are injected by the simulation engine.
- `src/rendering.js` draws the station and agents on the canvas. It reads simulation state and does not update it.
- `src/ui.js` owns accessible controls, the text summary, URL state, theme, HUD, schedule board and animation loop.
- `data/config.json` owns route definitions, headways, dwell ranges, passenger demand, simulation limits, peak periods, service offsets and disruption presets.
- `scripts/import-gtfs.mjs` converts two extracted GTFS static feeds into `data/real-schedule.json`.

## Coordinate system

The station drawing uses a fixed world coordinate system of **1440 × 920 units**. The origin `(0, 0)` is the upper-left corner, positive X moves right, and positive Y moves down. Platform Y coordinates, shafts, gates, columns and entrances are expressed in these world units in `src/config.js`.

The renderer computes one uniform scale factor from the canvas element's CSS dimensions and centers the world using X/Y offsets. Device-pixel ratio is applied to the backing canvas, capped at 2, while all drawing calls continue to use world coordinates. Passenger route waypoints also use this same coordinate system.

## Simulation state transitions

A train follows this state machine:

`approach → dwell → depart → removed`

`approach` interpolates the train from outside the station to the platform. `dwell` opens the doors, produces alighting passengers and assigns matching waiting passengers to board. `depart` moves the train out of the scene. The timetable records the scheduled platform time separately from the visual approach time.

A passenger follows one of these flows:

- Entering: `street → fare concourse → platform → waiting → boarding → removed`.
- Alighting: `train → platform → concourse → street → exit → removed`.

Walking behavior is waypoint based. `buildEntryPath()` and `buildExitPath()` are pure helpers, so their coordinate transitions can be tested without a browser or canvas.

## Simulation timing

The animation loop receives a browser animation-frame timestamp. Real elapsed time is capped at 50 ms per frame to prevent a long background-tab pause from creating one enormous update. Simulated elapsed time is `realDelta × speed`; supported speed factors are 1×, 2×, 4× and 8×. The HUD refreshes independently at approximately 120 ms intervals.

Illustrative mode advances each service by its configured peak/off-peak headway. A disruption's headway multiplier is applied when the next departure is calculated. Real schedule mode instead reads the next departure directly from each imported GTFS `stop_times.txt` record. GTFS does not contain the detailed visual dwell behavior used here, so the configured dwell ranges and passenger movement remain simulated in either mode.

## Configuration

Edit `data/config.json` to change:

- `lines`: route names, colors, car ranges, termini and peak/off-peak headways.
- `services`: route directions and staggered illustrative offsets.
- `simulation.dwellSeconds`: minimum/maximum dwell duration by system.
- `simulation.entryRatePerSecond`: off-peak and peak passenger arrival rates.
- `simulation.peakPeriods` and `simulation.periods`: clock ranges.
- `scenarios`: headway, dwell and passenger-demand multipliers.

All timetable times are seconds after local midnight at the station. The schedule importer uses the `America/Los_Angeles` station timezone and stores GTFS times as seconds after midnight. It preserves GTFS times after 24:00, as required for some after-midnight trips. GTFS `direction_id` is route-specific, so the importer retains the original `directionId` and maps `0`/`1` to the simulator’s visual A/B travel lanes; the imported `trip_headsign` remains the destination label shown to the user.

## GTFS import schema

The importer accepts **unpacked GTFS static feed directories**. Each directory must contain `stops.txt`, `routes.txt`, `trips.txt` and `stop_times.txt`; `calendar.txt` and `calendar_dates.txt` are used when present. It selects BART subway routes and Muni Metro J/K/L/M/N light-rail routes serving stops whose names or parent stations identify Civic Center / UN Plaza.

Run:

```bash
npm run gtfs:import -- --bart ./feeds/bart --muni ./feeds/muni --date 2026-11-20
```

The output is `data/real-schedule.json`. The app enables **Real schedule** only when that file is present and contains usable services. The output records the schedule date and source agencies. Re-run the import whenever the agencies publish a new feed or when selecting a different service date.

Official feed locations and terms:

- BART GTFS static: <https://www.bart.gov/schedules/developers/gtfs> and <https://www.bart.gov/dev/schedules/google_transit.zip>.
- SFMTA GTFS static: <https://www.sfmta.com/reports/gtfs-transit-data> and <https://muni-gtfs.apps.sfmta.com/data/muni_gtfs-current.zip>.

Review and comply with each agency's current license before redistributing feed-derived data. The SFMTA feed requires its stated attribution and disclaimer language; the BART developer page links its developer license agreement. The app labels these records as **GTFS static**, never as real-time arrivals.

## Accessibility and sharing

The canvas has an associated live text summary of current train and passenger activity. The summary is useful without interpreting line colors or watching the animation. Route labels also appear as text; BART route badges are square and Muni badges are rounded/dashed. Controls are native buttons and selects with visible focus outlines and keyboard support.

When `prefers-reduced-motion: reduce` is enabled, the simulator starts paused. The user can explicitly resume motion. Decorative CSS motion is disabled by the reduced-motion media query.

The URL stores `time`, `speed`, `theme`, `mode` and `scenario` when a control changes or the user shares the link. The share action first writes the current state into the address bar, then copies that URL when clipboard permission is available.
