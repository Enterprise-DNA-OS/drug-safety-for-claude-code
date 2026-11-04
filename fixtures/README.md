# Fixtures

Test files for `npm test`. Every name, product and case number is invented.

- `argus-line-listing.csv`: the shape of an Oracle Argus case line listing exported to CSV, one row per case and reaction term. Two dates styles, a case with two reactions, a case already lodged with the regulator, and a literature case.
- `bad-line-listing.csv`: rows the importer must refuse (a bad date, a product that is not set up, an overseas case with no market given).
