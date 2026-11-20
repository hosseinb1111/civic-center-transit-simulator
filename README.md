# Civic Center / UN Plaza — BART & Muni Operations Simulator

An interactive, single-page cutaway simulator of **Civic Center / UN Plaza** station in San Francisco. Watch BART and Muni Metro trains arrive, dwell and depart while passengers move between the street, fare concourse and platforms.

The simulator is a static site built with plain HTML, CSS and JavaScript. It has no build step or package dependencies. The interface loads the Archivo font from Google Fonts; if that service is unavailable, the browser uses its fallback font.

> **Note:** Station geometry and the route set are modeled from public BART/SFMTA station information. Departures, headways, passenger counts and dwell times are **synthetic and illustrative**. This is not a real-time transit service or operational planning tool.

## Features

- Four-level cutaway: street, fare concourse, Muni Metro platform and BART platform
- BART Yellow, Red, Orange and Blue lines plus Muni J, K, L, M and N, in both directions
- Rush-hour vs. off-peak headways (peaks at 06:30–09:30 and 16:00–19:00)
- Door cycles, platform LED boards, dwell times and occasional small delays
- Live telemetry (trains dwelling, passengers waiting, boarded and departed), a next-trains board and a rolling station log
- Responsive layout for desktop and mobile

## Controls

| Input | Action |
| --- | --- |
| `Space` or **Pause / Resume** | Pause or resume the simulation |
| `1`, `2`, `4`, `8` or speed buttons | Set simulation speed |
| Time buttons (06:30, 08:00, 12:00, 17:30, 22:00) | Jump to that time of day and reset the platforms |

## Run locally

Open `index.html` in a modern browser, or serve the project folder with a local web server:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.

The site will be published at <https://hosseinb1111.github.io/civic-center-transit-simulator/>.

## How it works

- `SERVICES` lists each line and direction with a staggered offset. `headway()` returns the interval for the current period, and `nextArrival[]` tracks the next spawn time per service.
- `Train` runs a small state machine: `approach` → `dwell` (doors open, passengers alight and board) → `depart`.
- `Person` agents follow waypoint paths through the elevator shafts to the platforms and wait for a matching train.
- Capacity limits (`MAX_TRAINS`, `MAX_PAX`) keep the canvas smooth.
- The HUD refreshes about every 120 ms, independently of the render loop.

## Project structure

```text
.
├── index.html   # page markup and canvas
├── styles.css   # layout and visual styling
├── script.js    # simulation and interaction logic
└── README.md
```

## Ideas for future work

- Real GTFS schedule data in place of synthetic headways
- Service disruption scenarios (power faults, single-tracking, crowding events)
- Adjustable passenger demand and train lengths
- Saving and sharing a simulation time and speed through the URL

## Author

Created with ❤️ & ☕ by [Hossein Seyed Bagheri](https://github.com/hosseinb1111).
