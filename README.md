# Iceland Trip Planner · Sep 19–29, 2026

Interactive, single-file planner for a 10-night Ring Road + Snæfellsnes loop — stylized SVG map with a day-colored route ribbon, 51 plotted stops, collapsible day cards, a booking tracker, an aurora game plan, and field notes. No build step, no dependencies; the page works offline straight from disk.

## Quick start

```bash
open index.html          # macOS — or just double-click it
# or serve it:
npx serve .
```

## Repo layout

```
index.html          the entire app (markup + CSS + JS inline)
docs/itinerary.md   authoritative prose itinerary: day-by-day, hotels, bookings, notes
CLAUDE.md           project context for Claude Code
```

## Features

- **Map** — hand-projected Iceland coastline, per-day route segments in an aurora color spectrum, tooltips on every stop, tap-to-jump into the matching day card. Amber = book now, teal = soak, hollow = optional, numbered rings = overnight bases.
- **Day rail** — sticky selector that dims the map to a single day's leg.
- **Booking tracker** — the 9 priority reservations with a progress bar (in-memory for now; see backlog in `CLAUDE.md`).
- **Countdown** — flips to "Day X of 10" once the trip starts.
- **Print stylesheet** — expands everything for a glovebox copy.

## Deploy

- **GitHub Pages** — Settings → Pages → deploy from `main`, root.
- **Azure Static Web Apps** — app location `/`, no API, no build.

## Editing the trip

All trip data lives in the `DAYS` array in `index.html`; keep it in sync with `docs/itinerary.md`. Coordinates are `[lat, lon]` and the map is stylized — close is good enough.
