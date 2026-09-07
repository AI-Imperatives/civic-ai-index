/**
 * adapter.mjs — real Civic AI Index schema  ->  dashboard view model
 *
 * The dashboard was written against a synthetic record shape. This adapter maps
 * the real civic-ai-index.w001.json onto that shape so no view has to change.
 * It is the seam replacement for `const DATA = buildData()`:
 *
 *     import raw from "./civic-ai-index.w001.json";
 *     import { adaptData } from "./adapter.mjs";
 *     const DATA = adaptData(raw);           // array of state records
 *     const NAT_AVG = DATA.natAvg;           // national-average row
 *
 * Contract honoured (from the dashboard inventory):
 *  - score fields breadth/depth/governance/verifiability are 0..100 and feed
 *    composite(); we emit percentile(breadth), percentile(depth), raw
 *    governance, raw verifiability, each *100, so the lens reproduces our
 *    composite.
 *  - native display figures breadthPct (% students reached) and depthX (stage
 *    intensity) are separate, from the RAW breadth/depth.
 *  - verifiability and enroll are real (they drive rank-interval width).
 *  - perfIndex (Context Y) is derived from NAEP; adoption (Context X) = composite.
 *  - naep is year-keyed (2019/2022/2024) with a ~230-290 composite for the Drawer.
 *  - guardrails keys match the UI's GUARDRAILS display strings, values boolean
 *    (true only where the safeguard is documented "yes").
 *  - natAvg.enroll is a SUM; all other natAvg fields are MEANS.
 */

const ABBR_NAME = { AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming" };

const GUARDRAIL_LABEL = {
  human_oversight: "Human oversight",
  transparency_notice: "Transparency notice",
  data_classification: "Data classification",
  risk_assessment: "Risk assessment",
};
const STAGE_LABEL = { proposed: "Proposed", announced: "Announced", pilot: "Piloting", production: "Production", unknown: "Unknown" };

const r1 = x => Math.round(x * 10) / 10;
const r2 = x => Math.round(x * 100) / 100;
const yr = v => { const m = String(v ?? "").match(/\b(20\d\d)\b/); return m ? +m[1] : null; };

// mean of a state's four NAEP cells for one year record
function cellMean(n) {
  const c = [n.grade4Math, n.grade4Reading, n.grade8Math, n.grade8Reading].filter(x => x != null);
  return c.length ? c.reduce((a, b) => a + b, 0) / c.length : null;
}

export function adaptData(raw) {
  // only states with a computed composite can be ranked; unscored states (e.g. a
  // single adopting district with no reported enrollment) are held out of the
  // ranked set. They can be surfaced separately once the UI has an unscored state.
  const scored = raw.states.filter(s => s.adoption && s.adoption.composite != null);

  // perfIndex: percentile (0..100) of each state's PRE-AI (2019) NAEP performance,
  // the "prior performance" axis of the context quadrant. Falls back to the
  // earliest available year, then to 50 if a state has no NAEP.
  const perfRaw = new Map();
  for (const s of scored) {
    const naep = (s.context && s.context.naep) || [];
    const base = naep.find(n => n.year === 2019) || naep[0];
    perfRaw.set(s.abbr, base ? cellMean(base) : null);
  }
  const perfSorted = [...perfRaw.values()].filter(v => v != null).sort((a, b) => a - b);
  const perfPct = v => (v == null || perfSorted.length < 2) ? null
    : perfSorted.filter(x => x < v).length / (perfSorted.length - 1);

  const states = scored.map(s => {
    const a = s.adoption;
    // score fields (0..100) — percentiles for breadth/depth, raw for the floors
    const breadth = r2(a.breadthPercentile * 100);
    const depth = r2(a.depthPercentile * 100);
    const governance = r2(a.governance * 100);
    const verifiability = r2(a.verifiability * 100);
    const composite = r1(a.composite * 100);
    // native display figures from the raw shares
    const breadthPct = r1(a.breadth * 100);   // % of students in adopting districts
    const depthX = r2(a.depth);               // stage-weighted intensity, 0.25..1.00
    // context
    const pi = perfPct(perfRaw.get(s.abbr));
    const perfIndex = pi == null ? 50 : r1(pi * 100);
    const naep = {};
    for (const n of ((s.context && s.context.naep) || [])) {
      const m = cellMean(n); if (m != null) naep[n.year] = Math.round(m);
    }
    // collapse exact duplicate deployments within the state (same district +
    // activity_name) before the roster is built; keep the better-sourced row,
    // first-seen position and order. Three such pairs exist in wave w001.
    const dedupKey = d =>
      (((d.district && d.district.name) || "").replace(/\s*\(\d+\)\s*$/, "").trim()) + "␟" + d.activity_name;
    const byKey = new Map();
    for (const d of ((s.evidence && s.evidence.deployments) || [])) {
      const prev = byKey.get(dedupKey(d));
      if (!prev || (d.evidence || []).length > (prev.evidence || []).length) byKey.set(dedupKey(d), d);
    }

    // roster (adoption deployments only), display-only
    const deployments = [...byKey.values()]
      .filter(d => d.countsAsAdoption ?? (d.activity_type !== "policy_guidance"))
      .map(d => ({
        // strip the trailing NCES/state parenthetical id, e.g. "MARANA UNIFIED DISTRICT (4404)"
        district: ((d.district && d.district.name) || "").replace(/\s*\(\d+\)\s*$/, "").trim(),
        activity: d.activity_name,
        category: d.activity_type,
        stage: STAGE_LABEL[d.adoption_stage] || d.adoption_stage,
        vendor: d.vendor,
        access: d.access_type,        // dashboard Drawer reads d.access, not d.accessType
        year: (yr(d.year_deployed) || yr(d.year_announced)) ?? "unknown",
        confidence: d.confidence,
        guardrails: Object.fromEntries(
          Object.entries(GUARDRAIL_LABEL).map(([k, label]) => [label, (d.safeguards && d.safeguards[k]) === "yes"])
        ),
        sources: (d.evidence || []).map(e => ({
          // dashboard Drawer reads s.type for the source label and s.date / s.credibility;
          // it never reads s.title or s.url, so the human-readable source_title is emitted as `type`.
          type: e.source_title, url: e.source_url, date: e.source_publication_date, credibility: e.source_credibility,
        })),
      }));

    return {
      name: ABBR_NAME[s.abbr] || s.abbr, abbr: s.abbr,
      breadth, depth, governance, verifiability, composite,
      breadthPct, depthX,
      enroll: (a.inputs && a.inputs.totalPublicEnrollment) || 0,
      perfIndex, adoption: composite,
      naep, deployments,
      // firewalled context the Compare/Drawer panels read but the feed does not yet
      // carry: graduation, chronic absenteeism, per-pupil spending (NCES performance
      // pull pending). Emitted as null so the views render an em-dash, never crash.
      grad: null, absent: null, spend: null,
      // guidance summary carried through for a future panel; ignored by current views
      guidance: s.guidance || null,
    };
  });

  // rank by composite (descending)
  states.sort((x, y) => y.composite - x.composite);
  states.forEach((s, i) => { s.rank = i + 1; });

  // national-average row: enroll is a SUM, everything else a MEAN
  const mean = f => r1(states.reduce((acc, s) => acc + f(s), 0) / states.length);
  // the four score fields carry two decimals (as on the state rows) so the
  // benchmark's headline pill reconciles with its component bars
  const mean2 = f => r2(states.reduce((acc, s) => acc + f(s), 0) / states.length);
  const natAvg = {
    name: "National average", abbr: "US",
    breadth: mean2(s => s.breadth), depth: mean2(s => s.depth),
    governance: mean2(s => s.governance), verifiability: mean2(s => s.verifiability),
    composite: mean(s => s.composite), perfIndex: mean(s => s.perfIndex),
    breadthPct: mean(s => s.breadthPct), depthX: r2(states.reduce((a, s) => a + s.depthX, 0) / states.length),
    enroll: states.reduce((a, s) => a + s.enroll, 0),
  };

  states.natAvg = natAvg;   // attach so callers can read DATA.natAvg
  states.count = states.length;
  return states;
}

export default adaptData;
