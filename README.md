# Iceland Trip Planner · Sep 19–29, 2026

On-the-road reference for a 10-night family Ring Road + Snæfellsnes loop — 51 timed stops over a stylized SVG map with a day-colored route ribbon, run-sheets with drive legs, a meal/fuel/grocery card per day, a reservations reference, emergency numbers, an aurora game plan with live Kp, and a daily-watch source list. No build step, no dependencies; the page works straight from disk, and served over http(s) it installs as an offline-capable PWA.

**Live:** [harshalgajare.com/Iceland](https://harshalgajare.com/Iceland/)

## Quick start

```bash
open index.html          # macOS — or just double-click it
# or serve it (enables the service worker + install):
npx serve .
```

## Repo layout

```
index.html                    the entire app (markup + CSS + JS inline)
sw.js                         service worker — offline caching for the Ring Road
manifest.json                 PWA manifest (installable, standalone)
icons/                        app icon (SVG source + rasterized PNGs)
docs/itinerary.md             prose itinerary — generated
tools/build-itinerary.mjs     regenerates that doc from TRIP (no deps)
CLAUDE.md                     project context for Claude Code
```

There is no build step for the app itself — `index.html` ships as written. The
one tool is the docs generator:

```bash
node tools/build-itinerary.mjs           # rewrite docs/itinerary.md
node tools/build-itinerary.mjs --check   # exit 1 if it's stale
```

## Features

- **Map** — hand-projected Iceland coastline, per-day route segments in an aurora color spectrum, tooltips on every stop, tap-to-jump into the matching day card. Amber = timed booking, teal = walk-in soak, hollow = optional, numbered rings = overnight bases.
- **Day rail** — sticky selector that dims the map to a single day's leg.
- **Day cards** — timed run-sheets in driving order with drive legs between stops and **Google + Apple Maps links on every stop**.
- **Daylight per day** — sunrise, sunset and the length of the light window, computed from each day's own coordinates (sunrise where you wake, sunset where you land) rather than one number for the whole country: the bases span ~9° of longitude, which is 35 minutes of solar time. Flat sea horizon, so Iceland's mountains take a bigger bite.
- **Booked stays** — every confirmed night renders as a card with its address, terms and map links; unbooked nights show budget picks that open a Maps search.
- **Reservations** — every booking in date order with its reference, phone and cancellation terms. Lodging rows are derived from the same stay records the day cards use, so the two can't drift apart.
- **Emergency** — 112 and the 112 app, health line, after-hours doctor, poison centre, ICE-SAR, road and weather authorities, embassy.
- **Locked in** — flights, baggage, visa, the rental with its insurance chips, return-day math, and the one F-road email that day 10's glacier tour depends on.
- **Dark & light themes** — toggle in the top bar, follows system preference by default, remembered per browser.
- **Live aurora data** — current Kp and the next-24h peak from NOAA SWPC, with a link to vedur.is for cloud cover (vedur.is itself blocks CORS). Vanishes gracefully offline.
- **The daily watch** — the morning weather/roads stack and evening aurora stack locals actually use, plus the full-moon caveat.
- **Offline / PWA** — service worker caches the app shell; installable to a phone home screen for the road.
- **Countdown** — flips to "Day X of 10" once the trip starts.
- **Print stylesheet** — expands everything for a glovebox copy.

## Deploy

- **GitHub Pages** — Settings → Pages → deploy from `main`, root (current setup).
- **Azure Static Web Apps** — app location `/`, no API, no build.

When shell files change, bump the `CACHE` version in `sw.js` so clients pick up the new assets.

## Editing the trip

All trip data lives in the `TRIP` object in `index.html` — one flat `DAYS` array, days 1 to 10. Coordinates are `[lat, lon]` and the map is stylized — close is good enough, though `baseLL` also drives each day's sunrise/sunset, which are real to the minute. Map links and daylight are both generated from the same data.

`docs/itinerary.md` is generated from `TRIP` — run `node tools/build-itinerary.mjs` after an itinerary change rather than editing the doc by hand. Its prose sections are transcribed inside the generator, so page copy and doc copy need editing together.
