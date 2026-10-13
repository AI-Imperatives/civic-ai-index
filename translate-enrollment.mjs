#!/usr/bin/env node
/**
 * Translator 2 + aggregate — NCES enrollment  ->  Breadth and Depth
 *
 * Reads Translator 1's output (g3o-adoption.w001.json) and an NCES enrollment
 * export (an ELSI district table with a "Total Students" membership column),
 * joins them on LEAID, and fills in the enrollment-weighted figures that were
 * left null: Breadth, Depth, the composite, and the enrollment inputs.
 *
 * The enrollment column name varies between ELSI exports, so this script
 * auto-detects the LEAID, state, and enrollment columns and prints what it
 * chose. If it picks wrong, the printout shows the candidates so we can pin it.
 *
 * Zero dependencies. Run:  node translate-enrollment.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const IN_DATA   = process.env.IN_DATA   || "./g3o-adoption.w001.json";
const OUT_DATA  = process.env.OUT_DATA  || "./civic-ai-index.w001.json";
const WEIGHTS = { governance: 0.10, breadth: 0.40, depth: 0.40, verifiability: 0.10 }; // w001-v3

// Resolve the enrollment CSV: explicit env var, else ./enrollment.csv, else the
// first ELSI export in this folder (so the download need not be renamed).
function resolveEnrollCsv() {
  if (process.env.ENROLL_CSV) return process.env.ENROLL_CSV;
  if (fs.existsSync("./enrollment.csv")) return "./enrollment.csv";
  const elsi = fs.readdirSync(".").filter(f => /elsi.*\.csv$/i.test(f)).sort();
  if (elsi.length) return elsi[0];
  return "./enrollment.csv"; // will error clearly if absent
}
const ENROLL_CSV = resolveEnrollCsv();

const pad7 = x => (x || "").trim().padStart(7, "0");
const round = x => Math.round(x * 1000) / 1000;

// ----------------------- minimal CSV parser -----------------------
function parseCSV(text) {
  const rows = []; let row = [], field = "", i = 0, inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; } field += c; i++; continue; }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ----------------------- column detection -------------------------
function yearScore(name) { const m = name.match(/(20\d\d)\s*-\s*\d\d/); return m ? +m[1] : 0; }
function pickLeaid(header) {
  return header.find(h => /agency id.*nces/i.test(h)) || header.find(h => /\bleaid\b/i.test(h)) || null;
}
function pickState(header) {
  return header.find(h => /state abbr.*\[district\]/i.test(h)) || header.find(h => /state abbr/i.test(h))
      || header.find(h => /state name.*\[district\]/i.test(h)) || header.find(h => /\bstate\b/i.test(h)) || null;
}
function pickEnroll(header) {
  // candidates: prefer "Total Students" at the district level; then membership; then any "students"
  let cands = header.filter(h => /total students/i.test(h));
  if (!cands.length) cands = header.filter(h => /membership/i.test(h));
  if (!cands.length) cands = header.filter(h => /\bstudents\b/i.test(h));
  if (!cands.length) return { chosen: null, candidates: [] };
  // prefer district-level, then "includes ae", then latest year
  const rank = h => (/\[district\]/i.test(h) ? 100 : 0) + (/includes ae/i.test(h) ? 10 : 0) + yearScore(h) / 10000;
  const chosen = [...cands].sort((a, b) => rank(b) - rank(a))[0];
  return { chosen, candidates: cands };
}

// ----------------------- enrollment parse -------------------------
function parseEnroll(v) {
  if (v == null) return null;
  const s = String(v).replace(/[,\s]/g, "").trim();
  return /^\d+$/.test(s) ? parseInt(s, 10) : null; // ELSI uses †, –, ‡ etc. for missing/NA
}

function loadEnrollment(csvText) {
  const rows = parseCSV(csvText);
  // ELSI wraps the table in title/notes lines above and footnotes below. Find the
  // real header row (the one naming the Agency ID or Total Students columns).
  let h0 = rows.findIndex(r => r.some(c => /agency id.*nces/i.test(c) || /total students/i.test(c)));
  if (h0 < 0) h0 = 0;
  const header = rows[h0].map(h => h.trim());
  const leaidCol = pickLeaid(header), stateCol = pickState(header), enr = pickEnroll(header);
  if (!leaidCol) throw new Error("Could not find an NCES Agency ID (LEAID) column. Columns: " + JSON.stringify(header));
  if (!enr.chosen) throw new Error("Could not find an enrollment column (looked for 'Total Students'). Columns: " + JSON.stringify(header));
  const li = header.indexOf(leaidCol), si = stateCol ? header.indexOf(stateCol) : -1, ei = header.indexOf(enr.chosen);

  const map = new Map(); // leaid -> { enrollment, state }
  let parsed = 0, missingEnroll = 0;
  for (let r = h0 + 1; r < rows.length; r++) {
    const row = rows[r]; if (!row || row.length <= Math.max(li, ei)) continue; // skips blank/footnote lines
    const leaid = pad7(row[li]); if (leaid.length !== 7) continue;
    const state = si >= 0 ? (row[si] || "").trim() : "";
    const enrollment = parseEnroll(row[ei]);
    if (enrollment == null) missingEnroll++;
    map.set(leaid, { enrollment, state });
    parsed++;
  }
  return { map, chosen: { leaidCol, stateCol, enrollCol: enr.chosen, candidates: enr.candidates }, parsed, missingEnroll };
}

// --------------------------- main ---------------------------------
function main() {
  const data = JSON.parse(fs.readFileSync(IN_DATA, "utf8"));
  console.error("Loading enrollment:", ENROLL_CSV);
  const { map: enr, chosen, parsed, missingEnroll } = loadEnrollment(fs.readFileSync(ENROLL_CSV, "utf8"));
  console.error(`  LEAID column:      ${chosen.leaidCol}`);
  console.error(`  State column:      ${chosen.stateCol || "(none found; will rely on Translator 1 state)"}`);
  console.error(`  Enrollment column: ${chosen.enrollCol}`);
  if (chosen.candidates.length > 1) console.error(`  (other enrollment candidates: ${JSON.stringify(chosen.candidates.filter(c => c !== chosen.enrollCol))})`);
  console.error(`  rows parsed: ${parsed}, rows with missing enrollment: ${missingEnroll}`);

  // state totals (denominator) and district counts from the enrollment universe
  const totalByState = new Map(), distCountByState = new Map();
  for (const [, { enrollment, state }] of enr) {
    if (!state) continue;
    distCountByState.set(state, (distCountByState.get(state) || 0) + 1);
    if (enrollment != null) totalByState.set(state, (totalByState.get(state) || 0) + enrollment);
  }

  // adopting districts (numerator): leaid -> max stage weight across its adoption findings
  const adopting = new Map();
  for (const s of data.states) for (const dep of s.evidence.deployments) {
    const isAdopt = dep.countsAsAdoption ?? (dep.activity_type !== "policy_guidance"); // robust to older files
    if (!isAdopt) continue;
    const leaid = dep.district?.leaid; if (!leaid) continue;
    const cur = adopting.get(leaid) || { maxStage: null };
    if (dep.stageWeight != null) cur.maxStage = Math.max(cur.maxStage ?? 0, dep.stageWeight);
    adopting.set(leaid, cur);
  }

  // roll adopting districts up by state (state comes from the enrollment file, keyed by LEAID)
  const adoptEnroll = new Map(), depthNum = new Map(), depthDen = new Map(), adoptCount = new Map();
  let notInEnrollFile = 0, adoptMissingEnroll = 0;
  for (const [leaid, { maxStage }] of adopting) {
    const e = enr.get(leaid);
    if (!e) { notInEnrollFile++; continue; }
    const st = e.state;
    adoptCount.set(st, (adoptCount.get(st) || 0) + 1);
    if (e.enrollment == null) { adoptMissingEnroll++; continue; }
    adoptEnroll.set(st, (adoptEnroll.get(st) || 0) + e.enrollment);
    if (maxStage != null) {
      depthNum.set(st, (depthNum.get(st) || 0) + e.enrollment * maxStage);
      depthDen.set(st, (depthDen.get(st) || 0) + e.enrollment);
    }
  }

  // fill each state record with the raw enrollment-weighted figures
  for (const s of data.states) {
    const st = s.state, a = s.adoption;
    const total = totalByState.get(st) || 0;
    const num = adoptEnroll.get(st) || 0;
    // a state with no adopting districts is UNSCORED: breadth is null, not 0
    const breadth = total > 0 && (adoptCount.get(st) || 0) > 0 ? num / total : null;
    const dDen = depthDen.get(st) || 0, dNum = depthNum.get(st) || 0;
    const depth = dDen > 0 ? dNum / dDen : null;
    a.breadth = breadth == null ? null : round(breadth);
    a.depth = depth == null ? null : round(depth);
    a.inputs.totalPublicEnrollment = total || null;
    a.inputs.districtCount = distCountByState.get(st) || null;
    a.inputs.enrollmentInAdoptingDistricts = num || null;
    a.composite = null; // set in the normalization pass below
  }

  // NORMALISE: rank breadth and depth into percentiles across the scored states,
  // then blend. Governance and verifiability stay raw (near-zero floors this wave);
  // normalising them would amplify meaningless jitter, contrary to their low weights.
  // Raw breadth/depth are left intact for the two-axis reach-vs-intensity view.
  // Evidence floor: a state is rankable only with enough documented adoption to
  // support a score. States below either threshold keep their raw breadth/depth but
  // get no percentiles and composite = null, held out exactly like a no-adoption state.
  const MIN_DISTRICTS = 3, MIN_FINDINGS = 5;
  const meetsFloor = s => (s.adoption.inputs.adoptingDistrictCount || 0) >= MIN_DISTRICTS
                       && (s.adoption.inputs.findingCount || 0) >= MIN_FINDINGS;
  const hasData = s => s.adoption.breadth != null && s.adoption.depth != null;
  const belowFloor = data.states.filter(s => hasData(s) && !meetsFloor(s));
  const scorable = data.states.filter(s => hasData(s) && meetsFloor(s));
  const pctMap = vals => {
    const srt = [...vals].sort((x, y) => x - y), n = vals.length, m = new Map();
    for (const v of new Set(vals)) m.set(v, n > 1 ? srt.filter(x => x < v).length / (n - 1) : 0);
    return m;
  };
  const pB = pctMap(scorable.map(s => s.adoption.breadth));
  const pD = pctMap(scorable.map(s => s.adoption.depth));
  for (const s of scorable) {
    const a = s.adoption;
    a.breadthPercentile = round(pB.get(a.breadth));
    a.depthPercentile = round(pD.get(a.depth));
    a.composite = round(
      WEIGHTS.breadth * a.breadthPercentile + WEIGHTS.depth * a.depthPercentile +
      WEIGHTS.governance * a.governance + WEIGHTS.verifiability * a.verifiability
    );
  }
  const statesScored = scorable.length;

  data.meta.dataStatus = "REAL_ADOPTION";
  data.meta.dataStatusNote = "Adoption fully computed from live G3O wave w001 joined to NCES enrollment. The performance context layer is still pending.";
  data.meta.enrollmentSource = chosen.enrollCol;
  data.meta.rankingFloor = { minAdoptingDistricts: MIN_DISTRICTS, minFindings: MIN_FINDINGS, note: "States below either threshold are unranked (composite null)." };
  data.meta.compositeMethod = "Composite = 0.40*breadthPercentile + 0.40*depthPercentile + 0.10*governance + 0.10*verifiability. Breadth and Depth are percentile-ranked across scored states; governance and verifiability are raw. Raw breadth and depth are retained for the two-axis view. (w001-v3)";
  fs.writeFileSync(OUT_DATA, JSON.stringify(data, null, 2));

  // ---- run report ----
  const ranked = [...scorable].sort((x, y) => y.adoption.composite - x.adoption.composite);
  console.error("\n==== enrollment aggregate report ====");
  console.error(`states scored (breadth & depth computed, >=${MIN_DISTRICTS} districts & >=${MIN_FINDINGS} findings): ${statesScored} of ${data.states.length}`);
  console.error(`held out below evidence floor: ${belowFloor.length} ` + JSON.stringify(belowFloor.map(s => `${s.state}(${s.adoption.inputs.adoptingDistrictCount}d/${s.adoption.inputs.findingCount}f)`)));
  console.error(`adopting districts not found in enrollment file: ${notInEnrollFile}`);
  console.error(`adopting districts with no enrollment value:      ${adoptMissingEnroll}`);
  console.error(`wrote ${OUT_DATA}`);
  console.error(`top 10 by composite (normalised ranking):`);
  for (const s of ranked.slice(0, 10)) {
    const a = s.adoption;
    console.error(`  ${s.state}  composite=${a.composite}  breadth=${a.breadth} (pct ${a.breadthPercentile})  depth=${a.depth} (pct ${a.depthPercentile})`);
  }
  console.error("\nComposite is percentile-normalised (breadth & depth ranked across states, then blended).");
  console.error("Raw breadth and depth are retained on each state for the two-axis reach-vs-intensity view.");
}

export { loadEnrollment, pickEnroll, pickLeaid, pickState, parseEnroll };
if (import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (e) { console.error(e.message || e); process.exit(1); }
}
