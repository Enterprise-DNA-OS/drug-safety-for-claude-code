# Compliance rules

`/compliance` (or `npm run safety -- compliance`) checks the records against the rules below. Each rule names its source, what a breach looks like in the data, and the check that finds it. The deadlines themselves live in the `reporting_rules` table (`/rules`), each row with its own source, so a change in guidance is a change to one row.

This is a record-keeping check, not regulatory advice. The sponsor stays responsible for its pharmacovigilance system, and seriousness, causality and signal decisions belong to the qualified person. When a rule changes, update this file, the check in `scripts/safety.mjs` and the `reporting_rules` rows together (`/customise`), and say where the new rule comes from.

Sources were read on 2026-11-04.

| Rule | Source | Breach in the data | Check |
|---|---|---|---|
| REPORT-ON-TIME | AU: TGA, *Pharmacovigilance responsibilities of medicine sponsors* (serious Australian adverse reactions within 15 calendar days of first receipt). NZ: Medsafe, *Guideline on the Regulation of Therapeutic Products in New Zealand*, Part 8 Pharmacovigilance (Edition 3, March 2024), and Medsafe's *Adverse reaction reporting for medicines* page (July 2025): serious adverse reactions within 15 calendar days of receipt. AU devices: Therapeutic Goods (Medical Devices) Regulations 2002, reg 5.7 (2 days for a serious threat to public health, 10 days for a death or serious injury, 30 days for an event that might have led to one). | A reportable case not lodged by Day 0 plus the rule's days, or lodged later than that. | `case_clock` against `reporting_rules` |
| FOLLOWUP-ON-TIME | TGA guidance (follow-up information within 15 calendar days of Australian sponsor awareness). Medsafe (initial and medically relevant follow-up reports both within 15 calendar days; quote the original report number). | A medically relevant follow-up answer not lodged within 15 days of receipt. | `followup_clock` |
| SAFETY-ISSUE-ON-TIME | TGA guidance: significant safety issues within 72 hours of Australian sponsor awareness; other safety issues within 30 calendar days. Day 0 is the day anyone in the Australian sponsor (including a vendor or partner doing its pharmacovigilance) establishes the issue. | An issue classified SSI or OSI and not reported by its due date, or reported late. | `issue_clock` |
| VALID-CASE | TGA guidance and ICH E2D: a valid report has an identifiable reporter, an identifiable patient, a suspect medicine and at least one suspect reaction. The clock starts when all four are known. | An open case missing any of the four, with or without a follow-up request on record. | `case_clock.valid` |
| ASSESSMENT | TGA guidance (what counts as serious: death, life-threatening, hospitalisation or prolonged hospitalisation, persistent or significant disability, congenital anomaly, medically important event). House rule: every serious case carries a recorded causality assessment. | A serious medicine case or a device case with no causality recorded. | `cases.causality` |
| DEVICE-CATEGORY | Therapeutic Goods (Medical Devices) Regulations 2002, reg 5.7: the deadline depends on the category of event. | An open device case with no reporting category, so no deadline can be set. | `cases.device_category` |
| LITERATURE | TGA guidance, section on reports from international and local literature (sponsors review global and local literature regularly; TGA inspections have cited undocumented or irreproducible searches). EU GVP Module VI (at least weekly) is the common benchmark. The interval is yours to set in `markets.literature_every_days` (default 7). | No search recorded for a market within its interval. | `literature_searches` by market |
| PV-CONTACT | AU: TGA guidance (details of the Australian pharmacovigilance contact person within 15 calendar days of the first medicine's entry on the ARTG, changes within 15 days; the contact must live in Australia). NZ: Medsafe Part 8, Edition 3 (contact details within 15 days of the first approval, changes within 15 days). | A market with no contact person, or no date the regulator was told. | `markets.pv_contact_notified_on` |
| PERIODIC | Conditions of registration (AU) and of consent (NZ) set periodic safety report periods and dates for the products they apply to. Enter each one in `periodic_reports` from the approval letter. | A periodic report past its due date and not lodged, or lodged late. | `periodic_reports` |
| PARTNER-RECONCILIATION | Your safety data exchange agreements with licensors, licensees and distributors. The TGA guidance holds the Australian sponsor responsible for reports its partners and vendors receive. | A partner not reconciled within the interval its agreement sets. | `partners.last_reconciled_on` |

## What each case is held to

`/rules` prints the `reporting_rules` table. As shipped:

| Market | Product | Trigger | Deadline |
|---|---|---|---|
| AU | medicine | serious adverse reaction in Australia | 15 calendar days |
| AU | medicine | medically relevant follow-up | 15 calendar days |
| AU | any | significant safety issue | 72 hours |
| AU | any | other safety issue | 30 calendar days |
| AU | device | serious threat to public health | 2 days |
| AU | device | death or serious injury | 10 days |
| AU | device | event that might have led to death or serious injury | 30 days |
| NZ | medicine | serious adverse reaction in New Zealand | 15 calendar days |
| NZ | medicine | medically relevant follow-up | 15 calendar days |

Cases from outside the product's market are recorded, counted in signals and periodic listings, and not put on the local clock: both regulators ask for local serious reactions one by one. Non-serious cases are recorded and listed in periodic reports; they are not lodged one by one.

New Zealand device reporting and clinical trial reporting are not in the table. Add rows for them with `/customise` if they apply to you, with their source.

## Where each was read

- TGA, Pharmacovigilance responsibilities of medicine sponsors: https://www.tga.gov.au/resources/resource/guidance/pharmacovigilance-responsibilities-medicine-sponsors
- TGA, Your regulatory reporting requirements: https://www.tga.gov.au/resources/resource/guidance/pharmacovigilance-responsibilities-medicine-sponsors/your-regulatory-reporting-requirements
- TGA, Reporting adverse events for medical devices: https://www.tga.gov.au/resources/guidance/reporting-adverse-events-medical-devices
- Medsafe, Guideline on the Regulation of Therapeutic Products in New Zealand, Part 8: https://www.medsafe.govt.nz/regulatory/guideline/grtpnz/part-8-pharmacovigilance.pdf
- Medsafe, Adverse reaction reporting for medicines: https://medsafe.govt.nz/regulatory/adverse-reaction-reporting-for-medicines.asp
