# CLAUDE.md

## What this is

Single-file interactive trip planner for a 10-night family Ring Road + Snæfellsnes loop of Iceland, **Sep 19–29, 2026** (land KEF 10:00 Sep 19, depart 10:00 Sep 29). Everything ships in `index.html` — no build step, no dependencies, works offline straight from disk.

## Architecture

- **`index.html`** — all markup, CSS, and vanilla JS inline.
  - **Design tokens** live in `:root`. `--d1`…`--d10` is the per-day aurora color spectrum (green → rose, one hue per trip day) — it is an information system, not decoration. `--ember` marks bookable anchors, teal marks soaks. Font roles: serif display (`--serif`), quiet body (`--sans`), mono for dates/labels/data (`--mono`).
  - **`DAYS` array is the single source of truth.** Shape: `{n, dow, date, km, title, base, baseLL:[lat,lon], hotels[], stops[]}` where each stop is `{name, ll:[lat,lon], note, tag}` and `tag` ∈ `book | soak | opt | undefined`. Map markers, route segments, day cards, rail pills, and upgrade chips all render from it.
  - **Map**: hand-simplified `COAST` polygon (~85 points, clockwise from Reykjanestá) plus glacier ellipses, projected via equirectangular with a cos(65°) width correction (`px()`); `smoothPath()` converts point runs to Catmull-Rom → cubic bezier. Route segments are drawn per day, colored by `--d{n}`, and draw-animated via `pathLength`/dash-offset (disabled under `prefers-reduced-motion`). The map is stylized — do not treat coordinates as navigation-grade.
  - **Interactions** sync through `selectDay(n)`: day-rail pills ↔ dimming map layers ↔ auto-opening `<details>` day cards. Tooltip is a positioned div clamped to the map box. Booking tracker drives a progress bar.
- **`docs/itinerary.md`** — the authoritative prose itinerary (hotels per base, booking checklist, aurora plan, field notes). Keep `DAYS` consistent with it when either changes.

## History and constraints

Built originally as a Claude.ai artifact, where `localStorage`/`sessionStorage` are blocked — the booking tracker is therefore **in-memory only, on purpose**. Outside that sandbox the constraint is gone; persistence is the obvious first improvement.

## Conventions

- Stay single-file and dependency-free unless there's a strong reason not to.
- Preserve accessibility floor: visible `:focus-visible` styles, keyboard-operable map stops (`Enter`/`Space`), `prefers-reduced-motion` respected, print stylesheet working (all `<details>` auto-expand on `beforeprint`).
- UI copy: sentence case, plain verbs, field-log tone. Mono face for anything data-like.
- CSS: flat selectors, tokens over literals; watch specificity collisions between `.day`/`.note` details variants.

## Backlog (rough priority)

1. Persist booking-tracker state in `localStorage` (key `iceland26.bookings`, JSON array of indices).
2. PWA: `manifest.json` + tiny service worker → full offline on the Ring Road.
3. Per-stop map deep links: `https://www.google.com/maps/search/?api=1&query={lat},{lon}`.
4. Light theme + toggle (print palette is a head start).
5. Live aurora/cloud snippet from vedur.is — verify CORS first; must degrade gracefully offline.
6. Per-day `.ics` export.

## Deploy

Any static host. GitHub Pages: serve repo root. Azure Static Web Apps: app location `/`, no API, no build step.
