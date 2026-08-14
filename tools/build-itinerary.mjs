#!/usr/bin/env node
/* Regenerates docs/itinerary.md from the TRIP object in index.html.
 *
 *   node tools/build-itinerary.mjs            # write docs/itinerary.md
 *   node tools/build-itinerary.mjs --check    # exit 1 if the file is stale
 *
 * Day tables, base tables and booking checklists are generated straight from
 * the data so they cannot drift from the app. The prose sections below are
 * transcribed from the static sections of index.html — if you edit those
 * sections in the page, edit them here too.
 *
 * No dependencies. This is a docs tool, not a build step: index.html still
 * ships as-is.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "index.html");
const OUT = join(ROOT, "docs/itinerary.md");

const START = "/* ================= DATA ================= */";
const END = "/* ================= MAP ================= */";

/* Pull the data section out of the inline script and evaluate it in isolation.
   It is pure data — no DOM access — and its one localStorage read is already
   try/catch'd, so it runs fine with no globals. */
function loadPlans() {
  const html = readFileSync(SRC, "utf8");
  const a = html.indexOf(START);
  const b = html.indexOf(END);
  if (a < 0 || b < 0 || b < a) {
    throw new Error(
      `Could not locate the DATA section in index.html.\n` +
      `Expected the markers ${START} ... ${END}.\n` +
      `If they were renamed, update START/END in this script.`
    );
  }
  const ctx = { TRIP: null };
  vm.createContext(ctx);
  /* Daylight is computed by the page, not transcribed here — pull the same
     functions out of the sandbox so the doc cannot drift from the app. */
  new vm.Script(html.slice(a, b) +
    "\nthis.TRIP = TRIP; this.DAYS = DAYS; this.dayLight = dayLight;" +
    "\nthis.hhmm = hhmm; this.hoursMins = hoursMins; this.shortBase = shortBase;"
  ).runInContext(ctx);
  if (!ctx.TRIP?.days?.length) {
    throw new Error("Evaluated the DATA section but TRIP looks empty.");
  }
  if (typeof ctx.dayLight !== "function") {
    throw new Error("Evaluated the DATA section but dayLight is missing.");
  }
  return ctx;
}

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const plain = (s) => String(s).replace(/<[^>]+>/g, "");
const TAG = { booked: "**✔ booked**", book: "**book**", soak: "_soak_", opt: "_optional_" };

function baseTable(p) {
  const out = ["| Night | Date | Base | Bed |", "|---|---|---|---|"];
  for (const d of p.days) {
    const bed = d.stay
      ? `**${esc(d.stay.name)}** — ${esc(d.stay.addr)}<br>${esc(d.stay.status)}`
      : `_not booked_ — ${d.hotels.map(esc).join(" · ")}`;
    out.push(`| ${d.n} | ${d.dow} ${d.date} | ${esc(d.base)} | ${bed} |`);
  }
  return out.join("\n");
}

/* Sunrise where you wake, sunset where you land — see the DAYLIGHT block in
   index.html for why the two ends can be different places. */
function daylightLine(d, prev) {
  const { dayLight, hhmm, hoursMins, shortBase } = SB;
  const s = dayLight(d, prev);
  if (s.rise == null || s.set == null) return null;
  const at = (w) => (s.moved ? " " + shortBase(w) : "");
  return `*Daylight ${hhmm(s.rise)}${at(s.riseAt)} → ${hhmm(s.set)}${at(s.setAt)}` +
    ` · ${hoursMins(s.mins)}*`;
}

function dayTables(p) {
  const out = [];
  for (const [i, d] of p.days.entries()) {
    const window = [d.depart ? `out ${d.depart}` : null, d.arrive ? `in ${d.arrive}` : null]
      .filter(Boolean).join(" · ");
    out.push(`### Day ${d.n} — ${d.dow}, ${d.date} · ${esc(d.title)}`, "");
    out.push(`*${esc(d.km)}${window ? " · " + window : ""} · overnight ${esc(d.base)}*`, "");
    const light = daylightLine(d, p.days[i - 1]);
    if (light) out.push(light, "");
    if (d.note) out.push("> " + esc(d.note), "");
    out.push("| Time | Plan |", "|---|---|");
    for (const s of d.stops) {
      if (s.drive) out.push(`| | *↓ drive ${esc(s.drive)}* |`);
      const tag = s.tag ? ` ${TAG[s.tag] || ""}` : "";
      out.push(`| \`${esc(s.time || "flex")}\` | **${esc(s.name)}**${tag} — ${esc(s.note)} |`);
    }
    out.push("");
  }
  return out.join("\n");
}

const checklist = (p) =>
  p.bookings.map((b, i) => `${i + 1}. **${esc(b[0])}** — ${esc(b[1])}`).join("\n");

const statLine = (p) =>
  `${p.stats.km} km · ${p.stats.stops} stops · ${p.stats.soaks} soak options · ${plain(p.stats.flex)}`;

function render(C) {
  return `# Iceland Ring Road + Snæfellsnes — September 19–29, 2026

Family of three (one 11-year-old), ten nights, counterclockwise Ring Road plus
Snæfellsnes.

${esc(C.desc)}

> Generated from the \`TRIP\` object in \`index.html\` — that file is the source of
> truth. After changing a stop, a time or a base there, run
> \`node tools/build-itinerary.mjs\` rather than editing this file by hand.

Daylight is computed for each day's own coordinates — sunrise where you wake,
sunset where you land — against a flat sea horizon. Iceland's mountains take a
bigger bite than the minutes suggest, so treat these as the outer bound.

## Flights — Icelandair, PNR CVYKHM · Saga Club 4996508872

| When | Leg | Notes |
|---|---|---|
| Fri Sep 18 — outbound | ATL **18:45** → JFK **21:02** | 2h 08m layover at JFK |
| | JFK **23:10** → KEF **08:55** | overnight — lands Sat Sep 19 morning |
| Tue Sep 29 — home | KEF **17:10** → BOS **18:50** | 2h 09m layover at BOS |
| | BOS **20:59** → ATL **00:12** | lands Wed Sep 30, just past midnight |

Per person: 1 carry-on (22 lbs) + 1 checked (50 lbs) included. Visa approved
(Schengen) — carry passports and printed confirmations in the day bag anyway.

## Rental — Blue Car Rental, booking #Z04F2O

Suzuki Vitara, automatic. Pick up **Sep 19, 11:00**; drop **Sep 29, 11:00**,
Keflavík Airport (short shuttle between terminal and lot, both directions).

Insurance on the contract: CDW · SCDW super-collision · TP theft · GP gravel ·
SAAP sand & ash · Roadside · Road tax. GP + SAAP is exactly the cover this route
wants — gravel chips and south-coast ash storms are the two classic claims.

> **One email to send, and a paid tour rides on it.** Confirm the Vitara is the
> AllGrip 4x4 and that **Road 550 to Klaki** is permitted. Day 10's Into the
> Glacier tour meets at the top of that F-road and is already paid for; a no
> there means booking the operator's shuttle from Húsafell, and driving it
> regardless would void the CDW and SCDW. River fords are never insured on any
> Icelandic contract, and nothing on this route asks you to cross one.

**Return-day math:** car back 11:00, flight 17:10. Either run a Reykjanes
morning and drop at 11:00 with a slow airport lunch, or ask Blue Car to extend
drop-off to ~14:00 and keep the last morning properly free.

**Booster check:** Icelandic law requires a booster seat below 135 cm. Most
11-year-olds clear that — if yours doesn't yet, add one to the booking or bring
your own.

**${statLine(C)}**

Headline stops: ${C.upgrades.map((u) => `${esc(u[0])} (day ${u[1]})`).join(" · ")}.

---

## Bases

${baseTable(C)}

## Day by day

${dayTables(C)}
---

## Booking checklist (${C.bookings.length} items)

${checklist(C)}

## The aurora game plan

These dates straddle the autumn equinox — statistically one of the best
northern-lights windows of the year — and 8 of the 10 nights are in dark-sky
country. The routine:

1. At dinner, check the aurora forecast and **cloud-cover map** at en.vedur.is.
   Gaps in cloud matter more than the Kp number — Kp 2–3 is already a show out here.
2. Ask **every** hotel for a northern-lights wake-up call. Countryside hosts
   expect the request — make it at every check-in.
3. Phone night mode, 3–10 seconds, propped on the car roof — it catches more
   color than your eyes do. A mini tripod earns its space in the bag.
4. Push alerts: **Hello Aurora** (Icelandic) or My Aurora Forecast.

Best dark skies: **N2 Seljalandsfoss · N4 Höfn / lagoon · N6 Mývatn · N8
Grundarfjörður** — Kirkjufell under the lights is the trip photo.

> **Moon check.** The dates wax toward a full moon **~Sep 25–26**. Faint glows
> wash out; strong displays punch through. Lean on the alerts rather than
> patient sky-staring, and use the moonlit landscape as foreground.

The page also carries a live Kp strip (NOAA SWPC) in the aurora panel — current
Kp plus the next-24h peak. vedur.is blocks cross-origin requests, so cloud cover
stays a link-out.

## The daily watch — two checks a day

**Morning · weather & roads (~07:45 over breakfast)**

- **en.vedur.is** — Icelandic Met Office, the accurate national forecast. Wind is
  in m/s: 15 m/s = hold the doors and expect a workout; 20+ m/s or an orange
  warning = rebuild the day around indoor stops; red = the car stays parked.
- **umferdin.is** (road.is) — Road Administration live map: closures, surface
  conditions, measured gusts on the exact stretches you're driving. On the long
  days (4, 6, 8) check tomorrow's legs the night before too.
- **safetravel.is** — ICE-SAR alerts: storm advisories, area and volcano
  closures. Register the travel plan once, and install the **112 Iceland** app.
- **windy.com** — visual gust animation, for timing photo stops.

**Evening · aurora (~19:00 at dinner)**

- **vedur.is aurora forecast** — the Kp number *plus* the cloud map. White gaps =
  clear sky. A clear-sky Kp 2–3 beats a cloudy Kp 6 at this latitude.
- **Hello Aurora** (iOS/Android) — Icelandic-made push alerts plus live sightings.
- **NOAA SWPC 30-minute forecast** — the OVATION oval shows where the aurora is
  right now; when the green blob drapes over Iceland, go outside.
- **spaceweatherlive.com** — live solar wind and Bz. When Bz swings south
  (negative), a display usually follows within the hour.
- **UAF Geophysical Institute** — nightly plus 27-day outlook.

The rhythm: 07:45 vedur + umferdin over breakfast · drive · 19:00 cloud map + Kp
at dinner · Hello Aurora alert set · host knock requested · 22:30 step outside,
look north.

## Field notes

**Volcano status — Reykjanes.** The eruption series is between episodes: the last
one ended August 2025, magma is re-accumulating, and another eruption is
considered likely at some point. Blue Lagoon and Grindavík are open. Past
eruptions haven't touched KEF flights, Reykjavík, or the Ring Road — only a small
zone near Grindavík. Book the lagoon flexible and check safetravel.is the week
you fly.

**Weather & packing.** 4–12 °C, wind always, rain somewhere on the loop.
Waterproof shell + fleece layers, hats and gloves, waterproof shoes. Swimsuits
and quick-dry towels ride in the **day bag** — three soak options (Blue Lagoon,
Earth Lagoon at Mývatn, Hofsós). They also cover Akureyri Backpackers, which
charges for towels. Raincoats for everyone at the walk-behind waterfalls.

**Driving.** Hold car doors against the wind — the number-one rental damage claim
in Iceland. Single-lane bridges in the southeast: first to arrive has right of
way. Sheep own the road. 90 km/h max, headlights always on, zero-tolerance DUI.
Check road.is each morning. The only road that needs the 4x4 is 550 up to Klaki
on day 10 — see the Blue Car email above.

**Ocean safety — Reynisfjara & Djúpalónssandur.** Both beaches have genuinely
dangerous sneaker waves. Obey the warning-light system at Reynisfjara, never turn
your back on the sea, stay off the wet sand — and brief the 11-year-old hard:
sneaker waves outrun sprinting adults.

**Food, fuel & phones.** N1/Orkan stations all along the route — bring a credit
card with a PIN. Grocery stops (Bónus, Krónan, Nettó) for picnic lunches keep
costs sane; restaurant meals run $25–45 a head. Langoustine night is Höfn
(Pakkhús or Otto). eSIM from Nova or Síminn, or carrier roaming — Ring Road
coverage is excellent.

**Pool note.** Sky Lagoon is out — a strict 12+ rule excludes the 11-year-old.
The Blue Lagoon backup is Laugardalslaug, Reykjavík's big public pool with
waterslides. Blue Lagoon itself is free under 14; Mývatn Nature Baths free under 13.

## If a day goes sideways, trim these first

Weather will steal at least half a day somewhere. Protect the booked tours first
— Katla, the horses, the whale watch and Into the Glacier — then cut in this
order:

1. The Siglufjörður loop (day 8): straight down Route 1 instead — saves ~2.5 hrs.
2. Stykkishólmur's backtrack (day 9).
3. The Fagradalsfjall hike (day 10) — the flex block; the glacier tour above it is not.
4. The 15-minute stops — Grjótagjá, Petra's Stones, Fontana.

Day 10 carries its own wet-weather list in the day card — Víðgelmir, Krauma and
the rest — for the case where the glacier tour itself is called off.

## Departure day — Tue Sep 29

KEF 17:10 → BOS → ATL 00:12. The Vitara is due back at 11:00 but the flight isn't
until 17:10, so the morning is yours: a last Reykjanes loop (Bridge Between
Continents, Gunnuhver, Reykjanesviti) or the backup Blue Lagoon soak, fuel, drop
the car, shuttle to the terminal, slow lunch. Or email Blue Car to extend
drop-off to ~14:00 and keep the morning properly unhurried. Bag drop opens
~14:10; 1 carry-on (22 lbs) + 1 checked (50 lbs) each.

---

*Short September hours — Herring Era Museum, Hofsós pool and Glaumbær — confirm
the night before, every time.*
`;
}

const SB = loadPlans();          // { TRIP, DAYS, dayLight, hhmm, hoursMins, shortBase }
const doc = render(SB.TRIP);

if (process.argv.includes("--check")) {
  let current = "";
  try { current = readFileSync(OUT, "utf8"); } catch {}
  if (current === doc) {
    console.log("docs/itinerary.md is up to date.");
  } else {
    console.error("docs/itinerary.md is STALE — run: node tools/build-itinerary.mjs");
    process.exit(1);
  }
} else {
  writeFileSync(OUT, doc);
  const days = doc.match(/^### Day /gm)?.length ?? 0;
  const stops = doc.match(/^\| `/gm)?.length ?? 0;
  console.log(`Wrote docs/itinerary.md — ${days} day sections, ${stops} stop rows.`);
}
