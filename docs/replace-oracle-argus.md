# Moving off Oracle Argus

Most of what Argus holds for a small or mid-sized sponsor is the case list: who reported what, about which product, how serious, and when it went to the regulator. That moves in one command from a case line listing.

## 1. Export from Argus

Run a case line listing for your Australian and New Zealand products (Argus Safety: Reports, then Aggregate Reports or the case line listing your team already uses) with one row per case and event, and save it as CSV. The importer looks for these columns by name and accepts the usual variations:

| What | Column names it recognises |
|---|---|
| Case number | Case Number, Case ID, Manufacturer Control Number |
| Date received | Initial Receipt Date, Receipt Date, Aware Date |
| Product | Suspect Product, Product Name, Primary Suspect Product |
| Country of the reaction | Country of Incidence, Country, Occurrence Country |
| Report type | Report Type, Case Source (spontaneous, literature, study, licensee) |
| Reporter | Reporter Type, Reporter Occupation, Reporter Name |
| Patient | Patient Initials, Patient Age, Patient Sex |
| Reaction | Event PT, Preferred Term, Event Verbatim |
| Onset and outcome | Onset Date, Event Outcome |
| Seriousness | Serious, Seriousness Criteria |
| Causality | Company Causality, Causality, Relatedness |
| Narrative | Narrative, Case Narrative |
| Already lodged | Submission Date and Submission Reference (optional) |

Dates can be `2026-03-04`, `04-MAR-2026` or `04/03/2026` (day first).

## 2. Set up your products first

Each product the listing names must exist here for its market (`/customise` or a short migration): name as Argus spells it, market, approval number, and the reactions the product information lists. Overseas cases need `--market=AU` or `--market=NZ` to say which product they belong to.

## 3. Import

```bash
npm run safety -- import argus --cases=argus-listing.csv --dry-run --actor="Your Name"
npm run safety -- import argus --cases=argus-listing.csv --actor="Your Name"
```

The dry run shows the counts and every row it cannot read. Nothing is imported while any row has a problem. Run it again with the same file and nothing doubles: cases are matched on the Argus case number.

## What maps

- One case per Argus case number, every event row becomes a reaction on it.
- Seriousness criteria map to death, life-threatening, hospitalisation, disability, congenital anomaly or medically important. A case marked serious with no criteria comes in as medically important; check those.
- Causality maps to certain, probable, possible, unlikely, unrelated or unassessable.
- A case with a submission date and reference arrives as lodged. A reportable case without them lands on the reporting clock.
- Day 0 is set to the receipt date for every valid imported case.

## What does not carry over

- MedDRA coding. Reaction terms come across as the text in the listing. If you hold a MedDRA licence, keep the preferred term column and the terms stay consistent.
- The E2B messages, acknowledgements and audit trail inside Argus. Keep the Argus archive (or its export) for inspection; this system's activity log starts on import day.
- Device cases need their reporting category set after import (`/assess`); Argus listings rarely carry it.
- Follow-up history, literature searches, safety issues and partner reconciliations are not in a case line listing. Enter open ones by hand; history stays in the archive.

Enterprise DNA does the mapping for a different export (another safety system, a vendor's spreadsheet) as part of setting it up for you.
