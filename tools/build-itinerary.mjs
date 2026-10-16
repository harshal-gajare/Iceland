#!/usr/bin/env node
/* Regenerates docs/itinerary.md from the TRIP object in index.html.
 *
 *   node tools/build-itinerary.mjs            # write docs/itinerary.md
 *   node tools/build-itinerary.mjs --check    # exit 1 if the file is stale
 *
 * Day tables, base tables and the book-ahead table are generated straight from
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
  new vm.Script(html.slice(a, b) +
    "\nthis.TRIP = TRIP; this.DAYS = DAYS; this.DEPARTURE = DEPARTURE;"
  ).runInContext(ctx);
  if (!ctx.TRIP?.days?.length) {
    throw new Error("Evaluated the DATA section but TRIP looks empty.");
  }
  /* The departure day used to be prose transcribed into this file, which drifted.
     It is data now, so fail loudly rather than silently dropping the section. */
  if (!ctx.DEPARTURE?.stops?.length) {
    throw new Error("Evaluated the DATA section but DEPARTURE looks empty.");
  }
  return ctx;
}

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const plain = (s) => String(s).replace(/<[^>]+>/g, "");
/* `food` fields carry <b> on purpose — the page injects them with innerHTML.
   Convert to markdown emphasis rather than stripping it. */
const bold = (s) => esc(String(s ?? "").replace(/<\/?b>/g, "**"));
const TAG = { book: "**book ahead**", soak: "_soak_", opt: "_optional_" };

function baseTable(p) {
  const out = ["| Night | Date | Base | Bed |", "|---|---|---|---|"];
  for (const d of p.days) {
    /* Every night carries a stay, so hotels[] exists on no day — this branch is
       unreachable today. Kept for a night with no stay, and guarded. */
    const bed = d.stay
      ? `**${esc(d.stay.name)}** — ${esc(d.stay.addr)}<br>${esc(d.stay.status)}`
      : `_not booked_${d.hotels?.length ? " — " + d.hotels.map(esc).join(" · ") : ""}`;
    out.push(`| ${d.n} | ${d.dow} ${d.date} | ${esc(d.base)} | ${bed} |`);
  }
  return out.join("\n");
}

function dayTables(p) {
  const out = [];
  for (const d of p.days) {
    const window = [d.depart ? `out ${d.depart}` : null, d.arrive ? `in ${d.arrive}` : null]
      .filter(Boolean).join(" · ");
    out.push(`### Day ${d.n} — ${d.dow}, ${d.date} · ${esc(d.title)}`, "");
    out.push(`*${esc(d.km)}${window ? " · " + window : ""} · overnight ${esc(d.base)}*`, "");
    if (d.note) out.push("> " + esc(d.note), "");
    out.push("| Time | Plan |", "|---|---|");
    for (const s of d.stops) {
      if (s.drive) out.push(`| | *↓ drive ${esc(s.drive)}* |`);
      const tag = s.tag ? ` ${TAG[s.tag] || ""}` : "";
      out.push(`| \`${esc(s.time || "flex")}\` | **${esc(s.name)}**${tag} — ${esc(s.note)} |`);
      /* `shot` carries <b> like the food fields do, so bold() rather than esc(). */
      if (s.shot) out.push(`| | ◈ *photo* — ${bold(s.shot)} |`);
    }
    out.push("");
    if (d.food) {
      const rows = [["Lunch", d.food.lunch], ["Dinner", d.food.dinner],
                    ["Coffee", d.food.coffee], ["Sweet", d.food.sweet],
                    ["Fuel", d.food.fuel], ["Shop", d.food.shop], ["Buy", d.food.buy],
                    ["Detour", d.food.extra]].filter(([, v]) => v);
      if (rows.length) {
        out.push("| Eating | |", "|---|---|");
        for (const [k, v] of rows) out.push(`| **${k}** | ${bold(v)} |`);
        out.push("");
      }
    }
  }
  return out.join("\n");
}

/* Mirrors buildDeparture() on the page — same object, same run-sheet, so the
   departure morning cannot say one thing here and another there. */
function departureSection() {
  const D = SB.DEPARTURE, out = [];
  out.push(`## Departure day — ${D.dow}, ${D.date} · ${esc(D.title)}`, "");
  out.push(`*out ${D.depart} · keys back ${D.keys} · flight ${esc(D.flight)}*`, "");
  if (D.note) out.push("> " + esc(D.note), "");
  out.push("| Time | Plan |", "|---|---|");
  for (const s of D.stops) {
    out.push(`| \`${esc(s.time || "flex")}\` | **${esc(s.name)}** — ${esc(s.note)} |`);
    if (s.shot) out.push(`| | ◈ *photo* — ${bold(s.shot)} |`);
  }
  return out.join("\n");
}

/* Mirrors buildReservations() on the page: lodging derived from the days so it
   cannot drift, then the hand-kept car and tours. */
function reservationTable(p) {
  const out = ["| When | What | Notes |", "|---|---|---|"];
  for (const d of p.days) {
    const when = `Night ${d.n} · ${d.dow} ${d.date}`;
    if (d.stay) out.push(`| ${when} | **${esc(d.stay.name)}**<br>${esc(d.stay.addr)} | ${esc(d.stay.status)} |`);
    else out.push(`| ${when} | ${esc(d.base)} | *not booked* — budget picks are on the day |`);
  }
  for (const r of p.reservations) {
    out.push(`| ${esc(r.when)} | **${esc(r.what)}** | ${r.tel ? esc(r.tel) + "<br>" : ""}${bold(r.meta)} |`);
  }
  return out.join("\n");
}

const statLine = (p) =>
  `${p.stats.km} km · ${p.stats.stops} stops · ${p.stats.soaks} soak options · ${plain(p.stats.flex)}`;

function render(C) {
  return `# Iceland Ring Road + Snæfellsnes — September 19–29, 2026

A family-friendly ten-night loop: the counterclockwise Ring Road plus
Snæfellsnes. This is the printable twin of the page — the whole route in one
document, including the book-ahead list and the emergency block, for the
glovebox and for the case where there is no signal and no battery.

${esc(C.desc)}

> Generated from the \`TRIP\` object in \`index.html\` — that file is the source of
> truth. After changing a stop, a time or a base there, run
> \`node tools/build-itinerary.mjs\` rather than editing this file by hand.

## Car hire

A 4x4 SUV, automatic, picked up and dropped at Keflavík Airport — day 1 around
11:00, departure day around 14:00. Most airport rentals run a short shuttle
between terminal and lot, both directions.

Cover worth having: CDW · SCDW super-collision · TP theft · GP gravel · SAAP sand
& ash · Roadside. GP + SAAP is exactly the cover this route wants — gravel chips
and south-coast ash storms are the two classic claims.

> **Road 550 is the one F-road** — day 10's Into the Glacier tour meets at the top
> of it. Many contracts forbid F-roads even in a 4x4, so get it in writing that
> yours allows it; if it doesn't, the operator runs a departure from Húsafell
> instead. It is a rough gravel mountain road: gravel speed, honest tyre pressure.
> River fords are never insured on any Icelandic contract, and nothing on this
> route asks you to cross one.

**Return-day math — drop at 14:00 for a ~17:00 flight.** Check-in for
international departures opens about 2.5 hrs out, so be in the terminal by
**14:40**. Back off 30 min for the handover and the lot shuttle → keys back
**14:10**; 15 more for the last fill in Njarðvík → pump by **13:55**; so the
morning's last activity ends about **13:40**. Later is not worth it: a 15:00 drop
puts you in the terminal under two hours before an international flight, and bag
drop shuts 45–60 min out. If your flight is earlier or later, slide the whole
chain with it.

**Booster check:** Icelandic law requires a booster seat below 135 cm — add one
to the rental or bring your own.

**${statLine(C)}**

Headline stops: ${C.upgrades.map((u) => `${esc(u[0])} (day ${u[1]})`).join(" · ")}.

---

## Bases

${baseTable(C)}

## Day by day

${dayTables(C)}
---

## Book ahead

${reservationTable(C)}

### Before you go

- **Blue Lagoon** — take a flexible ticket given the volcano watch. Most meals
  need no booking: Efstidalur books only for parties of ten or more, and Pakkhús
  in Höfn takes no reservations at all — but book Krauma, Bjargarsteinn and
  Strikið ahead.
- **Book the car drop for about 14:00** on the last day if you fly out late
  afternoon — the arithmetic is under Car hire.
- **Ask Dimmuborgir to pack breakfast** for day 7. Service is 08:00–10:00 and
  day 7 leaves at 07:55 for the whale check-in, so the buffet is unusable — they
  will bag it if you ask at check-in.

## If something goes wrong

Iceland runs one emergency number for police, fire, ambulance, coastguard and
mountain rescue. It is free from any phone, works with no credit and no SIM, and
the operators speak English.

| | |
|---|---|
| **112** | Police · fire · ambulance · rescue. Install the **112 Iceland** app before flying — its emergency button sends your GPS with the call, which is what matters on a gravel road with no landmarks. |
| **1700** | Health line, 24/7 medical advice in English |
| **1770** | Læknavaktin — the after-hours doctor |
| **+354 543 2000** | Landspítali emergency department, Reykjavík |
| **+354 543 2222** | Poison information centre |
| **+354 575 0505** | Emergency dental |
| **+354 444 1000** | Police, non-emergency |
| **+354 570 5900** | ICE-SAR, search and rescue |
| **118** | Directory enquiries |

Every town you sleep in has a *heilsugæsla* (health centre) for the ordinary
things; pharmacies are *apótek*. safetravel.is carries alerts and takes a travel
plan; umferdin.is has roads, vedur.is has weather.

**Roadside assistance** comes with the rental contract — take the number off the
agreement at pickup and keep it with the keys.

**Your embassy.** Look up your own country's embassy or consulate before you fly
and save the number. Several countries cover Iceland from Oslo or Copenhagen
rather than Reykjavík, which matters if a passport goes missing — a lost passport
abroad needs an emergency travel document, and that starts with them. Carry a
photo of every travel document separately from the documents themselves.

**The two that actually catch people here:** sneaker waves at Reynisfjara and
Djúpalónssandur — never turn your back on the sea, obey the warning lights, and
brief any kids properly, because those waves outrun sprinting adults. And
wind: hold the car doors, and if a gust warning says 20 m/s, believe it.

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
Stykkishólmur** — Kirkjufell is 40 min west.

> **Moon check.** Look up the moon phase for your dates before you go. A bright
> moon washes out faint glows while strong displays punch through — so on moonlit
> nights lean on the alerts rather than patient sky-staring, and use the moonlit
> landscape as foreground.

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

**Volcano status — Reykjanes.** The peninsula has erupted repeatedly since 2021,
and another eruption can come at short notice. Past eruptions haven't touched KEF
flights, Reykjavík, or the Ring Road — only a small zone near Grindavík, where
the Blue Lagoon sits. Book the lagoon flexible and check safetravel.is the week
you fly.

**Weather & packing.** 4–12 °C, wind always, rain somewhere on the loop.
Waterproof shell + fleece layers, hats and gloves, waterproof shoes. Swimsuits
and quick-dry towels ride in the **day bag** — three soak options (Blue Lagoon,
Earth Lagoon at Mývatn, Hofsós). They also cover Akureyri Backpackers, which
charges for towels. Raincoats for everyone at the walk-behind waterfalls.

**Taking it home.** Each day section names the shop worth stopping at. Worth
carrying: a **lopapeysa** — hand-knitted ones carry the knitter's name on the
label and machine-made imports don't, which is the whole test — Icelandic wool by
the skein, **Omnom** chocolate and **Nói Síríus** liquorice, **Saltverk** sea salt
boiled with geothermal heat, **harðfiskur**, **brennivín**, and skincare from
either lagoon. Skip the puffin keyrings; much of the cheap souvenir stock is
imported.

**Tax free.** ISK 12,000 or more on one receipt in one shop and you can reclaim
the VAT. Ask for the form at the till. At Keflavík the refund desk is in the
arrival hall opposite the car rentals — where the rental shuttle drops you — and
it must be done **before** you check the bags. Over ISK 100,000 needs a customs
stamp first. Duty free on the way out is the cheapest alcohol and chocolate in
the country; elsewhere alcohol is **Vínbúðin** only, closed Sundays, and never in
supermarkets.

**Photographs.** Gear, honestly: one lens you trust beats three you swap in weather, and a microfibre
cloth matters more than any of them — Skógafoss, Dettifoss and the Jökulsárlón Zodiac
will coat a front element in seconds. The good camera does not go into **Blue Lagoon,
Earth Lagoon or Krauma**: silica water and steam finish electronics, phones live in
pouches, and the other people in the water did not agree to be in your photograph.
Same restraint at Hofsós.

For the aurora, a phone on night mode genuinely works now. Anything better wants the
camera braced against something solid — a wall, a fence post, the car roof — at 3 to
10 seconds, ISO 1600–3200, manual focus set to infinity while you can still see to do
it, and the flash off.

**Driving.** Hold car doors against the wind — the number-one rental damage claim
in Iceland. Single-lane bridges in the southeast: first to arrive has right of
way. Sheep own the road. 90 km/h max, headlights always on, zero-tolerance DUI.
Check road.is each morning. The only road that needs the 4x4 is 550 up to Klaki
on day 10 — see Car hire above.

**Ocean safety — Reynisfjara & Djúpalónssandur.** Both beaches have genuinely
dangerous sneaker waves. Obey the warning-light system at Reynisfjara, never turn
your back on the sea, stay off the wet sand — and brief any kids hard:
sneaker waves outrun sprinting adults.

**Food, fuel & phones.** N1/Orkan stations all along the route, and the rural ones are
unmanned but open 24/7 — they need a card with a **PIN**, not a tap, and an N1
Prepaid Card sidesteps the question entirely. Every day section names that day's
fuel and grocery stop; Bónus is the cheap chain, but its hours vary by branch and
the rural ones shut earlier than you expect. Grocery stops (Bónus, Krónan, Nettó) for picnic lunches keep
costs sane; restaurant meals run $25–45 a head. Langoustine night is Höfn, at
Pakkhús — which takes no reservations, so arrive rather than plan. Every day section carries a lunch and a dinner pick; late
September thins the rural kitchens, so ring the same morning for anything that
matters and book Pakkhús, Bjargarsteinn and Strikið ahead. eSIM from Nova or
Síminn, or carrier roaming — Ring Road coverage is excellent.

**Pool note.** Sky Lagoon has a strict 12+ rule, so with younger kids the Blue
Lagoon backup is Laugardalslaug, Reykjavík's big public pool with
waterslides. Blue Lagoon itself is free under 14; Mývatn Nature Baths free under 13.

## If a day goes sideways, trim these first

Weather will steal at least half a day somewhere. Protect the timed tours first
— Katla, the horses, the whale watch and Into the Glacier — then cut in this
order:

1. The Siglufjörður loop (day 8): straight down Route 1 instead — saves ~2.5 hrs.
2. The Fagradalsfjall hike (day 10) — the flex block; the glacier tour above it is not.
3. The 15-minute stops — Grjótagjá, Petra's Stones, Fontana.

Day 10 carries its own wet-weather list in the day card — Víðgelmir, Krauma and
the rest — for the case where the glacier tour itself is called off.

${departureSection()}

---

*Short September hours — Herring Era Museum, Hofsós pool and Glaumbær — confirm
the night before, every time.*
`;
}

const SB = loadPlans();          // { TRIP, DAYS, DEPARTURE }
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
