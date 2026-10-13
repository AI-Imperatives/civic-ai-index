#!/usr/bin/env node
/**
 * Translator 1 — G3O institutions + findings  ->  Civic AI Index schema v2
 *
 * Reads the live G3O read API (wave w001) and the interim NCES district
 * directory (Districtwebsites25.csv), and writes a schema-conforming data
 * file plus a crosswalk review report.
 *
 * What it computes NOW (needs only G3O): governance, verifiability,
 * documentationRate, zeroSafeguardShare, adoptingDistrictCount, findingCount,
 * stageMix, and the full evidence roster with LEAIDs attached.
 *
 * What it leaves PENDING enrollment (Translator 2): breadth, depth, composite,
 * and the enrollment fields in `inputs`. These are emitted as null so the swap
 * is a slot-in, not a rewrite.
 *
 * Zero dependencies: Node 18+ global fetch, built-in fs, and an inline CSV
 * parser. Run:  node translate-g3o.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ----------------------------- config -----------------------------
const API   = "https://api.g3observatory.org";
const WAVE  = "w001";
const NCES_CSV = process.env.NCES_CSV || "./Districtwebsites25.csv";
const OUT_DATA = process.env.OUT_DATA || "./g3o-adoption.w001.json";
const OUT_REVIEW = process.env.OUT_REVIEW || "./crosswalk-review.w001.json";
const PAGE = 200;          // API max limit
const CONCURRENCY = 4;     // gentle parallelism; getJSON backs off on 429

// ----------------------- ruled constants --------------------------
const STAGE_LADDER = { proposed: 0.25, announced: 0.50, pilot: 0.75, production: 1.00 };
// 'unknown' absent by design: counts for adoption (Breadth) but excluded from Depth.
const SAFEGUARDS = ["human_oversight", "transparency_notice", "data_classification", "risk_assessment"];
const WEIGHTS = { governance: 0.10, breadth: 0.40, depth: 0.40, verifiability: 0.10 }; // w001-v3

// Adoption versus guidance. A policy or guidance document is not a deployment, so
// it does not count toward adoption (Breadth, Depth, Governance, Verifiability). It
// is retained in the roster and summarised in a separate guidance layer.
const NON_ADOPTION_TYPES = new Set(["policy_guidance"]);
// High-confidence gate: only confidence === "high" deployment findings are scored.
// Lower-confidence deployment findings are excluded entirely (not adoption, not
// guidance, not in the roster); they are only tallied in the run report.
const classifyFinding = f =>
  NON_ADOPTION_TYPES.has(f.activity_type) ? "guidance"
  : f.confidence === "high" ? "adoption"
  : "excluded";
const countsAsAdoption = f => classifyFinding(f) === "adoption";

// ----------------------------- helpers ----------------------------
function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return null; }
}
function isInstitutional(h, instHost) {
  if (!h || !instHost) return false;
  return h === instHost || h.endsWith("." + instHost) || instHost.endsWith("." + h);
}
function normName(s) {
  return (s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\bSCHOOL DISTRICT\b|\bPUBLIC SCHOOLS\b|\bSCHOOLS\b|\bSCHOOL\b|\bDISTRICT\b|\bCOUNTY\b|\bINDEPENDENT\b|\bUNIFIED\b|\bCOMMUNITY\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function pad7(x) { return (x || "").trim().padStart(7, "0"); }

// ---- ruled computations (validated) ----
function governanceShare(f) {
  return SAFEGUARDS.filter(k => (f.safeguards?.[k]) === "yes").length / 4;
}
function anySafeguardYes(f) {
  return SAFEGUARDS.some(k => (f.safeguards?.[k]) === "yes");
}
function stageWeight(f) {
  const s = f.adoption_stage;
  return (s in STAGE_LADDER) ? STAGE_LADDER[s] : null; // null = unknown -> excluded from Depth
}
function annotateEvidence(evidence, instHost) {
  return (evidence || []).map(e => {
    const h = hostOf(e.source_url);
    return { ...e, source_host: h, institutional: isInstitutional(h, instHost) };
  });
}
function isVerified(annotatedEvidence) {
  const hosts = new Map(); // distinct host -> institutional?
  for (const e of annotatedEvidence) if (e.source_host) hosts.set(e.source_host, e.institutional);
  if (hosts.size < 2) return false;                     // dedup by host, need >= 2 distinct
  return [...hosts.values()].some(inst => !inst);       // at least one non-institutional
}

// ----------------------- minimal CSV parser -----------------------
// RFC-4180-ish: handles quoted fields, embedded commas/newlines, "" escapes.
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", i = 0, inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ----------------------- NCES crosswalk ---------------------------
const COL = {
  leaid: "Agency ID - NCES Assigned [District] Latest available year",
  name:  "Agency Name",
  state: "State Abbr [District] Latest available year",
  web:   "Web Site URL [District] 2024-25",
};
function buildCrosswalk(csvText) {
  const rows = parseCSV(csvText);
  const header = rows[0];
  const idx = Object.fromEntries(Object.entries(COL).map(([k, name]) => [k, header.indexOf(name)]));
  for (const [k, j] of Object.entries(idx)) if (j < 0) throw new Error("Missing NCES column: " + COL[k]);

  const byHost = new Map();       // website host -> record
  const byNameState = new Map();  // normName|ST -> record (only if unique)
  const nameStateSeen = new Map();
  let count = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < header.length) continue;
    const leaid = pad7(row[idx.leaid]);
    if (leaid.length !== 7) continue;
    const state = (row[idx.state] || "").trim();
    const name = (row[idx.name] || "").trim();
    const webRaw = (row[idx.web] || "").trim();
    const web = (webRaw && webRaw !== "\u2020") ? webRaw : null;
    const rec = { leaid, state, name, website: web };
    count++;

    const h = hostOf(web);
    if (h && !byHost.has(h)) byHost.set(h, rec); // first wins; collisions rare

    const key = normName(name) + "|" + state;
    nameStateSeen.set(key, (nameStateSeen.get(key) || 0) + 1);
    if (!byNameState.has(key)) byNameState.set(key, rec);
  }
  // drop ambiguous name|state keys so a bad match never silently wins
  for (const [key, n] of nameStateSeen) if (n > 1) byNameState.delete(key);

  return { byHost, byNameState, count };
}

// state resolution for an institution goes through its matched NCES record;
// unmatched institutions cannot be placed in a state and are reported.
function crosswalk(inst, xw, det) {
  const h = hostOf(inst.website);
  if (h && xw.byHost.has(h)) return { rec: xw.byHost.get(h), method: "website" };
  // institution has no state field; try name against every state's key is wrong,
  // so name-fallback is only usable when we can bound the state. G3O US districts
  // do not carry state; we therefore match name across the unique national name
  // keys by stripping state when the normName is nationally unique.
  const nm = normName(inst.institution_name);
  // build a name-only unique index lazily on first use
  if (!xw._byName) {
    xw._byName = new Map(); const seen = new Map();
    for (const rec of xw.byNameState.values()) {
      const k = normName(rec.name);
      seen.set(k, (seen.get(k) || 0) + 1);
      if (!xw._byName.has(k)) xw._byName.set(k, rec);
    }
    for (const [k, n] of seen) if (n > 1) xw._byName.delete(k);
  }
  if (xw._byName.has(nm)) return { rec: xw._byName.get(nm), method: "name" };
  // evidence-domain fallback: when G3O carries no usable website, the district's
  // own domain is usually quoted in its findings' evidence, and that domain is in
  // the NCES file. (Arlington has null website but its findings cite apsva.us,
  // which resolves cleanly.) Marked distinctly so it can be spot-checked.
  if (det && Array.isArray(det.findings)) {
    const seen = new Set();
    for (const f of det.findings) for (const e of (f.evidence || [])) {
      const eh = hostOf(e.source_url);
      if (eh && !seen.has(eh)) { seen.add(eh); if (xw.byHost.has(eh)) return { rec: xw.byHost.get(eh), method: "evidence-domain" }; }
    }
  }
  return null;
}

// --------------------------- G3O fetch ----------------------------
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url, retries = 6) {
  let delay = 500;
  for (let attempt = 0; ; attempt++) {
    let res;
    try { res = await fetch(url, { headers: { accept: "application/json" } }); }
    catch (e) { if (attempt >= retries) throw e; await sleep(delay); delay = Math.min(delay * 2, 8000); continue; }
    if (res.ok) return res.json();
    // back off on rate limit (429) and transient server errors (5xx)
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const ra = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : delay;
      await sleep(wait + Math.random() * 250); // jitter
      delay = Math.min(delay * 2, 8000);
      continue;
    }
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
}
async function fetchAdoptingInstitutions() {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${API}/institutions?country_iso3=USA&institution_type=school_district&sort=findings&limit=${PAGE}&offset=${offset}`;
    const page = await getJSON(url);
    const data = page.data || [];
    if (!data.length) break;
    let hitZero = false;
    for (const inst of data) {
      if ((inst.finding_count || 0) < 1) { hitZero = true; break; }
      out.push(inst);
    }
    if (hitZero || data.length < PAGE) break;
  }
  return out;
}
async function fetchDetail(uid) {
  const j = await getJSON(`${API}/institutions/${uid}`);
  return j?.data ?? j; // the detail endpoint wraps the record in {meta,data:{...}}, like the list
}
async function pool(items, size, worker) {
  const results = []; let i = 0;
  async function run() { while (i < items.length) { const idx = i++; results[idx] = await worker(items[idx], idx); } }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
  return results;
}

// FIPS -> USPS (first two digits of LEAID give the state; used only as a label)
const FIPS = { "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY" };

// --------------------------- main ---------------------------------
async function main() {
  console.error("Reading NCES crosswalk:", NCES_CSV);
  const xw = buildCrosswalk(fs.readFileSync(NCES_CSV, "utf8"));
  console.error(`  crosswalk rows: ${xw.count}, by-host: ${xw.byHost.size}, unique name|state: ${xw.byNameState.size}`);

  console.error("Fetching adopting US school districts from G3O ...");
  const institutions = await fetchAdoptingInstitutions();
  console.error(`  adopting institutions (finding_count>=1): ${institutions.length}`);

  console.error("Fetching detail records ...");
  const details = await pool(institutions, CONCURRENCY, inst => fetchDetail(inst.institution_uid).catch(e => { console.error("  detail failed", inst.institution_uid, e.message); return null; }));

  // group everything by state
  const states = new Map(); // ST -> { deployments:[], findings:[], districts:Map(leaid->maxStage) }
  const review = { matchedWebsite: 0, matchedName: 0, matchedEvidence: 0, evidenceMatches: [], unmatched: [] };
  const activityTypes = new Map();
  const excludedByConfidence = new Map(); // non-guidance findings with confidence !== "high"

  let detailErrors = 0, suspiciousEmpty = 0; const sampleShapes = [];
  for (let k = 0; k < institutions.length; k++) {
    const inst = institutions[k], det = details[k];
    // crosswalk every institution from its list record (website is present there),
    // independent of whether the detail fetch succeeded, so the match report covers all 807.
    const xm = crosswalk(inst, xw, det);
    if (!xm) { review.unmatched.push({ uid: inst.institution_uid, name: inst.institution_name, website: inst.website, finding_count: inst.finding_count }); continue; }
    if (xm.method === "website") review.matchedWebsite++;
    else if (xm.method === "name") review.matchedName++;
    else { review.matchedEvidence++; review.evidenceMatches.push({ uid: inst.institution_uid, g3oName: inst.institution_name, ncesName: xm.rec.name, state: xm.rec.state, leaid: xm.rec.leaid }); }
    const rec = xm.rec;
    const ST = rec.state || FIPS[rec.leaid.slice(0, 2)] || "??";
    const instHost = hostOf(rec.website || inst.website);

    if (!states.has(ST)) states.set(ST, { deployments: [], adoptionFindings: [], districts: new Map(), guidanceDistricts: new Set(), guidanceFindings: 0 });
    const S = states.get(ST);

    if (!det) { detailErrors++; continue; }                // matched, but detail fetch failed
    const findings = det.findings || [];
    if (!findings.length && (inst.finding_count || 0) >= 1) { // shape guard: should never fire
      suspiciousEmpty++;
      if (sampleShapes.length < 3) sampleShapes.push({ uid: inst.institution_uid, topLevelKeys: Object.keys(det || {}) });
    }
    let districtMaxStage = null, districtHasAdoption = false;
    for (const f of findings) {
      activityTypes.set(f.activity_type, (activityTypes.get(f.activity_type) || 0) + 1);
      if (classifyFinding(f) === "excluded") {          // low-confidence deployment: count only
        const c = String(f.confidence);
        excludedByConfidence.set(c, (excludedByConfidence.get(c) || 0) + 1);
        continue;
      }
      const ev = annotateEvidence(f.evidence, instHost);
      const sw = stageWeight(f);
      const isAdopt = countsAsAdoption(f);
      const dep = {
        finding_uid: f.finding_uid,
        district: { name: rec.name, leaid: rec.leaid, website: rec.website, institution_uid: inst.institution_uid, matchMethod: xm.method },
        activity_name: f.activity_name, activity_type: f.activity_type,
        countsAsAdoption: isAdopt,
        tool_name: f.tool_name, vendor: f.vendor,
        adoption_stage: f.adoption_stage, stageWeight: sw,
        deployment_mode: f.deployment_mode, target_users: f.target_users, access_type: f.access_type,
        year_announced: f.year_announced, year_deployed: f.year_deployed,
        safeguards: f.safeguards, governanceShare: governanceShare(f),
        confidence: f.confidence,
        evidence: ev, verified: isVerified(ev),
      };
      S.deployments.push(dep); // roster shows everything, adoption and guidance alike
      if (isAdopt) {
        S.adoptionFindings.push(dep);
        districtHasAdoption = true;
        if (sw !== null) districtMaxStage = Math.max(districtMaxStage ?? 0, sw);
      } else {
        S.guidanceFindings++;
        S.guidanceDistricts.add(rec.leaid);
      }
    }
    if (districtHasAdoption) S.districts.set(rec.leaid, districtMaxStage); // adopting districts only
  }

  // assemble states
  const stageLabelOf = w => Object.keys(STAGE_LADDER).find(k => STAGE_LADDER[k] === w) || "unknown";
  const stateRecords = [];
  for (const [ST, S] of [...states].sort()) {
    const findings = S.adoptionFindings;                 // guidance excluded from every component
    // a state with no scored-adoption findings is UNSCORED: components are null, not 0
    const n = findings.length;
    const governance = n ? findings.reduce((a, d) => a + d.governanceShare, 0) / n : null;
    const verifiability = n ? findings.filter(d => d.verified).length / n : null;
    const documentationRate = governance; // mean governanceShare
    const zeroSafeguardShare = n ? findings.filter(d => !anySafeguardYes(d)).length / n : null;
    const stageMix = { proposed: 0, announced: 0, pilot: 0, production: 0, unknown: 0 };
    for (const [, maxStage] of S.districts) stageMix[maxStage === null ? "unknown" : stageLabelOf(maxStage)]++;
    // guidance layer: districts with guidance, and those whose ONLY activity is guidance
    let guidanceOnly = 0;
    for (const leaid of S.guidanceDistricts) if (!S.districts.has(leaid)) guidanceOnly++;

    stateRecords.push({
      state: ST, abbr: ST,
      adoption: {
        breadth: null, depth: null,
        governance: round(governance), verifiability: round(verifiability),
        documentationRate: round(documentationRate), zeroSafeguardShare: round(zeroSafeguardShare),
        composite: null,
        inputs: {
          totalPublicEnrollment: null, districtCount: null,
          adoptingDistrictCount: S.districts.size,
          enrollmentInAdoptingDistricts: null,
          findingCount: findings.length, stageMix,
        },
      },
      guidance: {
        note: "Published AI policy or guidance. Not adoption; not part of any score.",
        districtCount: S.guidanceDistricts.size,
        guidanceOnlyDistrictCount: guidanceOnly,
        findingCount: S.guidanceFindings,
      },
      evidence: { deployments: S.deployments },
      context: { firewalled: true, note: "Descriptive context only. Structurally excluded from every Civic AI Index score.", naep: [], graduationRate: [], chronicAbsenteeism: [], confounders: {} },
    });
  }

  const doc = {
    meta: {
      schemaVersion: "2.0", generated: new Date().toISOString().slice(0, 10), wave: WAVE,
      dataStatus: "PARTIAL_REAL",
      dataStatusNote: "Adoption, governance, and verifiability are computed from live G3O wave w001. Breadth and Depth are pending NCES enrollment. Context is pending.",
      coverageNote: "G3O coverage is in progress and is not yet systematic or fully validated.",
      attribution: "Global Government GenAI Observatory (G3O), 2026. g3observatory.org, CC BY 4.0. Accessed " + new Date().toISOString().slice(0, 10) + ".",
      weights: WEIGHTS, weightingVersion: "w001-v3",
      stageLadder: STAGE_LADDER, safeguardFlags: SAFEGUARDS, naepYears: [2019, 2022, 2024],
    },
    states: stateRecords,
  };

  fs.writeFileSync(OUT_DATA, JSON.stringify(doc, null, 2));
  fs.writeFileSync(OUT_REVIEW, JSON.stringify(review, null, 2));

  // ------- run report -------
  const totalFindings = stateRecords.reduce((a, s) => a + s.adoption.inputs.findingCount, 0);
  const adoptingDistricts = stateRecords.reduce((a, s) => a + s.adoption.inputs.adoptingDistrictCount, 0);
  const guidanceOnly = stateRecords.reduce((a, s) => a + s.guidance.guidanceOnlyDistrictCount, 0);
  const guidanceFindings = stateRecords.reduce((a, s) => a + s.guidance.findingCount, 0);
  console.error("\n==== run report ====");
  console.error(`states with adoption: ${stateRecords.length}`);
  console.error(`districts matched:    website ${review.matchedWebsite}, name ${review.matchedName}, evidence-domain ${review.matchedEvidence}, UNMATCHED ${review.unmatched.length}`);
  console.error(`detail fetch errors:  ${detailErrors} (of ${institutions.length} adopting districts)`);
  if (suspiciousEmpty) {
    console.error(`WARNING: ${suspiciousEmpty} matched districts had finding_count>=1 but 0 findings parsed.`);
    console.error(`  This means the finding array is not where expected. Sample detail top-level keys:`);
    console.error(`  ` + JSON.stringify(sampleShapes));
  }
  const statesWithAdoption = stateRecords.filter(s => s.adoption.inputs.adoptingDistrictCount > 0).length;
  const excludedTotal = [...excludedByConfidence.values()].reduce((a, b) => a + b, 0);
  console.error(`SCORED ADOPTION (deployment, confidence=high): ${adoptingDistricts} districts, ${totalFindings} findings`);
  console.error(`states with >=1 scored-adoption district: ${statesWithAdoption} (of ${stateRecords.length} state records)`);
  console.error(`EXCLUDED (deployment, confidence!=high): ${excludedTotal} findings ` + JSON.stringify(Object.fromEntries(excludedByConfidence)));
  console.error(`GUIDANCE (separate layer):  ${guidanceOnly} guidance-only districts, ${guidanceFindings} guidance findings`);
  console.error(`activity_type vocabulary:   ` + JSON.stringify(Object.fromEntries([...activityTypes].sort((a, b) => b[1] - a[1]))));
  console.error(`wrote ${OUT_DATA} and ${OUT_REVIEW}`);
  console.error("Breadth/Depth are null pending the NCES enrollment pull (Translator 2).");
}
function round(x) { return x == null ? null : Math.round(x * 1000) / 1000; }

// export for testing; run main() only when invoked directly (cross-platform:
// pathToFileURL handles Windows drive letters and backslashes correctly)
export { buildCrosswalk, crosswalk, governanceShare, isVerified, annotateEvidence, stageWeight, normName, pad7, hostOf };
if (import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(e => { console.error(e); process.exit(1); });
}
