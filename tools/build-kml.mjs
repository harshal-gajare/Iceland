#!/usr/bin/env node
/* Generates docs/iceland-2026.kml from the TRIP object in index.html.
 *
 *   node tools/build-kml.mjs            # write the KML from the cached routes
 *   node tools/build-kml.mjs --route    # re-fetch road geometry, then write
 *   node tools/build-kml.mjs --check    # exit 1 if the file is stale
 *
 * This is what the page's "real map" view points at. Import it once into Google
 * My Maps (My Maps has no API, so that step is manual), share the map, and put
 * the mid= into MYMAP_MID in index.html. Because the KML is generated from the
 * same TRIP object the day cards render, the custom map and the itinerary cannot
 * drift — re-run this and re-import after an itinerary change.
 *
 * Sibling of build-itinerary.mjs and deliberately built the same way: same
 * node:vm sandbox, same DATA-section markers, same --check semantics. No
 * dependencies, and not a build step — index.html still ships as-is.
 *
 * TEN folders, not eleven, and that is the point. My Maps caps a map at 10
 * layers; an eleven-folder import silently drops the last one, which is exactly
 * what happened on the first real import — Sep 29 went missing. So the departure
 * day rides in the day 10 folder rather than claiming a layer it cannot have.
 *
 * Legs follow REAL ROADS. The first version drew straight lines between stops,
 * which on a fjord coast is not a route, it is a chord across a bay. Geometry
 * comes from OSRM's public router (OpenStreetMap data, ODbL) and is cached in
 * tools/route-cache.json, keyed by the leg's waypoint string. That cache is
 * committed on purpose: the default build and --check never touch the network, so
 * they stay deterministic and work offline, and OSM changing under us cannot
 * silently rewrite a committed map. Change the itinerary and the key changes, the
 * cache misses, and the build says loudly which days need `--route` rather than
 * quietly falling back to chords again.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "index.html");
const OUT = join(ROOT, "docs/iceland-2026.kml");
const CACHE = join(ROOT, "tools/route-cache.json");

const START = "/* ================= DATA ================= */";
const END = "/* ================= MAP ================= */";

/* Same sandbox as build-itinerary.mjs: the DATA section is pure data, no DOM,
   and its one localStorage read is already try/catch'd. */
function loadData() {
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
    "\nthis.TRIP = TRIP; this.DAYS = DAYS; this.DEPARTURE = DEPARTURE; this.KEF = KEF;"
  ).runInContext(ctx);
  if (!ctx.DAYS?.length) throw new Error("Evaluated the DATA section but DAYS looks empty.");
  if (!ctx.DEPARTURE?.stops?.length) throw new Error("Evaluated the DATA section but DEPARTURE looks empty.");
  if (!Array.isArray(ctx.KEF)) throw new Error("Evaluated the DATA section but KEF is missing.");

  /* The day spectrum is read out of the :root block rather than re-typed here,
     so the map's route colors stay the same eleven the page uses. */
  const root = html.slice(0, html.indexOf(':root[data-theme="light"]'));
  const colors = {};
  for (const m of root.matchAll(/--d(\d+)\s*:\s*(#[0-9a-fA-F]{6})/g)) colors[Number(m[1])] = m[2];
  for (let n = 1; n <= 11; n++) {
    if (!colors[n]) throw new Error(`Could not read --d${n} out of the :root block in index.html.`);
  }
  return { ...ctx, colors };
}

/* XML, not markdown — build-itinerary.mjs's esc() escapes "|" for tables and is
   the wrong tool here. Stop notes and shot lines carry real <b> and literal
   &amp;, so anything going into an element needs these five replaced. */
const xml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/* Descriptions are the exception: My Maps renders light HTML, so <b> is worth
   keeping. CDATA passes it through — but a literal "]]>" inside would close the
   section early, so split any that appear. The data has none today; this is a
   guard, not a workaround. */
const cdata = (s) => `<![CDATA[${String(s ?? "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

/* KML wants lon,lat — the opposite of this project's [lat, lon]. Every bug in a
   KML writer is this line, so it exists exactly once. */
const coord = (ll) => `${ll[1]},${ll[0]}`;

/* KML color is aabbggrr, so the RGB bytes run backwards relative to CSS. */
const kmlColor = (hex) => {
  const h = hex.replace("#", "");
  return `ff${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toLowerCase();
};

const TAGNAME = { booked: "booked", book: "book now", soak: "soak", opt: "optional" };

function styles(colors) {
  const out = [];
  for (let n = 1; n <= 11; n++) {
    out.push(
      `  <Style id="leg${n}">`,
      `    <LineStyle><color>${kmlColor(colors[n])}</color><width>4</width></LineStyle>`,
      `  </Style>`,
      `  <Style id="stop${n}">`,
      `    <IconStyle><color>${kmlColor(colors[n])}</color><scale>1</scale>`,
      `      <Icon><href>https://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle>`,
      `  </Style>`,
      `  <Style id="base${n}">`,
      `    <IconStyle><color>${kmlColor(colors[n])}</color><scale>1.3</scale>`,
      `      <Icon><href>https://maps.google.com/mapfiles/kml/shapes/lodging.png</href></Icon></IconStyle>`,
      `  </Style>`
    );
  }
  return out.join("\n");
}

/* One placemark per stop. `time` is not always a clock ("flex", "flex · swap for
   Krauma"), so it is passed through as written rather than parsed. */
function stopMark(s, n) {
  const bits = [];
  if (s.time) bits.push(`<b>${xml(s.time)}</b>`);
  if (s.tag && TAGNAME[s.tag]) bits.push(`<i>${TAGNAME[s.tag]}</i>`);
  const head = bits.join(" · ");
  const body = [head, s.note, s.shot ? `◈ ${s.shot}` : null].filter(Boolean).join("<br><br>");
  return [
    `    <Placemark>`,
    `      <name>${xml(s.name)}</name>`,
    `      <description>${cdata(body)}</description>`,
    `      <styleUrl>#stop${n}</styleUrl>`,
    `      <Point><coordinates>${coord(s.ll)}</coordinates></Point>`,
    `    </Placemark>`
  ].join("\n");
}

function baseMark(d) {
  const stay = d.stay
    ? `<b>${xml(d.stay.name)}</b><br>${xml(d.stay.addr)}`
    : `Overnight in ${xml(d.base)}`;
  return [
    `    <Placemark>`,
    `      <name>Night ${d.n} · ${xml(d.base)}</name>`,
    `      <description>${cdata(stay)}</description>`,
    `      <styleUrl>#base${d.n}</styleUrl>`,
    `      <Point><coordinates>${coord(d.baseLL)}</coordinates></Point>`,
    `    </Placemark>`
  ].join("\n");
}

/* ---- road geometry ------------------------------------------------------ */

/* The cache is committed, so a missing key is a real signal, not a warm-up. */
let routeCache = {};
try { routeCache = JSON.parse(readFileSync(CACHE, "utf8")); } catch { routeCache = {}; }
const missing = [];

/* The driving line follows the through-route, which is NOT every pin.
   `opt` stops are excluded because an optional is a branch: including
   Fagradalsfjall sent day 10's line to Reykjanes and back, 40 km of detour for a
   stop that is explicitly the alternative to Krauma, and including Seyðisfjörður
   sent day 5 over a mountain pass it may never cross. Roadside optionals lose
   nothing by being dropped — the road still passes them.
   `offroute` stops are excluded because the car cannot reach them at all: the
   Katla ice cave pin is the cave itself, up on Mýrdalsjökull, and you get there in
   the operator's super jeep from Vík. Routing a hire car onto a glacier produced a
   55 km overshoot and a line across an icecap.
   They all stay PINNED either way — this only decides what bends the line. */
const drivePts = (from, stops, base) => [
  from,
  ...stops.filter(s => s.ll && s.tag !== "opt" && !s.offroute).map(s => s.ll),
  ...(base ? [base] : [])
];

/* One key per leg: the exact waypoint list. Move a stop and the key moves with
   it, so stale geometry cannot survive an itinerary edit unnoticed. */
const legKey = (pts) => pts.map(coord).join(";");

/* OSRM returns a point every few metres, which is 68 KB of KML per leg and far
   more detail than a country-scale map can show. Douglas-Peucker at ~40 m keeps
   every bend you can actually see and drops the rest. Distances here are in
   degrees weighted by cos(lat) so the tolerance means metres in both axes. */
function simplify(pts, tolM = 40) {
  if (pts.length < 3) return pts;
  const K = 111320, kx = Math.cos(65 * Math.PI / 180);
  const tol = tolM / K;
  const seg = (a, b, p) => {
    const ax = a[0] * kx, ay = a[1], bx = b[0] * kx, by = b[1], px = p[0] * kx, py = p[1];
    const dx = bx - ax, dy = by - ay, d2 = dx * dx + dy * dy;
    if (d2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / d2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let far = -1, best = tol;
    for (let i = lo + 1; i < hi; i++) {
      const d = seg(pts[lo], pts[hi], pts[i]);
      if (d > best) { best = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([lo, far], [far, hi]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/* Only ever called by --route. The build path must not touch the network. */
async function fetchRoute(pts) {
  const wp = pts.map(coord).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${wp}` +
    `?overview=full&geometries=geojson`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`OSRM HTTP ${r.status}`);
  const j = await r.json();
  if (j.code !== "Ok" || !j.routes?.length) throw new Error(`OSRM said ${j.code}`);
  const route = j.routes[0];
  const line = simplify(route.geometry.coordinates);
  return {
    km: +(route.distance / 1000).toFixed(1),
    min: Math.round(route.duration / 60),
    coords: line.map(([lon, lat]) => `${lon.toFixed(5)},${lat.toFixed(5)}`).join(" ")
  };
}

/* Road geometry if we have it, straight chords if we do not — and in that case
   record the day so the run can complain about it at the end. */
function legCoords(pts, label) {
  const hit = routeCache[legKey(pts)];
  if (hit) return hit.coords;
  missing.push(label);
  return pts.map(coord).join(" ");
}

/* The leg is drawn previous-base → stops → that day's base, which is the order
   you actually drive it. Day 1 starts at the airport because that is where the
   car is picked up. Stops without coordinates drop out. */
function legMark(d, from, n, label) {
  const pts = drivePts(from, d.stops, d.baseLL);
  const cached = routeCache[legKey(pts)];
  const dist = cached ? ` · ${cached.km} km by road, about ${Math.round(cached.min / 60 * 10) / 10} hrs driving` : "";
  return [
    `    <Placemark>`,
    `      <name>${xml(label)}</name>`,
    `      <description>${cdata(xml(d.km) + dist)}</description>`,
    `      <styleUrl>#leg${n}</styleUrl>`,
    `      <LineString><tessellate>1</tessellate>`,
    `        <coordinates>${legCoords(pts, label)}</coordinates>`,
    `      </LineString>`,
    `    </Placemark>`
  ].join("\n");
}

/* Sep 29's placemarks, built once and used twice: inlined into the day 10 folder
   of the main file, and alone in the departure-only file. It keeps --d11 either
   way, so it still reads as its own day even when it shares a layer. */
function departureFeatures(DAYS, DEPARTURE) {
  const lines = [];
  const pts = drivePts(DAYS[DAYS.length - 1].baseLL, DEPARTURE.stops, null);
  lines.push(
    `    <Placemark>`,
    `      <name>Day 11 leg · ${xml(DEPARTURE.date)}</name>`,
    `      <styleUrl>#leg11</styleUrl>`,
    `      <LineString><tessellate>1</tessellate>`,
    `        <coordinates>${legCoords(pts, "Day 11")}</coordinates>`,
    `      </LineString>`,
    `    </Placemark>`
  );
  let stops = 0;
  for (const s of DEPARTURE.stops) { if (s.ll) { lines.push(stopMark(s, 11)); stops++; } }
  return { lines, stops, legs: 1 };
}

function render({ TRIP, DAYS, DEPARTURE, KEF, colors }) {
  const out = [];
  let stops = 0, bases = 0, legs = 0;

  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<kml xmlns="http://www.opengis.net/kml/2.2">`);
  out.push(`<Document>`);
  out.push(`  <name>Iceland · Sep 19–29, 2026</name>`);
  out.push(`  <description>${cdata(TRIP.desc + "<br><br>Route lines follow roads, generated with OSRM from OpenStreetMap data, © OpenStreetMap contributors, ODbL.")}</description>`);
  out.push(styles(colors));

  DAYS.forEach((d, i) => {
    const from = i === 0 ? KEF : DAYS[i - 1].baseLL;
    out.push(`  <Folder>`);
    const last = i === DAYS.length - 1;
    out.push(`    <name>${last ? `Day ${d.n}–11 · ${xml(d.date)}–${xml(DEPARTURE.date.split(" ")[1])}` : `Day ${d.n} · ${xml(d.dow)} ${xml(d.date)}`} · ${xml(d.title)}${last ? ", then home" : ""}</name>`);
    out.push(`    <description>${cdata(
      [xml(d.km), d.depart ? `out ${d.depart}` : null, d.arrive ? `in ${d.arrive}` : null]
        .filter(Boolean).join(" · ")
    )}</description>`);
    out.push(legMark(d, from, d.n, `Day ${d.n} leg`)); legs++;
    for (const s of d.stops) { if (s.ll) { out.push(stopMark(s, d.n)); stops++; } }
    out.push(baseMark(d)); bases++;
    if (i === DAYS.length - 1) {
      const dep = departureFeatures(DAYS, DEPARTURE);
      out.push(...dep.lines);
      stops += dep.stops; legs += dep.legs;
    }
    out.push(`  </Folder>`);
  });

  out.push(`</Document>`);
  out.push(`</kml>`);
  return { doc: out.join("\n") + "\n", stops, bases, legs };
}

const SB = loadData();

/* --route is the only path that touches the network. It walks the same legs the
   renderer will, so the keys it writes are exactly the keys the build looks up. */
if (process.argv.includes("--route")) {
  const legs = [];
  SB.DAYS.forEach((d, i) => {
    const from = i === 0 ? SB.KEF : SB.DAYS[i - 1].baseLL;
    legs.push([`Day ${d.n}`, drivePts(from, d.stops, d.baseLL), d.km]);
  });
  legs.push(["Day 11", drivePts(SB.DAYS[SB.DAYS.length - 1].baseLL, SB.DEPARTURE.stops, null), null]);

  const fresh = {};
  for (const [label, pts, declared] of legs) {
    try {
      const got = await fetchRoute(pts);
      fresh[legKey(pts)] = got;
      const note = declared ? `  (page says ${declared})` : "";
      console.log(`  ${label.padEnd(7)} ${String(got.km).padStart(6)} km · ${String(got.min).padStart(3)} min` +
        `  ${got.coords.split(" ").length} pts${note}`);
    } catch (e) {
      console.error(`  ${label.padEnd(7)} FAILED — ${e.message}`);
      const keep = routeCache[legKey(pts)];
      if (keep) { fresh[legKey(pts)] = keep; console.error(`          kept the cached geometry`); }
    }
    await new Promise(r => setTimeout(r, 400));   // the public router is a courtesy
  }
  writeFileSync(CACHE, JSON.stringify(fresh, null, 1) + "\n");
  routeCache = fresh;
  console.log(`Wrote tools/route-cache.json — ${Object.keys(fresh).length} legs.`);
}

const { doc, stops, bases, legs } = render(SB);
const folders = doc.match(/^  <Folder>$/gm)?.length ?? 0;

/* Ten is the ceiling, so a regression past it is a bug, not a note. */
if (folders > 10) {
  throw new Error(
    `Generated ${folders} folders, but Google My Maps caps a map at 10 layers and\n` +
    `silently drops the overflow. The departure day is meant to ride in the day 10\n` +
    `folder — see departureFeatures().`
  );
}

if (process.argv.includes("--check")) {
  let current = "";
  try { current = readFileSync(OUT, "utf8"); } catch {}
  if (current === doc) {
    console.log("docs/iceland-2026.kml is up to date.");
  } else {
    console.error("docs/iceland-2026.kml is STALE — run: node tools/build-kml.mjs");
    process.exit(1);
  }
} else {
  writeFileSync(OUT, doc);
  console.log(
    `Wrote docs/iceland-2026.kml — ${folders} folders, ${stops} stops, ${bases} bases, ${legs} legs.`
  );
  if (missing.length) {
    console.error(
      `\nWARNING: no cached road geometry for ${[...new Set(missing)].join(", ")}.\n` +
      `Those legs fell back to straight lines between stops, which is not a route.\n` +
      `Run: node tools/build-kml.mjs --route`
    );
  }
}
