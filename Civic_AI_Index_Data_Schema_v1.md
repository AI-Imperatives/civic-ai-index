# Civic AI Index — Data Schema Specification

**Education Pilot, Version 1.0**
**Status: SAMPLE data contract. No figure in a conforming file represents a real deployment, district, or state outcome until the real translators replace the sample generator.**

---

## 1. Purpose and architecture

This document defines the Index-owned data schema that the dashboard reads. The dashboard never reads any external source directly. Each external source is converted into this schema by a dedicated translator. The shape below is the contract; the translators are responsible for meeting it.

Three sources feed the schema:

- **G3O** — adoption, deployments, guardrail flags, and sources, keyed by school district (LEAID). Arrives on Simone's cadence.
- **NCES enrollment** — public-school enrollment by district (LEAID), annual. The join partner that makes enrollment-weighting possible.
- **NCES performance** — NAEP (biennial: 2019, 2022, 2024), graduation rate, chronic absenteeism, and confounders. State-level.

Each state record has exactly three regions:

- **adoption** — the scored region. The four components, the composite, and the inputs that produced them.
- **evidence** — the audit region. The deployment roster the drawer displays.
- **context** — the firewalled region. Educational performance, never part of any score.

The site is static. It reads a pre-built data file. There are no live API calls from the browser.

### The central principle

There is one compute step that produces the adoption region. The sample generator feeds it synthetic inputs. The real translators will feed it real inputs. **The compute logic never changes.** This is why the sample figures are honestly computed rather than faked: the sample generator runs the real formula on synthetic enrollment and synthetic stages. When real data lands, only the source of the inputs changes.

### Build-time versus runtime

- **Build-time** (sample generator today; real pipeline later): compute `breadth`, `depth`, `governance`, `verifiability` from raw inputs. Store them.
- **Runtime** (dashboard): recompute `composite` live from the four stored components and the current weights as the weighting lens moves. The browser reads only the four components. It never touches raw district data, and it never touches the context region.

---

## 2. Top-level structure

```json
{
  "meta": { ... },
  "states": [ { "state": "...", "abbr": "..", "adoption": {...}, "evidence": {...}, "context": {...} } ]
}
```

### meta

Carries the canonical constants so that nothing drifts between the data and the dashboard. The dashboard reads its defaults from here.

```json
{
  "schemaVersion": "1.0",
  "generated": "2026-08-16",
  "dataStatus": "SAMPLE",
  "dataStatusNote": "Synthetic sample data. No figure represents a real deployment, district, or state outcome.",
  "provenance": {
    "adoption": "SAMPLE generator (stands in for the G3O adoption export joined to NCES enrollment)",
    "evidence": "SAMPLE generator (stands in for the G3O deployment roster)",
    "context": "SAMPLE generator (stands in for the NCES and NAEP performance layer)"
  },
  "weights":      { "governance": 0.30, "breadth": 0.25, "depth": 0.25, "verifiability": 0.20 },
  "stageLadder":  { "Under evaluation": 0.25, "Piloting": 0.50, "Approved/procured": 0.75, "Scaled districtwide": 1.00 },
  "guardrailFlags": ["Human oversight", "Transparency notice", "Data classification", "Risk assessment"],
  "naepYears": [2019, 2022, 2024]
}
```

---

## 3. The adoption region (scored)

```json
{
  "breadth": 0.69,
  "depth": 0.58,
  "governance": 0.72,
  "verifiability": 0.64,
  "composite": 0.667,
  "inputs": {
    "totalPublicEnrollment": 1450000,
    "districtCount": 540,
    "adoptingDistrictCount": 190,
    "enrollmentInAdoptingDistricts": 1000500,
    "activeDeploymentCount": 312,
    "stageMix": {
      "Under evaluation": 60,
      "Piloting": 70,
      "Approved/procured": 40,
      "Scaled districtwide": 20
    }
  }
}
```

Every stored figure is a share on a zero-to-one scale. Display transforms (percentages, a Depth "intensity" multiplier) are a presentation concern and are applied by the dashboard, not stored here.

`composite` is stored for convenience and for sorting on first paint, but it is authoritative only under the default weights. The dashboard recomputes it live whenever the weighting lens moves.

The `inputs` object exists so that each figure can be reconstructed from the file alone. In the example above, `breadth = enrollmentInAdoptingDistricts / totalPublicEnrollment = 1,000,500 / 1,450,000 = 0.69`.

---

## 4. The evidence region (audit trail)

```json
{
  "deployments": [
    {
      "id": "MI-0007",
      "district": { "name": "Example Public Schools", "leaid": "2601234", "enrollment": 21000 },
      "activity": "Personalized learning platform",
      "category": "Academic",
      "vendor": "ExampleVendor",
      "accessType": "Districtwide license",
      "stage": "Scaled districtwide",
      "stageWeight": 1.00,
      "active": true,
      "firstObservedYear": 2024,
      "confidence": "A",
      "guardrails": {
        "humanOversight": true,
        "transparencyNotice": true,
        "dataClassification": false,
        "riskAssessment": true
      },
      "sources": [
        { "publisher": "Example Gazette", "url": "https://example.test/a", "date": "2024-09-12", "credibility": "A" },
        { "publisher": "District board minutes", "url": "https://example.test/b", "date": "2024-06-03", "credibility": "B" }
      ]
    }
  ]
}
```

Notes:

- `district.leaid` is the join key to NCES enrollment. `district.enrollment` is denormalized onto each deployment so that the evidence region is self-contained and the adoption figures can be re-derived from it. A district running three deployments will therefore show the same enrollment on all three.
- `category` is `Academic` or `Administrative`. In the sample it is a derived tag on activity type. In the real pipeline it becomes a first-class G3O field.
- `stage` is one of the four ladder labels. `stageWeight` mirrors `meta.stageLadder[stage]` and is stored for self-containment.
- `active: false` marks a discontinued deployment. Discontinued deployments are retained for the audit trail and **excluded from every computation**.

---

## 5. The context region (firewalled, never scored)

```json
{
  "firewalled": true,
  "note": "Descriptive context only. Structurally excluded from every Civic AI Index score.",
  "naep": [
    { "year": 2019, "grade4Reading": 219, "grade4Math": 239, "grade8Reading": 262, "grade8Math": 280 },
    { "year": 2022, "grade4Reading": 215, "grade4Math": 234, "grade8Reading": 258, "grade8Math": 274 },
    { "year": 2024, "grade4Reading": 216, "grade4Math": 235, "grade8Reading": 259, "grade8Math": 273 }
  ],
  "graduationRate":     [ { "year": 2019, "rate": 0.81 }, { "year": 2022, "rate": 0.83 }, { "year": 2024, "rate": 0.84 } ],
  "chronicAbsenteeism": [ { "year": 2019, "rate": 0.15 }, { "year": 2022, "rate": 0.28 }, { "year": 2024, "rate": 0.24 } ],
  "confounders": {
    "perPupilSpending": [ { "year": 2019, "usd": 12500 }, { "year": 2022, "usd": 13800 }, { "year": 2024, "usd": 14600 } ],
    "economicallyDisadvantagedShare": 0.48,
    "englishLearnerShare": 0.07
  }
}
```

The NAEP measure is grade 4 and grade 8, reading and math, at the three available points. The graduation and absenteeism series may carry more years, since those are annual. The confounders (per-pupil spending, economically-disadvantaged share, English-learner share) are captured now because a pre-period cannot be reconstructed later.

This region is a pre-AI record of what kinds of states adopt, not a record of what AI does. It is descriptive context only. See Section 7 for how the firewall is enforced.

---

## 6. The four computations

All computations run over **active** deployments only. Discontinued deployments are excluded.

**Breadth** — enrollment-weighted reach.
```
breadth = (sum of enrollment across districts with >= 1 active deployment)
          / (total state public enrollment)
```

**Depth** — enrollment-weighted, stage-weighted intensity among adopting districts only.
```
For each adopting district d:
    stage_d = the district's stage score       (see the flagged decision below)
depth = sum over adopting districts of (enrollment_d * stage_d)
        / sum over adopting districts of (enrollment_d)
```
Depth ranges from 0.25 to 1.00, because every adopter is at least under evaluation and the ceiling is districtwide scale.

**Governance** — size-neutral guardrail quality.
```
For each active deployment: share = (count of the four guardrail flags present) / 4
governance = mean of share across all active deployments in the state
```
Governance is a **plain mean across deployments, not enrollment-weighted**. This is deliberate: a small district that governs its deployment well should not be outweighed by a large one that governs poorly. Governance measures practice, not reach.

**Verifiability** — corroboration.
```
verifiability = (active deployments with >= 2 independent sources)
                / (total active deployments)
```
Verifiability also drives the rank-interval width in the display. That interval is a presentation property derived by the dashboard from `verifiability`; it is not a stored score field.

**Composite** — the runtime blend.
```
composite = 0.30 * governance + 0.25 * breadth + 0.25 * depth + 0.20 * verifiability
```
Recomputed live in the browser from the four stored components as the weighting lens moves.

### Flagged decision: the within-district stage rule for Depth

When a single district runs several active deployments at different stages, `stage_d` must resolve to one number. Two defensible rules:

- **(a) Maximum** — the highest stage weight among the district's active deployments. Reading: the district has demonstrated it can reach that depth, and Depth-among-adopters should reflect how far the frontier districts have pushed.
- **(b) Mean** — the average stage weight across the district's active deployments. Reading: a district with one scaled tool and five under evaluation is, on balance, less deep than one with five scaled tools.

**Recommendation: (a) maximum.** Depth is explicitly an intensity measure among adopters, and the peak is the more faithful reading of intensity; the mean dilutes a district's demonstrated reach with the early-stage pilots it happens to be running in parallel. This is a methodological choice worth confirming with Simone, and it should be recorded in the methodology text once settled.

---

## 7. The firewall, enforced structurally

The requirement is not that the scoring code politely avoids the context region. The requirement is that it **cannot reach it**.

- The composite function takes only adoption-region fields as parameters. It has no parameter through which evidence or context could enter.
- The context region is a distinct top-level region with an explicit `firewalled: true` marker and its own naming.
- No build-time computation of any component reads the context region. The context translator writes context; nothing reads it back into a score.

A reviewer should be able to confirm the firewall by reading one function signature.

---

## 8. The translators

Three translators plus one aggregate step. The aggregate step is where enrollment-weighting and stage-weighting are implemented, once, for both sample and real data.

**Translator 1 — G3O adoption and evidence.**
Input: the G3O export (deployments, districts, guardrail flags, sources, keyed by LEAID).
Output: normalized deployment records (district and LEAID, stage, guardrail flags, sources, active flag, category). Produces the evidence region and the raw material for the aggregate step.

**Translator 2 — NCES enrollment.**
Input: NCES Common Core of Data enrollment by district (LEAID).
Output: a map of LEAID to enrollment, plus each state's total public enrollment. This is the join partner.

**Translator 3 — NCES performance.**
Input: NAEP (2019, 2022, 2024), graduation, absenteeism, and confounders.
Output: the context region, year-indexed.

**Aggregate step — the adoption compute.**
Joins Translator 1 deployments to Translator 2 enrollment on LEAID, rolls up to state level, and computes `breadth`, `depth`, `governance`, `verifiability`, `composite`, and the `inputs` roll-up. Writes the adoption region.

For the sample data, one generator plays all three translators and the aggregate step: it fabricates synthetic enrollment, synthetic deployments with stages, guardrails and sources, and synthetic performance, then runs the same aggregate step to produce honestly computed adoption figures.

### The line to hold

When Simone's data is ready, the shortest path in the moment will be to have the dashboard read G3O's shape directly. That shortcut is exactly what this architecture forecloses. The instruction will always be to build a translator that converts G3O output into this schema, never to make the dashboard read G3O's fields. The insulation is the asset.

Connection credentials never enter the public repository. Environment variables and gitignored configuration only.

---

## 9. Open items recorded against this schema

- The within-district stage rule for Depth (Section 6): recommendation is maximum; awaiting confirmation.
- Category (`Academic` / `Administrative`) is a derived tag in the sample and becomes a first-class G3O field in the real pipeline.
- The graduation and absenteeism series may carry more years than NAEP once real data lands.
