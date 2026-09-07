#!/usr/bin/env node
/**
 * Translator 3 (API) — NAEP Data Service  ->  context.naep
 *
 * Pulls average scale scores for all states directly from the NAEP Data
 * Service (no manual export), for the four anchor cells and three years, and
 * writes them into each state's firewalled context region.
 *
 * The first request is printed in full along with the raw response, so the
 * opening run confirms the query and the field names before trusting the rest.
 * If the first call fails or the fields differ, the printout shows exactly what
 * to change.
 *
 * This region is descriptive context only and never touches any score.
 * graduation, absenteeism, and confounders are left for their own files.
 *
 * Zero dependencies. Run:  node fetch-naep.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BASE = "https://www.nationsreportcard.gov/DataService/GetAdhocData.aspx";
const IN_DATA  = process.env.IN_DATA  || "./civic-ai-index.w001.json";
const OUT_DATA = process.env.OUT_DATA || "./civic-ai-index.w001.json";
const YEARS = [2019, 2022, 2024];

// the four anchor cells: subject + grade + composite subscale code + output key
const CELLS = [
  { subject: "mathematics", grade: 4, subscale: "MRPCM", key: "grade4Math" },
  { subject: "reading",     grade: 4, subscale: "RRPCM", key: "grade4Reading" },
  { subject: "mathematics", grade: 8, subscale: "MRPCM", key: "grade8Math" },
  { subject: "reading",     grade: 8, subscale: "RRPCM", key: "grade8Reading" },
];

// state jurisdictions (NAEP uses postal codes for states)
const JUR = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url, retries = 5) {
  let delay = 600;
  for (let attempt = 0; ; attempt++) {
    let res;
    try { res = await fetch(url, { headers: { accept: "application/json" } }); }
    catch (e) { if (attempt >= retries) throw e; await sleep(delay); delay = Math.min(delay * 2, 8000); continue; }
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < retries) { await sleep(delay); delay = Math.min(delay * 2, 8000); continue; }
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} for ${url}\n  body: ${body.slice(0, 300)}`);
  }
}
function buildURL(cell, year) {
  const p = new URLSearchParams({
    type: "data", subject: cell.subject, grade: String(cell.grade), subscale: cell.subscale,
    variable: "TOTAL", jurisdiction: JUR.join(","), stattype: "MN:MN", Year: String(year),
  });
  return `${BASE}?${p.toString()}`;
}
// case-insensitive field read, so small casing differences do not break parsing
const field = (obj, name) => { const k = Object.keys(obj).find(k => k.toLowerCase() === name.toLowerCase()); return k ? obj[k] : undefined; };

async function main() {
  const data = JSON.parse(fs.readFileSync(IN_DATA, "utf8"));
  const naep = {}; // abbr -> year -> { year, cellKey: value }
  let probed = false, points = 0;

  for (const cell of CELLS) {
    for (const year of YEARS) {
      const url = buildURL(cell, year);
      const json = await getJSON(url);
      if (!probed) {
        console.error("PROBE — first request:\n  " + url);
        console.error("  status: " + json.status);
        console.error("  result length: " + (json.result ? json.result.length : "(no result array)"));
        console.error("  sample result[0]: " + JSON.stringify((json.result || [])[0]));
        probed = true;
      }
      for (const row of (json.result || [])) {
        const jur = String(field(row, "jurisdiction") ?? "").trim();
        if (!/^[A-Z]{2}$/.test(jur)) continue;                 // states only
        const disp = field(row, "isStatDisplayable");
        if (disp != null && Number(disp) === 0) continue;      // suppressed
        const v = Number(field(row, "value"));
        if (!isFinite(v)) continue;
        (naep[jur] ??= {});
        (naep[jur][year] ??= { year });
        naep[jur][year][cell.key] = Math.round(v * 10) / 10;
        points++;
      }
      await sleep(250);
    }
  }

  let filled = 0;
  for (const s of data.states) {
    if (!s.context) s.context = { firewalled: true, note: "Descriptive context only. Structurally excluded from every Civic AI Index score.", naep: [], graduationRate: [], chronicAbsenteeism: [], confounders: {} };
    const yrs = naep[s.abbr];
    s.context.naep = yrs ? YEARS.filter(y => yrs[y]).map(y => yrs[y]) : [];
    if (s.context.naep.length) filled++;
  }
  data.meta.contextStatus = "NAEP populated via NAEP Data Service; graduation, absenteeism, and confounders pending.";
  fs.writeFileSync(OUT_DATA, JSON.stringify(data, null, 2));

  console.error("\n==== NAEP fetch report ====");
  console.error(`data points collected: ${points}`);
  console.error(`states with NAEP context: ${filled} of ${data.states.length}`);
  const sample = data.states.find(s => s.context.naep.length);
  if (sample) console.error(`sample (${sample.abbr}): ` + JSON.stringify(sample.context.naep));
  console.error(`wrote ${OUT_DATA}`);
  console.error("This region is firewalled: it is not part of any score.");
}

export { buildURL, field, CELLS, JUR };
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(e => { console.error(e.message || e); process.exit(1); });
}
