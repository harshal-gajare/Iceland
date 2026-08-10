# Iceland Trip Planner · Sep 19–29, 2026

Interactive planner for a 10-night Ring Road + Snæfellsnes loop — stylized SVG map with a day-colored route ribbon, 51 plotted stops, collapsible day cards, a booking tracker, an aurora game plan, and field notes. No build step, no dependencies; the page works straight from disk, and served over http(s) it installs as an offline-capable PWA.

**Live:** [harshalgajare.com/Iceland](https://harshalgajare.com/Iceland/)

## Quick start

```bash
open index.html          # macOS — or just double-click it
# or serve it (enables the service worker + install):
npx serve .
```

## Repo layout

```
index.html          the entire app (markup + CSS + JS inline)
sw.js               service worker — offline caching for the Ring Road
manifest.json       PWA manifest (installable, standalone)
icons/              app icon (SVG source + rasterized PNGs)
docs/itinerary.md   authoritative prose itinerary: day-by-day, hotels, bookings, notes
CLAUDE.md           project context for Claude Code
```

## Features

- **Map** — hand-projected Iceland coastline, per-day route segments in an aurora color spectrum, tooltips on every stop, tap-to-jump into the matching day card. Amber = book now, teal = soak, hollow = optional, numbered rings = overnight bases.
- **Day rail** — sticky selector that dims the map to a single day's leg.
- **Day cards** — stops in driving order with a **Google Maps link on every stop** and a per-day **add-to-calendar (.ics)** export.
- **Booking tracker** — the 9 priority reservations with a progress bar; state **persists in `localStorage`** across reloads.
- **Dark & light themes** — toggle in the top bar, follows system preference by default, remembered per browser.
- **Live aurora data** — current Kp and the next-24h peak from NOAA SWPC, with a link to vedur.is for cloud cover (vedur.is itself blocks CORS). Vanishes gracefully offline.
- **Offline / PWA** — service worker caches the app shell; installable to a phone home screen for the road.
- **Countdown** — flips to "Day X of 10" once the trip starts.
- **Print stylesheet** — expands everything for a glovebox copy.

## Deploy

- **GitHub Pages** — Settings → Pages → deploy from `main`, root (current setup).
- **Azure Static Web Apps** — app location `/`, no API, no build.

When shell files change, bump the `CACHE` version in `sw.js` so clients pick up the new assets.

## Editing the trip

All trip data lives in the `DAYS` array in `index.html`; keep it in sync with `docs/itinerary.md`. Coordinates are `[lat, lon]` and the map is stylized — close is good enough. Map links and `.ics` files are generated from the same array.
