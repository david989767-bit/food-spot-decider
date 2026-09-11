// Build: Google Sheet (or local CSV) -> one static HTML file.
// No dependencies. Node 18+.
//
//   node build.mjs
//
// Reads from the published Google Sheet if SHEET_PLACES / SHEET_SUBURBS are set,
// otherwise falls back to ./data/*.csv so it always builds offline.

import { readFile, writeFile, mkdir } from "node:fs/promises";

const OUT = "dist";

// Region keys -> how they read on the Location sheet, in display order.
// "any" is prepended automatically.
const REGIONS = [
  ["city", "The city"],
  ["innerwest", "Inner west"],
  ["west", "Out west"],
  ["north", "Up north"],
];

/* ---------------------------------------------------------------- csv --- */

// Handles quoted fields, embedded commas, escaped quotes and CRLF.
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const header = rows.shift().map(h => h.trim().toLowerCase());
  return rows
    .filter(r => r.some(v => v.trim() !== ""))
    .map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

async function load(name, url) {
  if (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name}: sheet fetch failed (${res.status}). Is it published to the web?`);
    const text = await res.text();
    if (text.trimStart().startsWith("<")) {
      throw new Error(`${name}: got HTML, not CSV. Use the "Publish to web -> CSV" link, not the normal share link.`);
    }
    console.log(`  ${name}: from Google Sheet`);
    return parseCSV(text);
  }
  console.log(`  ${name}: from data/${name}.csv`);
  return parseCSV(await readFile(`data/${name}.csv`, "utf8"));
}

/* --------------------------------------------------------------- shape --- */

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const truthy = v => !/^(false|no|0|n)$/i.test(String(v).trim());

// "$$" or "2" -> 2
function priceOf(v) {
  const s = String(v).trim();
  if (/^\$+$/.test(s)) return s.length;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 3) : 2;
}

// Line colour tokens already defined in the stylesheet.
const LINE_COLOUR = {
  T1: "--t1", T2: "--t2", T3: "--t3", T5: "--t3", T9: "--t9",
  T4: "--t2", T8: "--metro", M: "--metro", METRO: "--metro",
  L1: "--lr", L2: "--lr", L3: "--lr", WALK: "--walk", BUS: "--walk", FERRY: "--metro",
};

function build(placeRows, suburbRows) {
  const warnings = [];

  const SUB = {};
  for (const r of suburbRows) {
    if (!r.suburb) continue;
    const line = (r.line || "WALK").toUpperCase();
    if (!LINE_COLOUR[line]) warnings.push(`unknown line "${line}" on ${r.suburb} — it will render grey`);
    SUB[slug(r.suburb)] = {
      label: r.suburb,
      region: slug(r.region || ""),
      line,
      lc: LINE_COLOUR[line] || "--walk",
      mins: line === "WALK" ? `${r.mins} MIN WALK` : `${r.mins} MIN`,
      how: line === "WALK" ? "ON FOOT" : line === "BUS" ? "BY BUS" : "FROM CENTRAL",
    };
  }

  const known = new Set(REGIONS.map(([k]) => k));
  for (const [k, s] of Object.entries(SUB)) {
    if (!known.has(s.region)) warnings.push(`${s.label} has region "${s.region}" — not one of ${[...known].join(", ")}`);
  }

  // `dish`, `note` and `active` are optional — include the columns only if you want them.
  const PICKS = [];
  for (const r of placeRows) {
    if (!r.name || !truthy(r.active ?? "yes")) continue;
    const key = slug(r.suburb || "");
    const meta = SUB[key];
    if (!meta) { warnings.push(`skipped "${r.name}" — suburb "${r.suburb}" is not in the suburbs sheet`); continue; }
    if (!r.cuisine) warnings.push(`"${r.name}" has no cuisine`);
    PICKS.push({
      n: r.name,
      s: key,
      c: r.cuisine || "",
      p: priceOf(r.price),
      d: r.dish || "",
      note: r.note || "",
      mins: meta.mins,
      how: meta.how,
      line: meta.line,
      lc: meta.lc,
    });
  }

  // Location sheet rows. Only the first two suburbs per region are shown as
  // examples, so the order of the suburbs sheet decides which ones appear.
  const AREAS = [{ k: "any", nm: "Anywhere", sb: "SURPRISE ME", lead: true }];
  for (const [key, label] of REGIONS) {
    const names = Object.values(SUB).filter(s => s.region === key).map(s => s.label);
    if (!names.length) continue;
    AREAS.push({ k: key, nm: label, sb: "Eg. " + names.slice(0, 2).map(n => n.toUpperCase()).join(" · ") });
  }

  return { PICKS, SUB, AREAS, warnings };
}

/* ---------------------------------------------------------------- main --- */

console.log("Building…");

const [placeRows, suburbRows] = await Promise.all([
  load("places", process.env.SHEET_PLACES),
  load("suburbs", process.env.SHEET_SUBURBS),
]);

const { PICKS, SUB, AREAS, warnings } = build(placeRows, suburbRows);

if (!PICKS.length) {
  console.error("\n✗ No places survived the build. Nothing written.");
  warnings.forEach(w => console.error("  - " + w));
  process.exit(1);
}

const html = await readFile("src/index.html", "utf8");
if (!html.includes("/*__DATA__*/")) throw new Error("src/index.html is missing the /*__DATA__*/ marker");

const injected = html.replace(
  "/*__DATA__*/ null",
  JSON.stringify({ PICKS, SUB, AREAS }).replace(/</g, "\\u003c")
);

await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/index.html`, injected);

const counts = AREAS.slice(1).map(a => `${a.nm} ${PICKS.filter(p => SUB[p.s].region === a.k).length}`);
console.log(`\n✓ ${OUT}/index.html — ${PICKS.length} places across ${Object.keys(SUB).length} suburbs`);
console.log("  " + counts.join("  ·  "));
if (warnings.length) {
  console.log(`\n${warnings.length} warning${warnings.length > 1 ? "s" : ""}:`);
  warnings.forEach(w => console.log("  - " + w));
}
