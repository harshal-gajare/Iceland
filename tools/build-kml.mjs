#!/usr/bin/env node
/* Generates docs/iceland-2026.kml from the TRIP object in index.html.
 *
 *   node tools/build-kml.mjs            # write docs/iceland-2026.kml
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
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "index.html");
const OUT = join(ROOT, "docs/iceland-2026.kml");

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

/* The leg is drawn previous-base → stops → that day's base, which is the order
   you actually drive it. Day 1 starts at the airport because that is where the
   car is picked up. Stops without coordinates drop out. */
function legMark(d, from, n, label) {
  const pts = [from, ...d.stops.filter(s => s.ll).map(s => s.ll)];
  if (d.baseLL) pts.push(d.baseLL);
  return [
    `    <Placemark>`,
    `      <name>${xml(label)}</name>`,
    `      <styleUrl>#leg${n}</styleUrl>`,
    `      <LineString><tessellate>1</tessellate>`,
    `        <coordinates>${pts.map(coord).join(" ")}</coordinates>`,
    `      </LineString>`,
    `    </Placemark>`
  ].join("\n");
}

function render({ TRIP, DAYS, DEPARTURE, KEF, colors }) {
  const out = [];
  let stops = 0, bases = 0, legs = 0;

  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<kml xmlns="http://www.opengis.net/kml/2.2">`);
  out.push(`<Document>`);
  out.push(`  <name>Iceland · Sep 19–29, 2026</name>`);
  out.push(`  <description>${cdata(TRIP.desc)}</description>`);
  out.push(styles(colors));

  DAYS.forEach((d, i) => {
    const from = i === 0 ? KEF : DAYS[i - 1].baseLL;
    out.push(`  <Folder>`);
    out.push(`    <name>Day ${d.n} · ${xml(d.dow)} ${xml(d.date)} · ${xml(d.title)}</name>`);
    out.push(`    <description>${cdata(
      [xml(d.km), d.depart ? `out ${d.depart}` : null, d.arrive ? `in ${d.arrive}` : null]
        .filter(Boolean).join(" · ")
    )}</description>`);
    out.push(legMark(d, from, d.n, `Day ${d.n} leg`)); legs++;
    for (const s of d.stops) { if (s.ll) { out.push(stopMark(s, d.n)); stops++; } }
    out.push(baseMark(d)); bases++;
    out.push(`  </Folder>`);
  });

  /* Card 11 on the page, and a folder here for the same reason: it is the flight
     home, so it has a run-sheet but no night and no leg of its own. */
  out.push(`  <Folder>`);
  out.push(`    <name>Day 11 · ${xml(DEPARTURE.dow)} ${xml(DEPARTURE.date)} · ${xml(DEPARTURE.title)}</name>`);
  out.push(`    <description>${cdata(`out ${DEPARTURE.depart} · keys back ${DEPARTURE.keys} · flight ${xml(DEPARTURE.flight)}`)}</description>`);
  const dpts = [DAYS[DAYS.length - 1].baseLL, ...DEPARTURE.stops.filter(s => s.ll).map(s => s.ll)];
  out.push(`    <Placemark>`);
  out.push(`      <name>Day 11 leg</name>`);
  out.push(`      <styleUrl>#leg11</styleUrl>`);
  out.push(`      <LineString><tessellate>1</tessellate>`);
  out.push(`        <coordinates>${dpts.map(coord).join(" ")}</coordinates>`);
  out.push(`      </LineString>`);
  out.push(`    </Placemark>`); legs++;
  for (const s of DEPARTURE.stops) { if (s.ll) { out.push(stopMark(s, 11)); stops++; } }
  out.push(`  </Folder>`);

  out.push(`</Document>`);
  out.push(`</kml>`);
  return { doc: out.join("\n") + "\n", stops, bases, legs };
}

const SB = loadData();
const { doc, stops, bases, legs } = render(SB);

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
  const folders = doc.match(/^  <Folder>$/gm)?.length ?? 0;
  console.log(
    `Wrote docs/iceland-2026.kml — ${folders} folders, ${stops} stops, ${bases} bases, ${legs} legs.`
  );
  if (folders > 10) {
    console.log(
      `Note: Google My Maps caps a map at 10 layers. This file has ${folders} folders, so check\n` +
      `how the import lands — if it overflows, merge the last two days into one layer.`
    );
  }
}
