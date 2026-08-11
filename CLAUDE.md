# CLAUDE.md

## What this is
Single-file interactive trip planner for a 10-night family (3 people, one 11-year-old) Ring Road + Snæfellsnes loop of Iceland, Sep 19–29 2026. Two selectable itineraries — Plan A (classic coast) and Plan B (highland edition) — behind tabs. Everything ships in `index.html` plus a thin PWA shell: no build step, no dependencies, works from disk (`file://`) and installs offline over http(s).

## Architecture
- `index.html` — all markup, CSS, vanilla JS inline.
- **`PLANS` registry is the single source of truth.** `PLANS.classic` and `PLANS.highland` each carry: `label`, `desc`, `days[]`, `upgrades[]` (chip label + day number), `bookings[]` (label + meta), `stats` (km/stops/soaks/flex; `stops` is computed by reduce, `flex` is raw HTML injected with innerHTML).
- **Shared day objects (`DAY1`, `D5TO10`) are reused across plans by reference — edit them once.** Days **1, 6, 8, 9, 10** are the *same objects* in both plans (as are `STAY2`/`STAY3`); days 2, 3, 4, 5, 7 are plan-specific literals. Note `D5TO10` is a misnomer: it holds days 6, 8, 9, 10. **Nothing may mutate a day object** — no in-place `.sort()`, no normalizing, no memoizing onto `d` — or it corrupts the other plan. `dayICS()` is deliberately a pure reader.
- **Day shape:** `{n, dow, date, km, depart, arrive, title, base, baseLL:[lat,lon], stay?|hotels[], note?, stops[]}`. A `stay` object (`{name, addr, ll, q, status}`) marks a confirmed booking and renders the green Booked card (`q: null` falls back to lat/lon map links); `hotels[]` renders budget-pick chips linking to Google Maps searches. `note` renders as the amber day-level callout (weather gates, alternatives).
- **Stop shape:** `{name, ll:[lat,lon], time, drive?, tag?, note}`. `tag` ∈ `book | soak | opt`. `drive` renders the dashed connector ("drive 45 min") before the stop. Every stop gets Google (`gLL`) and Apple (`aLL`) map links.
- **Map:** static layer built once (`buildMapStatic`: hand-simplified `COAST` polygon, glacier ellipses, KEF pulse) + dynamic layer per plan (`buildMapDynamic`: routes + stop/base markers inside `#dyn`, replaced on plan switch). Equirectangular projection with cos(65°) correction (`px()`); `smoothPath()` is Catmull-Rom → cubic bezier. Stylized — not navigation-grade.
- **Map colors must stay `var(--d{n})`, never resolved hex** (`dayVar()`), so the map flips theme live without a rebuild. They must be assigned via `.style.stroke`/`.style.fill`, **never as SVG presentation attributes** — `stroke="var(--d3)"` is invalid as an attribute and silently falls back to initial (invisible routes, black markers).
- **Sync:** `switchPlan(key, userAction)` re-renders dyn map, rail, cards, upgrades, bookings, hero stats (`#st-km/#st-stops/#st-soak/#st-flex`) and plan description, then resets to "all days"; `selectDay(n)` syncs rail pills ↔ map dimming ↔ auto-opened `<details>` cards. `buildRail()` reads the **active** plan and must be re-run on switch.
- **Persistence** (`localStorage`, all reads/writes try/catch'd so `file://` private mode still works): `iceland26.theme`, `iceland26.plan`, and per-plan booking ticks in `iceland26.bk.classic` / `iceland26.bk.highland`. `bkState` holds the live Sets; ticks are stored as a JSON array of **indices**, clamped per plan, so reordering a `bookings` array mis-restores old ticks. The plan key is restored *before* the top-level `let DAYS = PLANS[planKey].days` binding — restoring later leaves every builder on classic data. Saving happens **only** in the checkbox `change` handler, never in `updateProgress()`, which also runs during `switchPlan()` and would write one plan's ticks into the other's key.
- **Theme:** pre-paint `<head>` script applies the stored choice or `prefers-color-scheme`; the top-bar toggle saves only on explicit click. Design tokens live in `:root` with a full override set under `:root[data-theme="light"]`.
- **`.ics` export:** one timed `VEVENT` per day card spanning `depart`→`arrive`, `TZID=Atlantic/Reykjavik` with an inline `VTIMEZONE` (Iceland is UTC+0 year-round, no DST), falling back to an all-day event when a day has no parseable times (days 1 and 10). RFC 5545 escaping, octet-aware folding, Blob download. **UIDs are plan-scoped only for days that differ between plans** — shared days share a UID so importing both plans dedupes them, while divergent days must not collide or Plan B silently overwrites Plan A. The shared set is computed by **content** comparison, not reference identity, so a future deep-copy degrades to duplicates rather than to silent overwrite.
- **Live Kp strip** in the aurora card fetches NOAA SWPC's `noaa-planetary-k-index-forecast.json` (CORS `*`, so it works from `file://` too). vedur.is sends no CORS headers so it is link-out only. On any failure the strip stays `hidden` — never give `.kpline` a `display` property, or `[hidden]` stops working and an empty strip renders on every failure.
- **`sw.js`** — navigations network-first with cached `index.html` fallback; shell assets cache-first; cross-origin (NOAA) passes through untouched. Cache name `iceland26-v2` — **bump the version when changing cached shell files.** Registration is guarded to https/localhost, so `file://` use is unaffected.
- **`manifest.json`** + **`icons/`** — installable PWA identity (standalone, night-sky aurora icon).
- Sections: hero (countdown to ATL 18:45 Sep 18), plan tabs, map, sticky day rail, day cards, booking tracker, "Locked in" logistics (flights PNR CVYKHM, Blue Car #Z04F2O), aurora game plan, "The daily watch" resources, field notes, footer.
- **`docs/itinerary.md`** is generated from `PLANS` — day tables, base tables and booking checklists come straight out of the data, with the prose sections transcribed from the static HTML. Regenerate it when the itinerary changes.

## History and constraints
Built in Claude.ai artifacts, where `localStorage`/`sessionStorage` are blocked — the tracker started in-memory out of necessity. Outside that sandbox the constraint is gone, and persistence, PWA/offline, light theme, live Kp and `.ics` export all shipped (Aug 2026).

## Conventions
- Stay single-file plus PWA shell and dependency-free unless there's a strong reason not to.
- Design tokens in `:root`; `--d1..--d10` day spectrum is an information system, not decoration; `--ember` = bookable, teal = soak. All theme-sensitive colors are tokens — never reintroduce literals. Deliberate exceptions kept literal: the soak teal, chip inks, the aurora border gradient, and the low-alpha green/amber tints.
- **Legend labels describe marker rules; statline numbers are trip facts.** Amber = "reserve ahead" (every `tag:"book"` stop), teal = "walk-in soak" (`tag:"soak"`). The hero's "2 anchor tours" and "4 soak options" come from `docs/itinerary.md`, and two of the four soaks are tagged `book` because they need reserving. Keep the two vocabularies disjoint — don't "reconcile" them into one count.
- Preserve accessibility floor: visible `:focus-visible` styles, keyboard-operable map stops (`Enter`/`Space`), `prefers-reduced-motion` respected, print stylesheet working (all `<details>` auto-expand on `beforeprint`; controls, plan tabs, map links and the Kp strip hide in print).
- CSS: flat selectors, tokens over literals; watch specificity collisions. Two live examples: the day-dimming rule needs `#icemap .route path.dim` because a bare `#icemap .dim` loses to `#icemap .route path`; and print token overrides must target `:root[data-theme="light"]`/`[data-theme="dark"]` too, or the theme attribute out-specifies them.
- UI copy: sentence case, plain verbs, field-log tone. Mono face for anything data-like.
- `localStorage` keys are namespaced `iceland26.*`.
- Booked-stay facts, flight times, insurance list and booking IDs are ground truth — never alter without explicit instruction.
- Never re-suggest **Sky Lagoon**: its strict 12+ rule excludes the 11-year-old. The Blue Lagoon backup is Laugardalslaug.

## Backlog
- Booking-tracker reset affordance.
- Full-trip `.ics` in one file (per-day export already ships).
- Tidal/sunrise times per day.
- Persist the open/closed state of day cards across reloads.

## Deploy
Any static host; all asset paths are relative so subpath hosting works (currently GitHub Pages → `harshalgajare.com/Iceland/`). GitHub Pages: serve repo root. Azure Static Web Apps: app location `/`, no API, no build step.
