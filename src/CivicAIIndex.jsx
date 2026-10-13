import React, { useState, useMemo } from "react";
import { ChevronRight, X, SlidersHorizontal, RotateCcw, ArrowUpRight, Check, Lock, Search } from "lucide-react";
import raw from "./civic-ai-index.w001.json";
import { adaptData } from "./adapter.mjs";

/* =====================================================================
   Civic AI Index — standalone prototype (v0.2 draft)
   Education pilot · U.S. school-district GenAI adoption, rolled up to state.

   TWO DATA LAYERS, coordinated by state / district key:
     • G3O layer  — adoption (activities, sources, institution master)
     • Index layer — enrollment + performance baseline + confounders (Index-owned)
   The build joins them; the performance layer is FIREWALLED from the score.

   Framework (Scoring System v0.2), education-pilot definitions:
     • Breadth        — enrollment-weighted share of students in districts
                        with >=1 active documented deployment (native %).
     • Depth          — enrollment-weighted, stage-weighted intensity among
                        adopting districts (scaled outranks pilot).
     • Governance     — mean share of the four G3O guardrail flags present:
       Quality          human oversight, transparency notice, data
       (highest wt)     classification, risk assessment.
     • Verifiability  — share of deployments corroborated by 2+ sources.

   Design commitments: rank intervals (not point ranks), Verifiability
   surfaced on every row (and driving interval width), a three-click audit.

   SCORES AND ROSTER ARE REAL (G3O wave w001, via ./adapter.mjs). buildData()
   below is the retained synthetic generator, now unused, kept for diffing.
   Graduation / absenteeism / per-pupil-spending context is not yet in the feed.
   ===================================================================== */

const T = {
  ink: "#122a43", ink2: "#2c4055", paper: "#f5f6f8", card: "#ffffff",
  line: "#e2e6ec", line2: "#eef1f4", gold: "#a8812c", goldSoft: "#f2ead6",
  slate: "#5d6b7a", slate2: "#8593a2", good: "#1f5c4d", ctx: "#5a4a7a", ctxSoft: "#efe9f4",
  serif: 'Georgia, "Times New Roman", serif',
  sans: '"Segoe UI", system-ui, -apple-system, Helvetica, Arial, sans-serif',
  mono: '"SFMono-Regular", ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace',
};
const SEQ = ["#e4eaf1","#cdd9e6","#b3c4d7","#95acc6","#7793b4","#5a7aa1","#41628b","#2c4c74","#1c395c","#122a43"];
const decileFill = (s) => SEQ[Math.min(9, Math.max(0, Math.floor(s / 10)))];
const decileText = (s) => (s >= 55 ? "#fff" : T.ink);

function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

const STATES = [
  ["Alabama","AL"],["Alaska","AK"],["Arizona","AZ"],["Arkansas","AR"],["California","CA"],
  ["Colorado","CO"],["Connecticut","CT"],["Delaware","DE"],["Florida","FL"],["Georgia","GA"],
  ["Hawaii","HI"],["Idaho","ID"],["Illinois","IL"],["Indiana","IN"],["Iowa","IA"],
  ["Kansas","KS"],["Kentucky","KY"],["Louisiana","LA"],["Maine","ME"],["Maryland","MD"],
  ["Massachusetts","MA"],["Michigan","MI"],["Minnesota","MN"],["Mississippi","MS"],["Missouri","MO"],
  ["Montana","MT"],["Nebraska","NE"],["Nevada","NV"],["New Hampshire","NH"],["New Jersey","NJ"],
  ["New Mexico","NM"],["New York","NY"],["North Carolina","NC"],["North Dakota","ND"],["Ohio","OH"],
  ["Oklahoma","OK"],["Oregon","OR"],["Pennsylvania","PA"],["Rhode Island","RI"],["South Carolina","SC"],
  ["South Dakota","SD"],["Tennessee","TN"],["Texas","TX"],["Utah","UT"],["Vermont","VT"],
  ["Virginia","VA"],["Washington","WA"],["West Virginia","WV"],["Wisconsin","WI"],["Wyoming","WY"],
];
const TILE = {
  AK:[0,0], ME:[0,10], VT:[1,9], NH:[1,10],
  WA:[2,0], ID:[2,1], MT:[2,2], ND:[2,3], MN:[2,4], IL:[2,5], WI:[2,6], MI:[2,7], NY:[2,8], RI:[2,9], MA:[2,10],
  OR:[3,0], NV:[3,1], WY:[3,2], SD:[3,3], IA:[3,4], IN:[3,5], OH:[3,6], PA:[3,7], NJ:[3,8], CT:[3,9],
  CA:[4,0], UT:[4,1], CO:[4,2], NE:[4,3], MO:[4,4], KY:[4,5], WV:[4,6], VA:[4,7], MD:[4,8], DE:[4,9],
  AZ:[5,1], NM:[5,2], KS:[5,3], AR:[5,4], TN:[5,5], NC:[5,6], SC:[5,7],
  OK:[6,3], LA:[6,4], MS:[6,5], AL:[6,6], GA:[6,7], HI:[7,0], TX:[7,3], FL:[7,8],
};

const VENDORS = ["Khanmigo","MagicSchool AI","Google Gemini for Education","Microsoft Copilot","Amira Learning","Writable","in-house build"];
const ACTIVITIES = ["Student writing feedback assistant","Teacher lesson-planning copilot","Multilingual family communication","IEP drafting support","Early-literacy tutoring","Attendance risk flagging","Administrative helpdesk bot","Grading assistance pilot"];
const CATEGORY = { "Student writing feedback assistant":"Academic","Teacher lesson-planning copilot":"Academic","Multilingual family communication":"Administrative","IEP drafting support":"Administrative","Early-literacy tutoring":"Academic","Attendance risk flagging":"Administrative","Administrative helpdesk bot":"Administrative","Grading assistance pilot":"Academic" };
const STAGE_LADDER = { "Under evaluation":0.25, "Piloting":0.5, "Approved / procured":0.75, "Scaled districtwide":1.0 };
const STAGES = Object.keys(STAGE_LADDER).concat(["Discontinued"]);
const GUARDRAILS = ["Human oversight","Transparency notice","Data classification","Risk assessment"];
const SRC_TYPES = ["Board meeting minutes","District policy page","Local press","State agency memo","Vendor case study","Public records request"];
const YEARS = [2019, 2022, 2024];

function buildData() {
  const r = rng(4207);
  const rows = STATES.map(([name, abbr]) => {
    const capacity = r();                         // latent: nudges BOTH adoption and performance (the confound)
    const base = 30 + capacity * 40 + (r() - 0.5) * 24;
    const breadth = Math.round(Math.min(98, Math.max(6, base + (r() - 0.5) * 30)));
    const depth = Math.round(Math.min(98, Math.max(6, base + (r() - 0.5) * 30)));
    const governance = Math.round(Math.min(98, Math.max(6, base + (r() - 0.5) * 40)));
    const verifiability = Math.round(Math.min(96, Math.max(12, 28 + r() * 66)));

    const enroll = Math.round(90000 + Math.pow(r(), 2) * 5900000);  // K-12 students
    const breadthPct = Math.round(Math.min(96, Math.max(8, breadth + (r() - 0.5) * 16)));      // native: % students in adopting districts
    const depthX = +(0.6 + (depth / 100) * 2.4 + (r() - 0.5) * 0.5).toFixed(1);                 // native: scaled-equiv per adopter

    // performance baseline (Index layer) — NAEP composite scale ~230–290, COVID dip in 2022
    const perfBase = 244 + capacity * 34 + (r() - 0.5) * 12;
    const naep = { 2019: Math.round(perfBase), 2022: Math.round(perfBase - 5 - r() * 4), 2024: Math.round(perfBase - 1 - r() * 3) };
    const grad = Math.round(78 + capacity * 16 + (r() - 0.5) * 6);
    const absent = Math.round(30 - capacity * 14 + (r() - 0.5) * 8);
    const spend = Math.round(9000 + capacity * 15000 + (r() - 0.5) * 3000);
    const perfIndex = Math.round(Math.min(98, Math.max(6, 18 + capacity * 62 + (r() - 0.5) * 26)));  // 0–100 for the quadrant Y

    const nDep = 3 + Math.floor(r() * 4);
    const deployments = Array.from({ length: nDep }, () => {
      const act = ACTIVITIES[Math.floor(r() * ACTIVITIES.length)];
      const g = {}; GUARDRAILS.forEach((k, i) => (g[k] = r() > 0.3 + i * 0.06));
      return {
        district: name + (r() > 0.5 ? " Unified" : " County") + " School District",
        activity: act, category: CATEGORY[act], vendor: VENDORS[Math.floor(r() * VENDORS.length)],
        stage: STAGES[Math.floor(r() * STAGES.length)], access: r() > 0.5 ? "Staff-facing" : "Student-facing",
        year: 2024 + Math.floor(r() * 3), guardrails: g, confidence: ["High","Moderate","Low"][Math.floor(r() * 3)],
        sources: Array.from({ length: 1 + Math.floor(r() * 2) }, () => ({ type: SRC_TYPES[Math.floor(r() * SRC_TYPES.length)], date: (2024 + Math.floor(r() * 3)) + "-0" + (1 + Math.floor(r() * 9)), credibility: ["A","B","C"][Math.floor(r() * 3)] })),
      };
    });
    return { name, abbr, breadth, depth, governance, verifiability, breadthPct, depthX, enroll, naep, grad, absent, spend, perfIndex, deployments };
  });
  return rows;
}
// SEAM — real data wired in through the adapter. buildData() is retained above,
// unused, so the synthetic vs. real view models can be diffed.
const DATA = adaptData(raw);

const DEFAULT_WEIGHTS = { breadth: 0.40, depth: 0.40, governance: 0.10, verifiability: 0.10 };
const COMPONENTS = [
  { key: "breadth", label: "Breadth", native: (r) => `${r.breadthPct}%`, sub: "students reached" },
  { key: "depth", label: "Depth", native: (r) => `${r.depthX.toFixed(1)}×`, sub: "intensity / adopter" },
  { key: "governance", label: "Governance Quality", native: (r) => `${r.governance}%`, sub: "safeguards present" },
  { key: "verifiability", label: "Verifiability", native: (r) => `${r.verifiability}%`, sub: "2+ sources" },
];

function composite(row, w) {
  const s = w.governance + w.breadth + w.depth + w.verifiability || 1;
  return (row.governance * w.governance + row.breadth * w.breadth + row.depth * w.depth + row.verifiability * w.verifiability) / s;
}
function intervalHalf(row) {
  const ev = row.verifiability / 100, vol = Math.min(1, row.enroll / 2500000);
  return Math.max(1, Math.round(7 * (1 - ev) + 3 * (1 - vol)));
}
function evidenceTier(v) {
  if (v >= 66) return { label: "Strong", fill: T.ink, dots: 3 };
  if (v >= 40) return { label: "Moderate", fill: T.slate, dots: 2 };
  return { label: "Thin", fill: T.slate2, dots: 1 };
}
const fmtEnroll = (n) => (n >= 1000000 ? (n / 1000000).toFixed(2) + "M" : Math.round(n / 1000) + "k");

/* ---------- small pieces ---------- */
function Eyebrow({ children, style }) {
  return <div style={{ font: `600 11px/1.4 ${T.sans}`, letterSpacing: "0.14em", textTransform: "uppercase", color: T.slate, ...style }}>{children}</div>;
}
function ScorePill({ value }) {
  return <span style={{ display: "inline-grid", placeItems: "center", justifySelf: "center", minWidth: 46, height: 30, padding: "0 8px", borderRadius: 7, background: decileFill(value), color: decileText(value), font: `600 15px ${T.mono}`, fontVariantNumeric: "tabular-nums" }}>{value}</span>;
}
/* native figure on top, thin percentile bar beneath */
function CompCell({ native, sub, pct, highlight }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ font: `600 15px ${T.mono}`, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{native}</span>
        <span style={{ font: `400 10px ${T.sans}`, color: T.slate2 }}>{sub}</span>
      </div>
      <div style={{ position: "relative", height: 4, width: 104, background: T.line2, borderRadius: 2, marginTop: 4 }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: 4, width: `${pct}%`, background: highlight ? T.gold : T.ink2, borderRadius: 2 }} />
      </div>
    </div>
  );
}
function EvidenceChip({ v }) {
  const t = evidenceTier(v);
  return (
    <span title={`Verifiability ${v} — evidence ${t.label.toLowerCase()}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ display: "inline-flex", gap: 2 }}>{[0,1,2].map((i) => <span key={i} style={{ width: 6, height: 6, borderRadius: 6, background: i < t.dots ? t.fill : T.line }} />)}</span>
      <span style={{ font: `500 11px ${T.sans}`, color: T.slate }}>{t.label}</span>
    </span>
  );
}
function IntervalBand({ rank, half, max = DATA.count }) {
  const lo = Math.max(1, rank - half), hi = Math.min(max, rank + half);
  const pct = (n) => ((n - 1) / (max - 1)) * 100, W = 168;
  return (
    <div style={{ width: W }}>
      <div style={{ position: "relative", height: 16 }}>
        <div style={{ position: "absolute", top: 7, left: 0, right: 0, height: 2, background: T.line }} />
        <div style={{ position: "absolute", top: 5, height: 6, left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%`, background: T.goldSoft, border: `1px solid ${T.gold}`, borderRadius: 4 }} />
        <div style={{ position: "absolute", top: 2, left: `calc(${pct(rank)}% - 5px)`, width: 10, height: 10, borderRadius: 10, background: T.gold, border: "2px solid #fff", boxShadow: "0 0 0 1px " + T.gold }} />
      </div>
      <div style={{ font: `500 10.5px ${T.mono}`, color: T.slate, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>#{rank} · interval {lo}–{hi}</div>
    </div>
  );
}

/* ---------- ranking ---------- */
const GRID = "184px 172px 116px 128px 128px 136px 128px 74px";
function Ranking({ ranked, natAvg, sortKey, setSortKey, lensActive, baselineRank, onOpen, compareSet, toggleCompare }) {
  const H = (key, label, hint) => {
    const active = sortKey === key;
    return (
      <button onClick={() => setSortKey(key)} style={{ border: "none", background: "none", cursor: "pointer", textAlign: "left", padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ font: `${active ? 700 : 600} 11px ${T.sans}`, letterSpacing: "0.07em", textTransform: "uppercase", color: active ? T.ink : T.slate }}>{label}</span>
        {hint && <span style={{ font: `400 10px ${T.sans}`, color: T.slate2 }}>{hint}</span>}
      </button>
    );
  };
  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, alignItems: "end", padding: "16px 20px", borderBottom: `2px solid ${T.ink}`, background: "#fbfcfd" }}>
        <Eyebrow>Rank interval</Eyebrow>
        {H("name", "State")}
        {H("composite", "Index", "0–100")}
        {H("breadth", "Breadth", "students reached")}
        {H("depth", "Depth", "intensity")}
        {H("governance", "Governance", "weighted highest")}
        {H("verifiability", "Verifiability", "evidence")}
        <Eyebrow>Students</Eyebrow>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, alignItems: "center", padding: "12px 20px", background: T.goldSoft, borderBottom: `1px solid ${T.gold}` }}>
        <div style={{ font: `500 10.5px ${T.mono}`, color: T.slate }}>benchmark</div>
        <div style={{ font: `700 14px ${T.sans}`, color: T.ink }}>National average</div>
        <ScorePill value={natAvg.composite} />
        <div style={{ font: `600 14px ${T.mono}`, color: T.ink }}>{natAvg.breadthPct}%</div>
        <div style={{ font: `600 14px ${T.mono}`, color: T.ink }}>{natAvg.depthX}×</div>
        <div style={{ font: `600 14px ${T.mono}`, color: T.ink }}>{natAvg.governance}%</div>
        <div style={{ font: `600 14px ${T.mono}`, color: T.ink }}>{natAvg.verifiability}%</div>
        <div style={{ font: `500 12px ${T.mono}`, color: T.slate }}>{fmtEnroll(natAvg.enroll)}</div>
      </div>

      {ranked.map((row) => {
        const selected = compareSet.has(row.abbr);
        const moved = lensActive ? baselineRank[row.abbr] - row.rank : 0;
        return (
          <div key={row.abbr} onClick={() => onOpen(row)}
            style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, alignItems: "center", padding: "12px 20px", borderBottom: `1px solid ${T.line2}`, background: selected ? "#fcfaf3" : "#fff", cursor: "pointer" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = selected ? "#f9f5e8" : "#fafbfc";
              const icon = e.currentTarget.querySelector("[data-detail-icon]");
              if (icon) icon.style.color = T.ink2;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = selected ? "#fcfaf3" : "#fff";
              const icon = e.currentTarget.querySelector("[data-detail-icon]");
              if (icon) icon.style.color = T.slate2;
            }}>
            <div onClick={(e) => e.stopPropagation()} style={{ cursor: "default" }}><IntervalBand rank={row.rank} half={row.half} /></div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, overflow: "hidden" }}>
              <button onClick={(e) => { e.stopPropagation(); toggleCompare(row.abbr); }} title={selected ? "Remove from comparison" : "Add to comparison"}
                style={{ width: 20, height: 20, borderRadius: 5, border: `1px solid ${selected ? T.gold : T.line}`, background: selected ? T.gold : "#fff", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}>
                {selected && <Check size={13} />}
              </button>
              <span title={row.name} style={{ font: `600 15px ${T.sans}`, color: T.ink, minWidth: 0, flex: "0 1 auto", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</span>
              {moved !== 0 && <span style={{ font: `500 11px ${T.mono}`, color: moved > 0 ? T.good : "#a23b2f", flexShrink: 0 }}>{moved > 0 ? "▲" : "▼"}{Math.abs(moved)}</span>}
              <Search data-detail-icon size={15} style={{ marginLeft: "auto", flexShrink: 0, color: T.slate2, transition: "color .15s" }} />
            </div>
            <ScorePill value={Math.round(row.composite)} />
            <CompCell native={`${row.breadthPct}%`} sub="reached" pct={row.breadth} highlight={sortKey === "breadth"} />
            <CompCell native={`${row.depthX.toFixed(1)}×`} sub="/ adopter" pct={row.depth} highlight={sortKey === "depth"} />
            <CompCell native={`${row.governance}%`} sub="safeguards" pct={row.governance} highlight={sortKey === "governance"} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ font: `600 14px ${T.mono}`, color: T.ink }}>{row.verifiability}%</span>
              <EvidenceChip v={row.verifiability} />
            </div>
            <div style={{ font: `500 12px ${T.mono}`, color: T.slate, fontVariantNumeric: "tabular-nums" }}>{fmtEnroll(row.enroll)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- compare ---------- */
function Compare({ rows, remove }) {
  if (rows.length === 0)
    return (
      <div style={{ background: T.card, border: `1px dashed ${T.line}`, borderRadius: 10, padding: "48px 24px", textAlign: "center" }}>
        <div style={{ font: `600 16px ${T.serif}`, color: T.ink, marginBottom: 6 }}>No states selected yet</div>
        <div style={{ font: `400 14px ${T.sans}`, color: T.slate }}>On the Ranking view, tick the box beside up to five states to build a side-by-side profile.</div>
      </div>
    );
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${rows.length}, 1fr)`, gap: 14 }}>
      {rows.map((row) => (
        <div key={row.abbr} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <div style={{ font: `700 17px ${T.serif}`, color: T.ink }}>{row.name}</div>
              <div style={{ font: `500 11px ${T.mono}`, color: T.slate, marginTop: 2 }}>#{row.rank} · interval {Math.max(1, row.rank - row.half)}–{Math.min(DATA.count, row.rank + row.half)}</div>
            </div>
            <button onClick={() => remove(row.abbr)} style={{ border: "none", background: "none", cursor: "pointer", color: T.slate2 }}><X size={16} /></button>
          </div>
          <div style={{ margin: "14px 0", display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ font: `700 34px ${T.mono}`, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{Math.round(row.composite)}</span>
            <span style={{ font: `500 12px ${T.sans}`, color: T.slate }}>Index score</span>
          </div>
          {COMPONENTS.map((c) => (
            <div key={c.key} style={{ marginBottom: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ font: `500 12px ${T.sans}`, color: T.ink2 }}>{c.label}</span>
                <span style={{ font: `600 12px ${T.mono}`, color: T.ink2 }}>{c.native(row)}</span>
              </div>
              <div style={{ height: 6, background: T.line2, borderRadius: 4 }}><div style={{ height: 6, width: `${row[c.key]}%`, background: c.key === "governance" ? T.ink : T.ink2, borderRadius: 4 }} /></div>
            </div>
          ))}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${T.ctx}` }}>
            <div style={{ font: `600 10px ${T.sans}`, letterSpacing: "0.08em", textTransform: "uppercase", color: T.ctx, marginBottom: 6 }}>Educational context · not scored</div>
            <Row k="NAEP composite (2024)" v={row.naep[2024]} />
            <Row k="Graduation rate" v={row.grad != null ? row.grad + "%" : "—"} />
            <Row k="Chronic absenteeism" v={row.absent != null ? row.absent + "%" : "—"} />
          </div>
        </div>
      ))}
    </div>
  );
}
function Row({ k, v }) {
  return <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}><span style={{ font: `400 12px ${T.sans}`, color: T.slate }}>{k}</span><span style={{ font: `600 12px ${T.mono}`, color: T.ink2 }}>{v}</span></div>;
}

/* ---------- context quadrant (firewalled) ---------- */
function Context({ rows, onOpen }) {
  const W = 720, H = 460, pad = 54;
  const xs = rows.map((r) => r.adoption), ys = rows.map((r) => r.perfIndex);
  const mx = xs.slice().sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  const my = ys.slice().sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  const X = (v) => pad + (v / 100) * (W - pad * 2);
  const Y = (v) => H - pad - (v / 100) * (H - pad * 2);
  const quad = [
    { x: 0.72, y: 0.06, t: "Higher adoption · higher performance" },
    { x: 0.06, y: 0.06, t: "Lower adoption · higher performance" },
    { x: 0.72, y: 0.92, t: "Higher adoption · lower performance" },
    { x: 0.06, y: 0.92, t: "Lower adoption · lower performance" },
  ];
  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, padding: "22px 24px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
        <Lock size={14} color={T.ctx} />
        <span style={{ font: `700 14px ${T.sans}`, color: T.ctx, letterSpacing: "0.02em" }}>Context view — the two axes are independent</span>
      </div>
      <p style={{ font: `400 13px/1.6 ${T.sans}`, color: T.slate, maxWidth: 680, margin: "0 0 14px" }}>
        Horizontal: AI-adoption Index score. Vertical: an educational-performance percentile built from the NAEP baseline. This map is descriptive only. The performance data predates meaningful classroom AI, the two measures share common drivers such as funding and capacity, and <b>co-occurrence is not causation.</b> Performance is never part of the Index score.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        <line x1={X(mx)} y1={pad - 10} x2={X(mx)} y2={H - pad} stroke={T.line} strokeDasharray="4 4" />
        <line x1={pad} y1={Y(my)} x2={W - pad} y2={Y(my)} stroke={T.line} strokeDasharray="4 4" />
        {quad.map((q, i) => <text key={i} x={pad + q.x * (W - pad * 2)} y={pad + q.y * (H - pad * 2)} fontFamily={T.sans} fontSize="10.5" fill={T.slate2} letterSpacing="0.02em">{q.t}</text>)}
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke={T.ink2} strokeWidth="1" />
        <line x1={pad} y1={pad - 10} x2={pad} y2={H - pad} stroke={T.ink2} strokeWidth="1" />
        <text x={W / 2} y={H - 14} textAnchor="middle" fontFamily={T.sans} fontSize="12" fontWeight="600" fill={T.ink2}>AI-adoption Index →</text>
        <text x={-H / 2} y={16} transform="rotate(-90)" textAnchor="middle" fontFamily={T.sans} fontSize="12" fontWeight="600" fill={T.ink2}>Educational performance →</text>
        {rows.map((r) => (
          <g key={r.abbr} style={{ cursor: "pointer" }} onClick={() => onOpen(r)}>
            <circle cx={X(r.adoption)} cy={Y(r.perfIndex)} r="13" fill={decileFill(r.adoption)} stroke="#fff" strokeWidth="1.4" />
            <text x={X(r.adoption)} y={Y(r.perfIndex)} textAnchor="middle" dominantBaseline="central" fontFamily={T.sans} fontWeight="700" fontSize="9.5" fill={decileText(r.adoption)} style={{ pointerEvents: "none" }}>{r.abbr}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ---------- map ---------- */
function MapView({ ranked, onOpen }) {
  const by = Object.fromEntries(ranked.map((r) => [r.abbr, r]));
  const cell = 52, gap = 6, cols = 11, rowsN = 8;
  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ font: `400 13px ${T.sans}`, color: T.slate }}>Each tile is a state, shaded by Index decile. Click to open its profile.</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ font: `500 11px ${T.sans}`, color: T.slate }}>Lower</span>
          {SEQ.map((c, i) => <span key={i} style={{ width: 16, height: 10, background: c }} />)}
          <span style={{ font: `500 11px ${T.sans}`, color: T.slate }}>Higher</span>
        </div>
      </div>
      <div style={{ position: "relative", width: cols * (cell + gap), height: rowsN * (cell + gap), margin: "0 auto" }}>
        {Object.entries(TILE).map(([abbr, [rr, cc]]) => {
          const row = by[abbr]; if (!row) return null;
          const v = Math.round(row.composite);
          return (
            <button key={abbr} onClick={() => onOpen(row)} title={`${row.name} · ${v} · #${row.rank}`}
              style={{ position: "absolute", left: cc * (cell + gap), top: rr * (cell + gap), width: cell, height: cell, borderRadius: 7, border: `1px solid ${T.line}`, background: decileFill(v), color: decileText(v), cursor: "pointer", display: "grid", placeItems: "center", padding: 0 }}>
              <span style={{ font: `700 13px ${T.sans}` }}>{abbr}</span>
              <span style={{ font: `500 11px ${T.mono}`, opacity: 0.9 }}>{v}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- methodology ---------- */
function Methodology() {
  const B = (h, body) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ font: `700 15px ${T.serif}`, color: T.ink, marginBottom: 6 }}>{h}</div>
      <div style={{ font: `400 14px/1.65 ${T.sans}`, color: T.ink2 }}>{body}</div>
    </div>
  );
  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, padding: "28px 32px", maxWidth: 760 }}>
      <Eyebrow style={{ marginBottom: 10 }}>How to read this index</Eyebrow>
      {B("Breadth — how many students are reached", <>An enrollment-weighted estimate of the share of a state's public-school students who are in districts with at least one active, documented deployment. A district counts on the basis of that documented activity; reach is inferred from the record, not surveyed. Built by joining G3O adoption to district enrollment.</>)}
      {B("Depth — how far adopters have gone", <>Among adopting districts, an enrollment-weighted, stage-weighted intensity: a districtwide, scaled deployment counts for more than a single pilot (under evaluation 0.25, piloting 0.50, approved 0.75, scaled 1.00; discontinued excluded). Reported as scaled-equivalent deployments per adopter, so both count and maturity register.</>)}
      {B("Governance Quality — responsible adoption", <>The mean share, across a state's deployments, of the four G3O guardrail flags present: <b>human oversight, transparency notice, data classification, and risk assessment.</b> Size-neutral, and weighted highest, so discipline outweighs volume.</>)}
      {B("Verifiability — strength of the record", <>The share of a state's deployments corroborated by two or more independent sources. Because it also drives the width of the rank interval, an under-documented state reads as under-measured rather than simply low-ranked.</>)}
      {B("Rank intervals, not point ranks", <>Every state sits inside a rank interval that widens where evidence is thin. This answers the standard objection — "we are not lagging, we are under-documented" — inside the visual itself.</>)}
      {B("Rankability threshold", <>
        <p style={{ margin: "0 0 10px" }}>Not every state carries enough documented adoption to support a ranking. A state is ranked only where the Index has observed at least three adopting districts and at least five documented findings supporting them. States below either bar are reported as documented but not yet rankable: their adoption is shown where the evidence exists, but they receive no composite score and no position in the ranking.</p>
        <p style={{ margin: 0 }}>The threshold reflects a deliberate asymmetry. A ranking built on one or two districts would misstate a state in both directions — overstating it where those districts happen to be unusually active, understating it where they are simply the only ones yet observed. Where the evidence is too thin to separate signal from artifact, the Index withholds a score rather than publish one it cannot defend. The instrument is built to under-claim before it over-claims.</p>
      </>)}
      {B("Confidence standard", <p style={{ margin: 0 }}>The Index scores only findings recorded at high confidence. Findings held at medium or low confidence are retained in the underlying record but excluded from every score, so that a state’s standing rests on adoption that is well evidenced rather than on the full volume of what has been observed.</p>)}
      {B("The educational-performance layer is firewalled", <>NAEP grade-4 and grade-8 reading and math (2019, 2022, 2024), graduation rate, and chronic absenteeism are shown as <b>context only</b> and are never part of the Index score. They come from the Index's own data layer, joined to G3O adoption by state. The performance baseline predates meaningful classroom AI; it describes what kinds of states adopt, not what adoption does. Any two-axis view is descriptive, adjusts for nothing, and asserts no relationship.</>)}
      <div style={{ marginTop: 8, padding: "14px 16px", background: T.goldSoft, border: `1px solid ${T.gold}`, borderRadius: 8, font: `500 13px/1.55 ${T.sans}`, color: T.ink }}>
        Adoption data: documented deployments from the Global Government GenAI Observatory (G3O), wave w001; coverage is in progress and not yet systematic, so figures describe the documented record, not a census. Governance and corroboration are documented rarely at this stage and are reported as findings. Sources — G3O (CC BY 4.0), NCES enrollment, NAEP performance context. Context is descriptive and never part of any score.
      </div>
    </div>
  );
}

/* ---------- drawer (3-click audit + firewalled performance) ---------- */
function Drawer({ row, onClose }) {
  const [open, setOpen] = useState(null);
  if (!row) return null;
  const naepDelta = row.naep[2024] - row.naep[2019];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 40 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(18,42,67,0.28)" }} />
      <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width: "min(580px, 95vw)", background: T.paper, boxShadow: "-8px 0 30px rgba(18,42,67,0.18)", overflowY: "auto" }}>
        <div style={{ padding: "22px 26px", background: T.ink, color: "#fff", position: "sticky", top: 0, zIndex: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <div style={{ font: `600 10.5px ${T.sans}`, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.7 }}>State profile · Education domain</div>
              <div style={{ font: `700 24px ${T.serif}`, marginTop: 4 }}>{row.name}</div>
              <div style={{ font: `500 12px ${T.mono}`, opacity: 0.85, marginTop: 3 }}>#{row.rank} · interval {Math.max(1, row.rank - row.half)}–{Math.min(DATA.count, row.rank + row.half)} · {fmtEnroll(row.enroll)} students</div>
            </div>
            <button onClick={onClose} style={{ border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", borderRadius: 7, width: 32, height: 32, display: "grid", placeItems: "center", cursor: "pointer" }}><X size={17} /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 16 }}>
            {COMPONENTS.map((c) => (
              <div key={c.key}>
                <div style={{ font: `700 18px ${T.mono}` }}>{c.native(row)}</div>
                <div style={{ font: `500 10.5px ${T.sans}`, opacity: 0.7 }}>{c.label.split(" ")[0]}</div>
                <div style={{ font: `400 9.5px ${T.sans}`, opacity: 0.55 }}>{c.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "20px 26px" }}>
          <Eyebrow style={{ marginBottom: 4 }}>Deployment roster</Eyebrow>
          <div style={{ font: `400 13px ${T.sans}`, color: T.slate, marginBottom: 14 }}>The scored evidence behind this state, from the G3O documented record (wave w001). Open a deployment to reach its sources — the third click of the audit.</div>
          {row.deployments.map((d, i) => {
            const isOpen = open === i, gOn = Object.values(d.guardrails).filter(Boolean).length;
            return (
              <div key={i} style={{ border: `1px solid ${T.line}`, borderRadius: 9, marginBottom: 10, background: "#fff", overflow: "hidden" }}>
                <button onClick={() => setOpen(isOpen ? null : i)} style={{ width: "100%", border: "none", background: "none", cursor: "pointer", padding: "13px 15px", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ font: `600 14px ${T.sans}`, color: T.ink }}>{d.activity}</span>
                      <span style={{ font: `500 10px ${T.sans}`, color: d.category === "Academic" ? T.good : T.ctx, background: d.category === "Academic" ? "#e8f1ee" : T.ctxSoft, padding: "1px 7px", borderRadius: 20 }}>{d.category}</span>
                    </div>
                    <div style={{ font: `400 12px ${T.sans}`, color: T.slate, marginTop: 2 }}>{d.district}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                    <span style={{ font: `500 11px ${T.sans}`, color: T.slate }}>{d.stage}</span>
                    <ChevronRight size={16} color={T.slate2} style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                  </div>
                </button>
                {isOpen && (
                  <div style={{ padding: "4px 15px 15px", borderTop: `1px solid ${T.line2}` }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", margin: "12px 0" }}>
                      <Field k="Vendor / tool" v={d.vendor} /><Field k="Access type" v={d.access} />
                      <Field k="First observed" v={String(d.year)} /><Field k="Confidence" v={d.confidence} />
                    </div>
                    <div style={{ font: `600 11px ${T.sans}`, letterSpacing: "0.06em", textTransform: "uppercase", color: T.slate, margin: "10px 0 6px" }}>Guardrail flags ({gOn}/4)</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                      {Object.entries(d.guardrails).map(([g, on]) => (
                        <span key={g} style={{ font: `500 11.5px ${T.sans}`, padding: "3px 9px", borderRadius: 20, background: on ? "#e8f1ee" : "#f3f0ee", color: on ? T.good : T.slate, border: `1px solid ${on ? "#cfe4dd" : T.line}` }}>{on ? "✓ " : "— "}{g}</span>
                      ))}
                    </div>
                    <div style={{ font: `600 11px ${T.sans}`, letterSpacing: "0.06em", textTransform: "uppercase", color: T.slate, margin: "10px 0 6px" }}>Sources</div>
                    {d.sources.map((s, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${T.line2}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ font: `700 10px ${T.mono}`, color: "#fff", background: s.credibility === "A" ? T.good : s.credibility === "B" ? T.gold : T.slate2, borderRadius: 4, padding: "1px 5px" }}>{s.credibility}</span>
                          <span style={{ font: `500 13px ${T.sans}`, color: T.ink2 }}>{s.type}</span>
                        </div>
                        {s.date && s.date !== "unknown" && (
                          <span style={{ display: "flex", alignItems: "center", gap: 6, font: `500 12px ${T.mono}`, color: T.slate }}>{s.date}<ArrowUpRight size={13} /></span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ font: `400 12px ${T.sans}`, color: T.slate2, marginTop: 2, fontStyle: "italic" }}>Coverage is in progress, not a census; governance and corroboration are documented rarely at this stage and are reported as findings.</div>

          {/* firewalled performance panel */}
          <div style={{ marginTop: 22, border: `1px dashed ${T.ctx}`, borderRadius: 10, background: T.ctxSoft, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
              <Lock size={13} color={T.ctx} />
              <span style={{ font: `700 12px ${T.sans}`, letterSpacing: "0.04em", textTransform: "uppercase", color: T.ctx }}>Educational context — not part of the score</span>
            </div>
            <div style={{ font: `400 12px ${T.sans}`, color: T.slate, marginBottom: 14 }}>A pre-AI baseline for reference. Not a component of the Index and asserts no relationship to adoption.</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 12 }}>
              <div>
                <div style={{ font: `500 11px ${T.sans}`, color: T.slate }}>NAEP composite</div>
                <div style={{ display: "flex", alignItems: "end", gap: 8, marginTop: 4 }}>
                  {YEARS.map((y) => {
                    const v = row.naep[y], h = 18 + (v - 230) * 1.2;
                    return (
                      <div key={y} style={{ textAlign: "center" }}>
                        <div style={{ width: 30, height: Math.max(10, h), background: y === 2024 ? T.ctx : "#c9bcdb", borderRadius: "3px 3px 0 0" }} />
                        <div style={{ font: `500 10px ${T.mono}`, color: T.slate, marginTop: 3 }}>{y}</div>
                        <div style={{ font: `600 10px ${T.mono}`, color: T.ink2 }}>{v}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ font: `400 11px ${T.sans}`, color: T.slate }}>2019 → 2024</div>
                <div style={{ font: `600 14px ${T.mono}`, color: naepDelta >= 0 ? T.good : "#a23b2f" }}>{naepDelta >= 0 ? "+" : ""}{naepDelta} pts</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ background: "#fff", borderRadius: 7, padding: "9px 12px" }}><div style={{ font: `400 11px ${T.sans}`, color: T.slate }}>Graduation rate</div><div style={{ font: `700 18px ${T.mono}`, color: T.ink }}>{row.grad != null ? `${row.grad}%` : "—"}</div></div>
              <div style={{ background: "#fff", borderRadius: 7, padding: "9px 12px" }}><div style={{ font: `400 11px ${T.sans}`, color: T.slate }}>Chronic absenteeism</div><div style={{ font: `700 18px ${T.mono}`, color: T.ink }}>{row.absent != null ? `${row.absent}%` : "—"}</div></div>
            </div>
            <div style={{ font: `400 11px ${T.sans}`, color: T.slate2, marginTop: 10 }}>Baseline confounder on file: {row.spend != null ? `$${row.spend.toLocaleString()} per-pupil spending` : "per-pupil spending pending the NCES pull"}. Captured for later analysis; not displayed as a ranking.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
function Field({ k, v }) {
  return <div><div style={{ font: `500 11px ${T.sans}`, color: T.slate }}>{k}</div><div style={{ font: `500 13.5px ${T.sans}`, color: T.ink, marginTop: 1 }}>{v}</div></div>;
}

/* ---------- weighting lens ---------- */
function WeightLens({ weights, setWeights, onReset }) {
  const total = weights.governance + weights.breadth + weights.depth + weights.verifiability;
  return (
    <div style={{ background: "#fbfcfd", border: `1px solid ${T.line}`, borderRadius: 10, padding: "16px 18px", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SlidersHorizontal size={15} color={T.ink} />
          <span style={{ font: `700 13px ${T.sans}`, color: T.ink }}>Weighting lens</span>
          <span style={{ font: `400 12px ${T.sans}`, color: T.slate }}>— adjust the emphasis and the ranking recomputes live</span>
        </div>
        <button onClick={onReset} style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${T.line}`, background: "#fff", borderRadius: 6, padding: "5px 10px", cursor: "pointer", font: `500 12px ${T.sans}`, color: T.ink2 }}><RotateCcw size={12} /> Reset</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 18 }}>
        {COMPONENTS.map((c) => (
          <div key={c.key}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ font: `500 12px ${T.sans}`, color: T.ink2 }}>{c.label}</span>
              <span style={{ font: `600 12px ${T.mono}`, color: T.ink }}>{Math.round((weights[c.key] / total) * 100)}%</span>
            </div>
            <input type="range" min="0" max="60" value={Math.round(weights[c.key] * 100)} onChange={(e) => setWeights({ ...weights, [c.key]: Number(e.target.value) / 100 })} style={{ width: "100%", accentColor: T.gold }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===================== shell ===================== */
export default function CivicAIIndex() {
  const [view, setView] = useState("ranking");
  const [sortKey, setSortKey] = useState("composite");
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [lensOpen, setLensOpen] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [compareSet, setCompareSet] = useState(new Set());

  const lensActive = lensOpen && JSON.stringify(weights) !== JSON.stringify(DEFAULT_WEIGHTS);
  const enriched = useMemo(() => DATA.map((r) => ({ ...r, composite: composite(r, weights), half: intervalHalf(r) })), [weights]);
  const baselineRank = useMemo(() => {
    const b = DATA.map((r) => ({ abbr: r.abbr, c: composite(r, DEFAULT_WEIGHTS) })).sort((a, z) => z.c - a.c);
    const m = {}; b.forEach((x, i) => (m[x.abbr] = i + 1)); return m;
  }, []);
  const ranked = useMemo(() => {
    const arr = [...enriched];
    if (sortKey === "name") arr.sort((a, z) => a.name.localeCompare(z.name));
    else if (sortKey === "composite") arr.sort((a, z) => z.composite - a.composite);
    else arr.sort((a, z) => z[sortKey] - a[sortKey]);
    const byComp = [...enriched].sort((a, z) => z.composite - a.composite);
    const rankMap = {}; byComp.forEach((x, i) => (rankMap[x.abbr] = i + 1));
    return arr.map((x) => ({ ...x, rank: rankMap[x.abbr], adoption: Math.round(composite(x, DEFAULT_WEIGHTS)) }));
  }, [enriched, sortKey]);
  // national-average row is built in the adapter (means, enroll a sum) and attached to DATA;
  // its composite is recomputed live so the benchmark tracks the weighting lens
  const natAvg = useMemo(() => ({ ...DATA.natAvg, composite: Math.round(composite(DATA.natAvg, weights)) }), [weights]);
  const compareRows = ranked.filter((r) => compareSet.has(r.abbr)).slice(0, 5);
  const toggleCompare = (abbr) => setCompareSet((prev) => { const n = new Set(prev); if (n.has(abbr)) n.delete(abbr); else if (n.size < 5) n.add(abbr); return n; });

  const TABS = [["ranking", "Ranking"], ["map", "Map"], ["compare", `Compare${compareSet.size ? ` · ${compareSet.size}` : ""}`], ["context", "Context"], ["methodology", "Methodology"]];

  return (
    <div style={{ minHeight: "100vh", background: T.paper, font: T.sans }}>
      <header style={{ background: T.ink, color: "#fff" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ font: `700 21px ${T.serif}` }}>Civic AI Index</span>
            <span style={{ font: `500 12px ${T.sans}`, opacity: 0.62 }}>An independent evaluation</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ font: `500 11.5px ${T.sans}`, opacity: 0.7 }}>Data partner: G3O</span>
            <span style={{ font: `600 10.5px ${T.sans}`, letterSpacing: "0.08em", textTransform: "uppercase", background: T.gold, color: T.ink, padding: "4px 9px", borderRadius: 5 }}>G3O w001 · documented record</span>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "30px 28px 18px" }}>
        {/* headline breaks once, before the em-dash; the standfirst below shares the same measure */}
        <h1 style={{ font: `700 30px/1.2 ${T.serif}`, color: T.ink, margin: "0 0 8px", maxWidth: 1024 }}>How far are U.S. school districts advancing through generative AI <br />— and how well is it governed?</h1>
        <p style={{ font: `400 15px/1.6 ${T.sans}`, color: T.slate, margin: 0, maxWidth: 1024 }}>
          The pilot scores generative-AI adoption across roughly sixteen thousand U.S. school districts, weighted by enrollment and rolled up to the state level, on four components: Breadth, Depth, Governance Quality, and Verifiability. An educational-performance baseline is shown alongside, as context only.
        </p>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px", position: "sticky", top: 0, zIndex: 20, background: T.paper }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.line}` }}>
          <div style={{ display: "flex", gap: 4 }}>
            {TABS.map(([k, label]) => (
              <button key={k} onClick={() => setView(k)} style={{ border: "none", background: "none", cursor: "pointer", padding: "12px 14px", font: `${view === k ? 700 : 500} 14px ${T.sans}`, color: view === k ? T.ink : T.slate, borderBottom: `2px solid ${view === k ? T.gold : "transparent"}`, marginBottom: -1 }}>{label}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ font: `500 12px ${T.sans}`, color: T.slate }}>Domain</span>
            <span style={{ font: `600 13px ${T.sans}`, color: T.ink, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 6, padding: "6px 11px" }}>Education ▾</span>
            {view === "ranking" && (
              <button onClick={() => setLensOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${lensActive ? T.gold : T.line}`, background: lensOpen ? T.goldSoft : "#fff", borderRadius: 6, padding: "6px 11px", cursor: "pointer", font: `600 13px ${T.sans}`, color: T.ink }}><SlidersHorizontal size={14} /> Weighting lens</button>
            )}
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 28px 60px" }}>
        {view === "ranking" && (
          <>
            {lensOpen && <WeightLens weights={weights} setWeights={setWeights} onReset={() => setWeights(DEFAULT_WEIGHTS)} />}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ font: `400 13px ${T.sans}`, color: T.slate }}>{sortKey === "composite" ? "Ranked by composite Index score. Each cell leads with the real figure; the bar shows the cross-state percentile." : `Sorted by ${COMPONENTS.find((c) => c.key === sortKey)?.label}. Rank number stays tied to the composite.`}</div>
              <div style={{ font: `400 12px ${T.sans}`, color: T.slate2 }}>Click a row to audit · tick to compare</div>
            </div>
            <Ranking ranked={ranked} natAvg={natAvg} sortKey={sortKey} setSortKey={setSortKey} lensActive={lensActive} baselineRank={baselineRank} onOpen={setDrawer} compareSet={compareSet} toggleCompare={toggleCompare} />
            <div style={{ font: `400 12px ${T.sans}`, color: T.slate2, marginTop: 12 }}>DC and territories are listed unranked until evidence depth supports inclusion. Federal-agency deployments are scored on a separate Federal track.</div>
          </>
        )}
        {view === "map" && <MapView ranked={ranked} onOpen={setDrawer} />}
        {view === "compare" && <Compare rows={compareRows} remove={toggleCompare} />}
        {view === "context" && <Context rows={ranked} onOpen={setDrawer} />}
        {view === "methodology" && <Methodology />}
      </main>

      <footer style={{ borderTop: `1px solid ${T.line}`, background: "#fff" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <span style={{ font: `400 12.5px ${T.sans}`, color: T.slate }}>Authored by the Civic AI Index. Adoption data from the Global Government GenAI Observatory (G3O), CC BY 4.0. Enrollment from NCES; NAEP shown as performance context, never scored.</span>
          <span style={{ font: `400 12.5px ${T.sans}`, color: T.slate2 }}>G3O wave w001 · documented record, not a census · context layer in progress</span>
        </div>
      </footer>

      {drawer && <Drawer row={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}
