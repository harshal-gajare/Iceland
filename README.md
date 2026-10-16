# Iceland Ring Road Field Plan · Sep 19–29

A ready-made, family-friendly 10-night Ring Road + Snæfellsnes loop, counterclockwise from Keflavík — 52 timed stops over a stylized SVG map with a day-colored route ribbon, run-sheets with drive legs, a meal/fuel/grocery card per day, where to stay each night, the tours worth booking ahead, emergency numbers, an aurora game plan with live Kp, and a daily-watch source list. It was driven for real in September 2026 and is shared as a template: copy it, shift the dates, swap the stays. No build step, no dependencies; the page works straight from disk, and served over http(s) it installs as an offline-capable PWA.

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
docs/iceland-2026.kml         Google My Maps / Earth import — generated
tools/build-itinerary.mjs     regenerates that doc from TRIP (no deps)
tools/build-kml.mjs           regenerates the KML from TRIP (no deps)
tools/route-cache.json        road geometry per leg — committed, so builds stay offline
CLAUDE.md                     project context for Claude Code
```

There is no build step for the app itself — `index.html` ships as written. The
one tool is the docs generator:

```bash
node tools/build-itinerary.mjs           # rewrite docs/itinerary.md
node tools/build-itinerary.mjs --check   # exit 1 if it's stale
node tools/build-kml.mjs                 # rewrite the KML from cached routes
node tools/build-kml.mjs --route         # re-fetch road geometry, then rewrite
node tools/build-kml.mjs --check         # exit 1 if it's stale
```

## Features

- **Two map views** — a `Real map` toggle swaps the stylized map for a Google My Maps embed carrying every stop, base and day leg. It loads lazily and only when there is a network, because a Google map cannot be cached for offline use and a cross-origin frame that fails cannot be detected from the page; with no signal you keep the stylized map and get told why. Point it at your own map by running `node tools/build-kml.mjs`, importing `docs/iceland-2026.kml` into My Maps, and pasting the `mid=` into `MYMAP_MID`.
- **Map** — hand-projected Iceland coastline, per-day route segments in an aurora color spectrum, tooltips on every stop, tap-to-jump into the matching day card. Amber = timed booking, teal = walk-in soak, hollow = optional, numbered rings = overnight bases.
- **Day rail** — sticky selector that dims the map to a single day's leg.
- **Day cards** — timed run-sheets in driving order with drive legs between stops and **Google + Apple Maps links on every stop**.
- **Photo notes** — most stops carry the specific photograph worth taking there, with an image-search link for reference shots.
- **Where to stay** — each night names a tested place with its address, room options, check-in hours and map links.
- **Book ahead** — every bed and timed tour in date order, with phone numbers and cancellation terms where the operator publishes them. Lodging rows are derived from the same stay records the day cards use, so the two can't drift apart.
- **Emergency** — 112 and the 112 app, health line, after-hours doctor, poison centre, ICE-SAR, road and weather authorities, and a reminder to look up your own embassy.
- **Car hire** — what to rent, which insurance cover this route wants, the one F-road on day 10, and the return-day math for a late-afternoon flight.
- **Dark & light themes** — toggle in the top bar, follows system preference by default, remembered per browser.
- **Live aurora data** — current Kp and the next-24h peak from NOAA SWPC, with a link to vedur.is for cloud cover (vedur.is itself blocks CORS). Vanishes gracefully offline.
- **The daily watch** — the morning weather/roads stack and evening aurora stack locals actually use, plus the moon caveat.
- **Offline / PWA** — service worker caches the app shell; installable to a phone home screen for the road.
- **Print stylesheet** — expands everything for a glovebox copy.

## Deploy

- **GitHub Pages** — Settings → Pages → deploy from `main`, root (current setup).
- **Azure Static Web Apps** — app location `/`, no API, no build.

When shell files change, bump the `CACHE` version in `sw.js` so clients pick up the new assets.

## Editing the trip

All trip data lives in the `TRIP` object in `index.html` — one flat `DAYS` array, days 1 to 10. Coordinates are `[lat, lon]` and the map is stylized — close is good enough. Map links are generated from the same data.

`docs/itinerary.md` is generated from `TRIP` — run `node tools/build-itinerary.mjs` after an itinerary change rather than editing the doc by hand. Its prose sections are transcribed inside the generator, so page copy and doc copy need editing together.
