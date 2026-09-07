# Civic AI Index — Data Schema Specification

**Education Pilot, Version 3.0**
**Status: partly real. Adoption, governance, verifiability, the guidance layer, and the full evidence roster are computed from live G3O data (wave w001). Enrollment-weighted Breadth and Depth are pending the NCES enrollment pull. The performance context layer is pending.**

Version 3.0 supersedes v2.0 after the first live runs against real G3O data. It records four substantive changes: guidance is separated from adoption and no longer scored; the component weights are restruck to 40/40/10/10 after the real data showed that both governance and verifiability are near-constant in this wave; the fabricated Academic/Administrative label is removed in favour of G3O's real activity type; and the crosswalk gains an evidence-domain fallback.

---

## 1. Purpose and architecture

The Index owns this schema. The dashboard reads a pre-built static file conforming to it and never calls any external source directly. Each source is converted into the schema by a dedicated translator.

Three sources:

- **G3O read API** (`https://api.g3observatory.org`, open, no key) — institutions and findings. An institution is a district; a finding is a documented activity. Wave `w001` is the current fixed, published version.
- **NCES enrollment** — public-school enrollment by district (LEAID), from the Common Core of Data. The join partner for enrollment-weighting. Not yet pulled.
- **NCES performance** — NAEP (2019, 2022, 2024), graduation, absenteeism, confounders. The firewalled context layer. Not yet pulled.

Each state record carries three regions plus one summary block: **adoption** (scored), **guidance** (a non-scored summary of policy activity), **evidence** (the audit roster of every finding), and **context** (firewalled, never scored).

### Adoption is deployment, not talk

A finding is only adoption if it documents a deployment: a tool in use, a pilot, a program, or a public-facing service. A policy or guidance document is not adoption. It is retained in the roster and summarised in the guidance layer, but it does not count toward any score. This is the editorial line the Index measures against: who is deploying AI, not who has written about it.

### The central principle, unchanged

One compute step produces the adoption region. Today it runs on live G3O findings plus a synthetic stand-in for enrollment; when the NCES enrollment pull lands, only the enrollment inputs change and the logic is identical.

### Build-time versus runtime, unchanged

Build-time computes the four components and stores them. Runtime recomputes only the composite, live in the browser, from the four stored components and the current weights as the weighting lens moves. The browser never touches raw findings, enrollment, or the context region.

---

## 2. Top-level structure

```json
{ "meta": { ... }, "states": [ { "state": "...", "abbr": "..", "adoption": {...}, "guidance": {...}, "evidence": {...}, "context": {...} } ] }
```

### meta

```json
{
  "schemaVersion": "3.0",
  "generated": "2026-09-04",
  "wave": "w001",
  "dataStatus": "PARTIAL_REAL",
  "dataStatusNote": "Adoption, governance, verifiability, and guidance are computed from live G3O wave w001. Breadth and Depth are pending NCES enrollment. Context is pending.",
  "coverageNote": "G3O coverage is in progress and is not yet systematic or fully validated. Every figure describes the documented record, not a census, and this notice stays on the Index until G3O lifts its own caveat.",
  "provenance": {
    "adoption": "G3O read API wave w001 (institutions + findings); LEAID via NCES district-directory crosswalk (interim, until G3O exposes LEAID)",
    "guidance": "G3O read API wave w001 (findings with activity_type = policy_guidance)",
    "evidence": "G3O read API wave w001 (findings + evidence)",
    "context": "pending (NCES / NAEP)"
  },
  "attribution": "Global Government GenAI Observatory (G3O), 2026. g3observatory.org, CC BY 4.0. Accessed 2026-09-04. The Civic AI Index transforms the source: it crosswalks G3O districts to NCES identifiers, weights by enrollment, and scores. Data CC BY 4.0; Index code MIT.",
  "weights": { "governance": 0.10, "breadth": 0.40, "depth": 0.40, "verifiability": 0.10 },
  "weightingVersion": "w001-v3",
  "weightingNote": "See Section 10. Governance and Verifiability are both down-weighted for Phase 1 because the real w001 data shows each is a near-constant floor. Weights are stamped to the wave.",
  "stageLadder": { "proposed": 0.25, "announced": 0.50, "pilot": 0.75, "production": 1.00 },
  "stageNote": "G3O adoption_stage values. 'unknown' counts toward adoption (Breadth) but is excluded from stage-weighting (Depth). G3O carries no 'discontinued' value and no active flag, so abandoned deployments cannot be detected in wave w001.",
  "activityTypes": ["policy_guidance", "program_initiative", "internal_operational", "pilot_experiment", "public_facing_service", "unknown"],
  "adoptionRule": "A finding counts toward adoption when its activity_type is anything other than 'policy_guidance'. policy_guidance is summarised in the guidance layer and excluded from every score.",
  "safeguardFlags": ["human_oversight", "transparency_notice", "data_classification", "risk_assessment"],
  "safeguardNote": "Each safeguard is a three-state value in G3O: 'yes', 'not_documented', 'unclear'. Only 'yes' is credited.",
  "naepYears": [2019, 2022, 2024]
}
```

---

## 3. The adoption region (scored)

Computed over deployment findings only. Guidance findings are excluded from every field here.

```json
{
  "breadth": null,
  "depth": null,
  "breadthPercentile": null,
  "depthPercentile": null,
  "governance": 0.035,
  "verifiability": 0.0,
  "documentationRate": 0.035,
  "zeroSafeguardShare": 0.875,
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

`null` marks a figure pending the enrollment pull. `governance`, `verifiability`, `documentationRate`, `zeroSafeguardShare`, `adoptingDistrictCount`, `findingCount`, and `stageMix` are computed now from deployment findings. `breadth`, `depth`, and the enrollment fields wait on NCES enrollment.

`documentationRate` and `zeroSafeguardShare` are first-class headline figures. `zeroSafeguardShare` (the share of deployments with no safeguard documented at all) is the governance-gap statistic the Index reports prominently. An `adoptingDistrictCount` is a district with at least one deployment finding; a district whose only activity is guidance does not appear here (it appears in the guidance layer).

---

## 4. The guidance layer (summary, not scored)

Per state, a summary of policy and guidance activity. Retained so the Index can show the gap between districts that have written policies and districts that actually deploy, which is one of its most telling findings. Not part of any score.

```json
{
  "note": "Published AI policy or guidance. Not adoption; not part of any score.",
  "districtCount": 20,
  "guidanceOnlyDistrictCount": 9,
  "findingCount": 31
}
```

`districtCount` is districts with at least one guidance finding. `guidanceOnlyDistrictCount` is the subset whose only documented activity is guidance, that is, districts that have written about AI but have no documented deployment. `findingCount` is the guidance findings themselves. The guidance findings also appear in the evidence roster (Section 5), tagged `countsAsAdoption: false`.

---

## 5. The evidence region (audit roster)

Every finding, adoption and guidance alike, with derived fields added by the translator. Field names follow G3O's real payload.

```json
{
  "deployments": [
    {
      "finding_uid": "G3O-F-w001-00002881",
      "district": { "name": "Arlington County Public Schools", "leaid": "5100270", "website": "http://www.apsva.us", "institution_uid": "G3O-I-00651649", "matchMethod": "evidence-domain" },
      "activity_name": "Google Gemini and NotebookLM availability for APS staff",
      "activity_type": "internal_operational",
      "countsAsAdoption": true,
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

Derived fields the translator adds: `district.leaid`, `district.website`, `district.matchMethod` (`website`, `name`, or `evidence-domain`, see Section 9); `countsAsAdoption` (false for `policy_guidance`); `stageWeight` (from `adoption_stage`, `null` if `unknown`); `governanceShare`; per-evidence `source_host` and `institutional`; and `verified`. Raw `safeguards` values are preserved verbatim.

The fabricated Academic/Administrative `category` field from v2 is removed. G3O's `activity_type` is not organised on that axis, so any such label would have been invented rather than observed. The real `activity_type` is stored instead.

`district` is an institution-level fact denormalized onto each finding.

---

## 6. The context region (firewalled, never scored)

Unchanged from v2 and still pending its NCES pull. Structure retained: `firewalled: true`, a `note`, `naep` by year (grade 4 and 8, reading and math), `graduationRate` and `chronicAbsenteeism` series, and `confounders` (`perPupilSpending`, `economicallyDisadvantagedShare`, `englishLearnerShare`). See Section 8 for enforcement.

---

## 7. The four computations

All four run over **deployment findings only**. Guidance findings are excluded. G3O carries no discontinued marker, so every deployment finding is treated as active in wave w001.

**Breadth** — enrollment-weighted reach. *Pending enrollment.*
```
breadth = (enrollment across districts with >= 1 deployment finding) / (total state public enrollment)
```
A district counts as adopting on one deployment finding of any stage, `unknown` included.

**Depth** — enrollment-weighted, stage-weighted intensity among adopting districts. *Stage part computed now; enrollment weighting pending.*
```
For each adopting district: stage_d = MAX stageLadder weight across its deployment findings with a known stage
depth = sum over adopting districts of (enrollment_d * stage_d) / sum over adopting districts of (enrollment_d)
```
Districts whose deployment findings are all `unknown`-stage are excluded from Depth (they still count for Breadth). The within-district rule is MAX.

**Governance** — size-neutral, documented-only. *Computed now.*
```
For each deployment finding: governanceShare = (count of the four safeguards equal to "yes") / 4
governance = mean of governanceShare across the state's deployment findings
```
Only `"yes"` is credited. Governance is a plain mean across findings, not enrollment-weighted.

**Verifiability** — corroboration with enforced independence. *Computed now.*
```
Reduce a finding's evidence to distinct source hosts (hostname, lowercased, leading "www." stripped).
A host is institutional if it equals, or is a sub/parent domain of, the district's own website host.
verified(finding) = (distinct hosts >= 2) AND (at least one distinct host is non-institutional)
verifiability = (verified deployment findings) / (total deployment findings)
```
This defeats the same URL listed twice and multiple pages of the institution's own site presented as corroboration.

**Composite** — percentile-normalized blend. *Pending Breadth and Depth.*
```
breadthPercentile, depthPercentile = rank of each state's Breadth and Depth across
                                     the scored states (0 = lowest, 1 = highest)
composite = 0.40*breadthPercentile + 0.40*depthPercentile + 0.10*governance + 0.10*verifiability
```
Breadth and Depth are normalized to percentile ranks before blending, because they sit on
different natural scales (Breadth is typically small; Depth clusters high) and a raw blend
would let district structure dominate: a single-district state such as Hawaii reaches 100
percent of its students on any adoption and would top a raw ranking on geography rather than
adoption. Governance and Verifiability are left raw; they are near-constant floors this wave,
and normalizing them would amplify meaningless jitter, contrary to their low weights. The raw
Breadth and Depth values are retained on each state for the two-axis reach-versus-intensity
view. The runtime weighting lens recomputes the composite from the two stored percentiles and
the two raw floor components as the weights move.

**Headline governance-gap figures**, computed alongside Governance:
```
documentationRate = mean governanceShare across deployment findings
zeroSafeguardShare = share of deployment findings with no safeguard documented "yes" at all
```

---

## 8. The firewall, enforced structurally

Unchanged. The composite function takes only adoption-region fields; it has no parameter through which guidance, evidence, or context could enter. The context region is a distinct top-level region marked `firewalled: true`. No build-time component computation reads context. A reviewer confirms the firewall by reading one function signature.

---

## 9. The translators

**Translator 1 — G3O institutions and findings (built).**
Fetch `GET /institutions?country_iso3=USA&institution_type=school_district&sort=findings`, paged by `offset`/`limit` (limit max 200), walking descending until `finding_count` reaches 0, then `GET /institutions/{institution_uid}` per adopting district. The detail record is enveloped (`{meta, data:{...}}`), so findings are read from `data.findings`. Requests use retry with exponential backoff on 429 and 5xx, honouring any Retry-After header. Findings are split into adoption and guidance by `activity_type`; the four components are computed over adoption findings.

**LEAID crosswalk (interim, retires when G3O exposes LEAID).**
Source: the NCES district directory. Rules: pad every NCES `Agency ID - NCES Assigned` to seven digits (about a fifth arrive six digits because the CSV dropped a leading zero, disproportionately the low-numbered states, California most of all). Match each G3O district by three methods in order: **website host**, then unique national **name**, then **evidence-domain**, that is, a domain cited in the district's own findings that resolves in the directory (this recovers districts, such as Arlington, that G3O records with no website). Match method is recorded per district, and evidence-domain matches are listed for spot-checking. About 98 percent of adopting districts match; the small residue resolves permanently when G3O exposes LEAID.

**Translator 2 — NCES enrollment (next to build).**
Input: NCES Common Core of Data district membership, keyed by LEAID. Output: district enrollment and state totals. Unblocks Breadth and Depth. A clean keyed join.

**Translator 3 — NCES performance (later).**
Input: NAEP, graduation, absenteeism, confounders. Output: the context region.

**Aggregate step** joins Translator 1 deployment findings to Translator 2 enrollment on LEAID, rolls up to state, and computes all four components.

### The line to hold
The dashboard never calls G3O; Translator 1 reads the API and writes the static file. The translator is the boundary between two independent organizations. The G3O API is open, so no credentials are involved.

---

## 10. The Phase 1 weighting decision (w001-v3)

**Decision.** Breadth 0.40, Depth 0.40, Governance 0.10, Verifiability 0.10.

**Rationale, now evidenced rather than predicted.** The first live runs confirmed that two of the four components are near-constant floors in this wave and therefore cannot discriminate between states:

- Governance: safeguards are documented in about 3.5 percent of deployment findings, and about 87.5 percent document none at all. The scores sit near a floor with little spread.
- Verifiability: the documentation is overwhelmingly single-sourced. In wave w001, no deployment finding clears the independent-corroboration bar, so the measure is effectively zero everywhere.

A component that reads near-constant across states cannot rank them; at a high weight it would only depress every composite without separating anyone. So both are down-weighted to 0.10, and the freed weight goes to the two measures that do discriminate, reach and intensity of adoption.

**The integrity conditions that make this defensible.**

1. **Report the gaps loudly.** `zeroSafeguardShare` and the near-absence of independent corroboration are surfaced as headline findings, precisely because they are near-universal. Low composite weight with prominent reporting is the principled position.
2. **The weighting lens is a live control.** Any user may drag Governance or Verifiability back up and watch the ranking respond. The defaults de-emphasize them; nothing conceals them.
3. **The restoration trigger is data-driven, not temporal.** Revisit either weight at the first wave in which that component gains real cross-state spread, for Governance meaning safeguards are documented in a meaningful share of findings, for Verifiability meaning independent multi-source corroboration becomes common.

**Version boundary.** The weight set is stamped `w001-v3`. Because changing weights moves every state's composite for reasons unrelated to anything on the ground, a future weight change must either restate the back-series under the new weights or mark the discontinuity openly.

**Composite normalization.** Breadth and Depth are percentile-ranked across scored states before blending (Section 7). This was decided against the real w001 data, which showed the raw blend was dominated by district structure rather than adoption: single-district states topped it on geography, and Depth, clustered high, swamped the typically small Breadth. Normalizing the two puts them on comparable footing so the weights mean what they say; the raw values are retained for the two-axis view so nothing is hidden. Governance and Verifiability stay raw, consistent with their being low-weighted floors.

**Confidence-band signal.** The rank-interval bands remain in the design; they are domain-general infrastructure. Because Verifiability is flat in education this wave, driving band width from corroboration alone would make every band uniform. The band is therefore driven by a measurement-confidence blend, corroboration plus how much documentation backs each state, so it stays informative in education now and still reflects corroboration in domains where corroboration varies.

---

## 11. Open items

- **Enrollment.** The one gap before Breadth and Depth move from defined to computed. NCES CCD district membership, keyed by the settled LEAID.
- **`unknown` activity_type.** Currently counted as adoption (18 findings in w001). Whether an unclassifiable activity should count is a minor open question.
- **Program initiatives.** Counted as adoption; the maturity stage already discounts the ones still at the planning stage. Revisit only if the mix proves misleading.
- **Coverage caveat.** The `coverageNote` stays on the Index until G3O lifts its own caveat.
- **Crosswalk retirement.** When G3O exposes LEAID on the record, Translator 1 reads it directly and the crosswalk and its residue retire.
- **Within-district Depth rule.** MAX is the working default; confirmable.
