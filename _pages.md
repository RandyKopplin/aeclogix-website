# AECLogix Website — Pages Index

**Last updated:** 2026-04-25
**Maintained by:** Homer
**Purpose:** A single-pane list of every page in the website folder, with current status, what changed in the recent cascades, and what still needs Randy's eyeball before any deploy.

External-publication freeze remains in effect until Randy completes 3 discovery calls validating the new pricing.

---

## 🟢 Updated this session — paste-ready locally, awaiting Randy's review

| Page | Live URL | Local file | What changed |
|---|---|---|---|
| Homepage | `aeclogix.com/` | [index.html](index.html) | Hero H1, subhead, About paragraph all reframed to **automation agency**; price card swapped to *"Starting at $650/mo + setup"* with link to `/pricing`; nav got "Pricing" link; bonuses + guarantees blocks stripped. |
| Pricing | `aeclogix.com/pricing` | [pricing/index.html](pricing/index.html) | New page. 4-tier card grid (Tier 2 featured), red X icons on "What's not included," tier band lines aligned, value comparison block, dual CTAs. |
| COI Checklist (lead magnet) | `aeclogix.com/coi-checklist` | [coi-checklist/index.html](coi-checklist/index.html) | Soft-pitch card reworded to subscription / value-anchor frame; nav "Pricing" link added; autopilot CTA rerouted from `/schedule` to `/pricing`. |

---

## 🟡 Verified clean — light pass, no action expected

| Page | Live URL | Local file | Status |
|---|---|---|---|
| COI Autopilot Offer Page | (sales tool, possibly internal) | [../Tools/aeclogix_coi_offer_page.html](../Tools/aeclogix_coi_offer_page.html) | Priya verified: no agents framing, no stale `$2,500` copy, no zombie bonus/guarantee blocks. Tier 4 monthly subscription `$2,500` instance is correct. |

---

## ⚪ No action — redirect stub

| Page | Live URL | Local file | Status |
|---|---|---|---|
| Schedule | `aeclogix.com/schedule` | [schedule/index.html](schedule/index.html) | 209-line meta-refresh redirect to Google Calendar booking. No copy to update. |

---

## ⚫ Abandoned design variants — deleted 2026-04-25

`index-blueprint.html` and `index-cohere.html` were deleted by Randy's directive 2026-04-25. They carried stale "Automation Agents / $2,500 / fixed price" copy and weren't referenced from anywhere live, so deletion was the cleanest call (vs. moving to `_variants/`).

---

## 🟠 Other pages — not yet in any cascade

| Page | Live URL | Local file | Notes |
|---|---|---|---|
| Reporter | `aeclogix.com/reporter` | [reporter/index.html](reporter/index.html) | Likely a separate AECLogix product page. May carry agents framing or old pricing. |
| RFP Radar (landing) | `aeclogix.com/rfp-radar` | [rfp-radar/index.html](rfp-radar/index.html) | Got 1 hit in the "Over 50 years" sweep — partially touched but not fully reviewed. |
| RFP Radar (app) | `aeclogix.com/rfp-radar/app` | [rfp-radar/app/index.html](rfp-radar/app/index.html) | RFP Radar tool. Same status. |
| USB-C preview | (probably not deployed) | [usb-c-preview.html](usb-c-preview.html) | Filename suggests a design preview. Could be another abandoned variant. |

**Decision needed:** dispatch a tomorrow-pass for Reporter + RFP Radar + USB-C preview, or hold.

---

## Canonical sources for any copy in these pages

- **Pricing facts:** [`AECLogix/Pricing.md`](../Pricing.md)
- **Offer language:** [`AECLogix/coi-autopilot-offer.md`](../coi-autopilot-offer.md)
- **Positioning umbrella:** [`AECLogix/Positioning Statement.md`](../Positioning%20Statement.md)
- **Voice library:** [`Ghostwriting/voice-library.md`](../../Ghostwriting/voice-library.md)
- **AEC glossary:** [`Ghostwriting/aec-glossary.md`](../../Ghostwriting/aec-glossary.md)

## Voice/refusal rules apply to every page

- Authority-only — no outcome promises ("eliminate," "transform," "increase profits").
- No fabricated guarantees or bonuses (stripped permanently 2026-04-24).
- "Live in 30 days" still allowed (means time-to-go-live).
- Banned: "fixed price," "no retainer," "own forever," "no SaaS."
- AEC vocabulary verified against the glossary; new terms flagged for Randy sign-off.
