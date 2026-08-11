# Iceland Trip Planner · Sep 19–29, 2026

Interactive planner for a 10-night family Ring Road + Snæfellsnes loop — **two switchable itineraries** (Plan A classic coast, 51 stops; Plan B highland edition, 53 stops) over a stylized SVG map with a day-colored route ribbon, timed run-sheets with drive legs, confirmed-booking cards, a per-plan booking tracker, an aurora game plan with live Kp, and a daily-watch source list. No build step, no dependencies; the page works straight from disk, and served over http(s) it installs as an offline-capable PWA.

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
docs/itinerary.md             prose itinerary for both plans — generated
tools/build-itinerary.mjs     regenerates that doc from PLANS (no deps)
CLAUDE.md                     project context for Claude Code
```

There is no build step for the app itself — `index.html` ships as written. The
one tool is the docs generator:

```bash
node tools/build-itinerary.mjs           # rewrite docs/itinerary.md
node tools/build-itinerary.mjs --check   # exit 1 if it's stale
```

## Features

- **Two plans behind tabs** — Plan A runs the classic coast (Katla ice cave, Höfn night 4, any automatic SUV); Plan B folds in the highlands (Gjáin + Háifoss, a full Landmannalaugar day with a weather-gated fallback, Aldeyjarfoss) and needs an F-road-legal 4x4. Same flights, same car, same first three nights. Switching re-renders the map, cards, upgrade chips, booking list and hero stats.
- **Map** — hand-projected Iceland coastline, per-day route segments in an aurora color spectrum, tooltips on every stop, tap-to-jump into the matching day card. Amber = timed booking, teal = walk-in soak, hollow = optional, numbered rings = overnight bases.
- **Day rail** — sticky selector that dims the map to a single day's leg.
- **Day cards** — timed run-sheets in driving order with drive legs between stops, **Google + Apple Maps links on every stop**, and a per-day **add-to-calendar (.ics)** export.
- **Booked stays** — nights 1–3 render as confirmed cards with addresses and cancellation terms; unbooked nights show budget picks that open a Maps search.
- **Booking tracker** — the priority reservations per plan with a progress bar; state **persists in `localStorage`, separately for each plan**.
- **Locked in** — flights, baggage, visa, the rental with its insurance chips, return-day math, and the one F-road email that unlocks Plan B.
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

All trip data lives in the `PLANS` object in `index.html`; days 1, 6, 8, 9 and 10 are shared *by reference* between the two plans, so editing one edits both — and nothing may mutate a day object at runtime. Coordinates are `[lat, lon]` and the map is stylized — close is good enough. Map links and `.ics` files are generated from the same data.

`docs/itinerary.md` is generated from `PLANS` — run `node tools/build-itinerary.mjs` after an itinerary change rather than editing the doc by hand. Its prose sections are transcribed inside the generator, so page copy and doc copy need editing together.
