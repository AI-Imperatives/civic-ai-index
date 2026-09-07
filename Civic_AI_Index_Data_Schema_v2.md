# Civic AI Index — Data Schema Specification

**Education Pilot, Version 2.0**
**Status: partly real. Adoption, governance, verifiability, and the full evidence roster are computed from live G3O data (wave w001). Enrollment-weighted Breadth and Depth are pending the NCES enrollment pull. The performance context layer is pending.**

Version 2.0 revises v1.0 in the places where G3O's real API shape and four settled rulings diverged from the original assumptions: the stage ladder now uses G3O's vocabulary, the guardrail flags are a three-state enum rather than booleans, Verifiability enforces source independence, and the component weights are restruck for Phase 1 with a documented revisit condition.

---

## 1. Purpose and architecture

The Index owns this schema. The dashboard reads a pre-built static file conforming to it and never calls any external source directly. Each source is converted into the schema by a dedicated translator.

Three sources:

- **G3O read API** (`https://api.g3observatory.org`, open, no key) — institutions and findings. An institution is a district; a finding is a deployment. Wave `w001` is the current fixed, published version.
- **NCES enrollment** — public-school enrollment by district (LEAID), from the Common Core of Data. The join partner for enrollment-weighting. Not yet pulled.
- **NCES performance** — NAEP (2019, 2022, 2024), graduation, absenteeism, confounders. The firewalled context layer. Not yet pulled.

Each state record has three regions: **adoption** (scored), **evidence** (audit roster), **context** (firewalled, never scored).

### The central principle, unchanged

One compute step produces the adoption region. Today it runs on live G3O findings plus a synthetic stand-in for enrollment; when the NCES enrollment pull lands, only the enrollment inputs change and the logic is identical. The methodology describes the destination; the translators are how the data arrives at it.

### Build-time versus runtime, unchanged

Build-time computes the four components and stores them. Runtime recomputes only the composite, live in the browser, from the four stored components and the current weights as the weighting lens moves. The browser never touches raw findings, enrollment, or the context region.

---

## 2. Top-level structure

```json
{ "meta": { ... }, "states": [ { "state": "...", "abbr": "..", "adoption": {...}, "evidence": {...}, "context": {...} } ] }
```

### meta

```json
{
  "schemaVersion": "2.0",
  "generated": "2026-09-04",
  "wave": "w001",
  "dataStatus": "PARTIAL_REAL",
  "dataStatusNote": "Adoption, governance, and verifiability are computed from live G3O wave w001. Breadth and Depth are pending NCES enrollment. Context is pending.",
  "coverageNote": "G3O coverage is in progress and is not yet systematic or fully validated. Every figure describes the documented record, not a census, and this notice stays on the Index until G3O lifts its own caveat.",
  "provenance": {
    "adoption": "G3O read API wave w001 (institutions + findings); LEAID via NCES district-directory crosswalk (interim, until G3O exposes LEAID)",
    "evidence": "G3O read API wave w001 (findings + evidence)",
    "context": "pending (NCES / NAEP)"
  },
  "attribution": "Global Government GenAI Observatory (G3O), 2026. g3observatory.org, CC BY 4.0. Accessed 2026-09-04. The Civic AI Index transforms the source: it crosswalks G3O districts to NCES identifiers, weights by enrollment, and scores. Data CC BY 4.0; Index code MIT.",
  "weights": { "governance": 0.10, "breadth": 0.35, "depth": 0.35, "verifiability": 0.20 },
  "weightingVersion": "w001-v2",
  "weightingNote": "See Section 9. Governance is down-weighted for Phase 1 because documented safeguards are systemically sparse during initial adoption. Weights are stamped to the wave.",
  "stageLadder": { "proposed": 0.25, "announced": 0.50, "pilot": 0.75, "production": 1.00 },
  "stageNote": "G3O adoption_stage values. 'unknown' counts toward adoption (Breadth) but is excluded from stage-weighting (Depth). G3O carries no 'discontinued' value and no active flag, so abandoned deployments cannot be detected in wave w001.",
  "safeguardFlags": ["human_oversight", "transparency_notice", "data_classification", "risk_assessment"],
  "safeguardNote": "Each safeguard is a three-state value in G3O: 'yes', 'not_documented', 'unclear'. Only 'yes' is credited (Section 6).",
  "naepYears": [2019, 2022, 2024]
}
```

---

## 3. The adoption region (scored)

```json
{
  "breadth": null,
  "depth": null,
  "governance": 0.07,
  "verifiability": 0.31,
  "documentationRate": 0.07,
  "zeroSafeguardShare": 0.86,
  "composite": null,
  "inputs": {
    "totalPublicEnrollment": null,
    "districtCount": null,
    "adoptingDistrictCount": 12,
    "enrollmentInAdoptingDistricts": null,
    "findingCount": 41,
    "stageMix": { "proposed": 3, "announced": 2, "pilot": 5, "production": 1, "unknown": 1 }
  }
}
```

`null` marks a figure pending the enrollment pull. `governance`, `verifiability`, `documentationRate`, `zeroSafeguardShare`, `adoptingDistrictCount`, `findingCount`, and `stageMix` are computable now from G3O alone. `breadth`, `depth`, `totalPublicEnrollment`, `districtCount`, `enrollmentInAdoptingDistricts`, and `composite` wait on NCES enrollment.

`documentationRate` and `zeroSafeguardShare` are first-class headline figures, not merely inputs to Governance. `zeroSafeguardShare` (the share of documented deployments with no safeguard documented at all) is the governance-gap statistic the Index reports prominently (Section 9). `stageMix` counts adopting districts by their district-level stage (the maximum stage across the district's findings); districts whose findings are all `unknown`-stage fall in the `unknown` bucket and are excluded from Depth.

---

## 4. The evidence region (audit roster)

Field names follow G3O's real payload, with derived fields added by the translator.

```json
{
  "deployments": [
    {
      "finding_uid": "G3O-F-w001-00002881",
      "district": {
        "name": "Arlington County Public Schools",
        "leaid": "5100270",
        "website": "http://www.apsva.us",
        "institution_uid": "G3O-I-00651649",
        "matchMethod": "website"
      },
      "activity_name": "Google Gemini and NotebookLM availability for APS staff",
      "activity_type": "internal_operational",
      "category": "Administrative",
      "tool_name": "Gemini and NotebookLM",
      "vendor": "Google",
      "adoption_stage": "production",
      "stageWeight": 1.00,
      "deployment_mode": "integrated",
      "target_users": "internal_staff",
      "access_type": "proprietary_vendor",
      "year_announced": "unknown",
      "year_deployed": "unknown",
      "safeguards": { "human_oversight": "not_documented", "transparency_notice": "not_documented", "data_classification": "not_documented", "risk_assessment": "not_documented" },
      "governanceShare": 0.0,
      "confidence": "high",
      "evidence": [
        { "evidence_uid": "G3O-E-w001-00082051", "source_url": "https://www.apsva.us/...", "source_title": "...", "source_publication_date": "unknown", "source_type": "official_gov", "source_credibility": "high", "source_host": "apsva.us", "institutional": true }
      ],
      "verified": false
    }
  ]
}
```

Derived fields the translator adds: `district.leaid`, `district.website`, `district.matchMethod` (how the crosswalk resolved: `website`, `name`, or `manual`); `category` (from `activity_type`, Section 6); `stageWeight` (from `adoption_stage`, `null` if `unknown`); `governanceShare` (Section 6); per-evidence `source_host` and `institutional`; and `verified` (Section 6). Raw `safeguards` values are preserved verbatim so the drawer can show documented, unclear, or undocumented honestly rather than as a bare checkmark.

`district` is an institution-level fact denormalized onto each finding, so a district with several findings repeats the same `district` block.

---

## 5. The context region (firewalled, never scored)

Unchanged from v1 and still pending its NCES pull. Structure retained: `firewalled: true`, a `note`, `naep` by year (grade 4 and 8, reading and math), `graduationRate` and `chronicAbsenteeism` series, and `confounders` (`perPupilSpending`, `economicallyDisadvantagedShare`, `englishLearnerShare`). See Section 7 for enforcement.

---

## 6. The four computations

All computations run over the state's findings. G3O carries no discontinued marker, so every finding is treated as active in wave w001 (a documented limitation, not a modelling choice).

**Breadth** — enrollment-weighted reach. *Pending enrollment.*
```
breadth = (enrollment across districts with >= 1 finding) / (total state public enrollment)
```
A district counts as adopting on one finding of any stage, `unknown` included.

**Depth** — enrollment-weighted, stage-weighted intensity among adopting districts. *Stage part computable now; enrollment weighting pending.*
```
For each adopting district: stage_d = MAX stageLadder weight across the district's findings
                                       that have a known stage ('unknown' contributes no stage)
depth = sum over adopting districts of (enrollment_d * stage_d)
        / sum over adopting districts of (enrollment_d)
```
Districts whose findings are all `unknown`-stage are excluded from Depth (they still count for Breadth). The within-district rule is MAX (a district's depth reflects its most-advanced deployment); this remains a confirmable choice.

**Governance** — size-neutral, documented-only. *Computable now.*
```
For each finding: governanceShare = (count of the four safeguards equal to "yes") / 4
governance = mean of governanceShare across the state's findings
```
Only `"yes"` is credited; `"not_documented"` and `"unclear"` score zero. The Index scores the documented record, not presumed practice. Governance is a plain mean across findings, not enrollment-weighted.

**Verifiability** — corroboration with enforced independence. *Computable now.*
```
Reduce a finding's evidence to distinct source hosts (hostname, lowercased, leading "www." stripped).
A host is institutional if it equals, or is a sub/parent domain of, the district's own website host.
verified(finding) = (distinct hosts >= 2) AND (at least one distinct host is non-institutional)
verifiability = (verified findings) / (total findings)
```
This defeats two false positives seen in the real data: the same URL listed twice, and multiple pages of the institution's own site presented as corroboration. Verifiability also drives the rank-interval width in the display.

**Composite** — the runtime blend. *Pending Breadth and Depth.*
```
composite = 0.10*governance + 0.35*breadth + 0.35*depth + 0.20*verifiability   (weights w001-v2)
```
Recomputed live from the four stored components as the weighting lens moves.

**Headline governance-gap figures** — computed alongside Governance:
```
documentationRate = mean governanceShare across findings   (share of safeguard slots documented "yes")
zeroSafeguardShare = share of findings with no safeguard documented "yes" at all
```

**Category (Academic / Administrative)** — derived from `activity_type`. The full `activity_type` vocabulary must be confirmed from the live data before the mapping is fixed; `internal_operational` maps to Administrative. Pending confirmation, unmapped values default to Administrative and are logged.

---

## 7. The firewall, enforced structurally

Unchanged. The composite function takes only adoption-region fields; it has no parameter through which evidence or context could enter. The context region is a distinct top-level region marked `firewalled: true`. No build-time component computation reads context. A reviewer confirms the firewall by reading one function signature.

---

## 8. The translators

**Translator 1 — G3O institutions and findings (buildable now).**
Fetch: `GET /institutions?country_iso3=USA&institution_type=school_district&sort=findings`, paged by `offset`/`limit` (limit max 200), walking descending until `finding_count` reaches 0 — the adopting set (about 807 districts in w001). Then `GET /institutions/{institution_uid}` per adopting district for its `findings` array. Map institution and findings into the evidence region; compute Governance, Verifiability, and the governance-gap figures; produce `stageMix`. Attach LEAID via the crosswalk below.

**LEAID crosswalk (interim, retires when G3O exposes LEAID).**
Source: the NCES district directory (`Districtwebsites25.csv`). Rules: pad every NCES `Agency ID - NCES Assigned` to seven digits (about a fifth arrive six digits because the CSV dropped a leading zero, disproportionately the low-numbered states, California most of all; unpadded, they silently fail to join). Match each G3O district to the directory **by website host first**, then by normalized name within state, recording `matchMethod`. Website-first because names diverge even for obvious districts (G3O "Arlington Public Schools" versus NCES "Arlington County Public Schools"), while the website resolves them. Emit the unresolved remainder as a review list; it is a small tail.

**Translator 2 — NCES enrollment (next to build).**
Input: NCES Common Core of Data district membership, keyed by LEAID. Output: district enrollment and state totals. Unblocks Breadth and Depth. With the LEAID settled, this is a clean keyed join, not a match.

**Translator 3 — NCES performance (later).**
Input: NAEP, graduation, absenteeism, confounders. Output: the context region.

**Aggregate step** joins Translator 1 findings to Translator 2 enrollment on LEAID, rolls up to state, and computes all four components. This is where enrollment-weighting is implemented, once, for both real and sample data.

### The line to hold
Simone's data is now wired to a live API, which makes reading it directly the tempting shortcut. The dashboard still never calls G3O; Translator 1 reads the API and writes the static file. The translator is the boundary between two independent organizations. No credentials belong in the repo; the G3O API is open, so none are needed here.

---

## 9. The Phase 1 weighting decision (w001-v2)

**Decision.** Governance weight is reduced from 0.30 to **0.10**; the freed weight goes evenly to the two core adoption measures, giving Breadth 0.35, Depth 0.35, Verifiability 0.20 (unchanged).

**Rationale.** In the initial adoption and piloting phase, documented safeguards are systemically sparse, which makes Governance near-constant across states. A near-constant component cannot discriminate between states, so at the top weight it would depress every composite without separating anyone. Down-weighting it is a measurement decision, not a cosmetic one.

**The integrity conditions that make this defensible.** A down-weight of governance invites the criticism that scores were tuned to keep governance from dragging adoption down. Three commitments answer that:

1. **Report the gap loudly.** The governance-gap figures (`documentationRate`, `zeroSafeguardShare`) are surfaced as a headline finding, nationally and per state, precisely because the gap is near-universal. Low composite weight with prominent reporting is the principled position; a low weight with the gap buried would not be.
2. **The weighting lens is a live control.** Any user may drag Governance back to 0.30 and watch the ranking respond. The default de-emphasizes governance; nothing conceals it. This is stated in the methodology.
3. **The restoration trigger is data-driven, not temporal.** Revisit the Governance weight at the first wave in which documented safeguards reach a meaningful share of findings, or in which Governance shows real cross-state spread rather than a floor. The condition, not a calendar, prompts the change.

**Version boundary.** The weight set is stamped `w001-v2`. Because changing weights moves every state's composite for reasons unrelated to anything on the ground, a future weight change must either restate the back-series under the new weights or mark the discontinuity openly. Weights are versioned exactly as the data is pinned to a wave.

---

## 10. Open items

- **Enrollment.** The one gap before Breadth and Depth move from defined to computed. NCES CCD district membership, keyed by the settled LEAID.
- **Depth within-district rule.** MAX is the working default; confirmable.
- **`activity_type` vocabulary.** Confirm the full set from live data before fixing the Academic / Administrative mapping.
- **Coverage caveat.** The `coverageNote` stays on the Index until G3O lifts its own "in progress, not systematic" caveat.
- **Crosswalk retirement.** When G3O exposes LEAID on the record, Translator 1 reads it directly and the crosswalk and its review tail retire.
