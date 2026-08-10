# CLAUDE.md

## What this is

Interactive trip planner for a 10-night family Ring Road + Snæfellsnes loop of Iceland, **Sep 19–29, 2026** (land KEF 10:00 Sep 19, depart 10:00 Sep 29). One HTML file plus a thin PWA shell — no build step, no dependencies. Works straight from disk (`file://`); installs and runs fully offline when served over http(s).

## Architecture

- **`index.html`** — all markup, CSS, and vanilla JS inline.
  - **Design tokens** live in `:root` (dark, the default) with a full override set under `:root[data-theme="light"]`. `--d1`…`--d10` is the per-day aurora color spectrum (green → rose, one hue per trip day) — it is an information system, not decoration; the light theme carries a darkened variant of the same spectrum for contrast. `--ember` marks bookable anchors, teal marks soaks. Font roles: serif display (`--serif`), quiet body (`--sans`), mono for dates/labels/data (`--mono`). All theme-sensitive colors are tokens — never reintroduce literals.
  - **Theme**: a pre-paint `<head>` script applies the stored choice (`localStorage` key `iceland26.theme`) or falls back to `prefers-color-scheme`; the top-bar toggle saves only on explicit click. SVG map colors are set as `var(--d{n})` via `style` properties (not resolved hex), so the map flips theme live without a rebuild — keep it that way.
  - **`DAYS` array is the single source of truth.** Shape: `{n, dow, date, km, title, base, baseLL:[lat,lon], hotels[], stops[]}` where each stop is `{name, ll:[lat,lon], note, tag}` and `tag` ∈ `book | soak | opt | undefined`. Map markers, route segments, day cards, rail pills, upgrade chips, per-stop Google Maps links, and `.ics` exports all render from it.
  - **Map**: hand-simplified `COAST` polygon (~85 points, clockwise from Reykjanestá) plus glacier ellipses, projected via equirectangular with a cos(65°) width correction (`px()`); `smoothPath()` converts point runs to Catmull-Rom → cubic bezier. Route segments are drawn per day, colored by `--d{n}`, and draw-animated via `pathLength`/dash-offset (disabled under `prefers-reduced-motion`). The map is stylized — do not treat coordinates as navigation-grade.
  - **Interactions** sync through `selectDay(n)`: day-rail pills ↔ dimming map layers ↔ auto-opening `<details>` day cards. Tooltip is a positioned div clamped to the map box. Booking tracker drives a progress bar and persists to `localStorage` key `iceland26.bookings` (JSON array of checked indices; all reads/writes wrapped in try/catch so `file://`-in-private-mode still works).
  - **Live Kp strip** in the aurora card fetches NOAA SWPC's `noaa-planetary-k-index-forecast.json` (CORS `*`). vedur.is sends no CORS headers (verified Aug 2026) so it is link-out only. On any fetch failure the strip stays `hidden` — offline degrades to the static routine.
  - **`.ics` export**: one all-day `VEVENT` per day card, built from `DAYS` with RFC 5545 escaping and octet-aware line folding, downloaded via Blob.
- **`sw.js`** — service worker. Navigations are network-first with cached `index.html` fallback; shell assets cache-first; cross-origin requests (NOAA) pass through untouched. Cache name `iceland26-v1` — **bump the version when changing cached shell files** so old caches are swept on activate. Registration is guarded to https/localhost, so `file://` use is unaffected.
- **`manifest.json`** + **`icons/`** — installable PWA identity (standalone, night-sky aurora icon; SVG source plus 192/512 PNGs rasterized from it).
- **`docs/itinerary.md`** — the authoritative prose itinerary (hotels per base, booking checklist, aurora plan, field notes). Keep `DAYS` consistent with it when either changes.

## History and constraints

Built originally as a Claude.ai artifact, where `localStorage`/`sessionStorage` are blocked — the booking tracker started as in-memory only. The full original backlog (persistence, PWA, map deep links, light theme, live Kp, `.ics` export) shipped in Aug 2026.

## Conventions

- Stay single-file-plus-PWA-shell and dependency-free unless there's a strong reason not to.
- Preserve accessibility floor: visible `:focus-visible` styles, keyboard-operable map stops (`Enter`/`Space`), `prefers-reduced-motion` respected, print stylesheet working (all `<details>` auto-expand on `beforeprint`; controls, map links, and the Kp strip hide in print).
- UI copy: sentence case, plain verbs, field-log tone. Mono face for anything data-like.
- CSS: flat selectors, tokens over literals; watch specificity collisions between `.day`/`.note` details variants. Print token overrides must target `:root[data-theme="light"]`/`[data-theme="dark"]` too, or the theme attribute out-specifies them.
- `localStorage` keys are namespaced `iceland26.*`.

## Backlog

Empty — the original six items shipped Aug 2026 (see Architecture). Candidate future ideas: a booking-tracker reset affordance, full-trip `.ics` in one file, tidal/sunrise times per day.

## Deploy

Any static host; all asset paths are relative so subpath hosting works (currently GitHub Pages → `harshalgajare.com/Iceland/`). GitHub Pages: serve repo root. Azure Static Web Apps: app location `/`, no API, no build step.
