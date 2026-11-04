---
description: Import cases from an Oracle Argus case line listing exported to CSV.
---

Read CLAUDE.md. Import cases from an Oracle Argus case line listing exported to CSV.

Run `npm run safety -- import argus --cases=<line listing.csv> [--market=AU|NZ] [--dry-run] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read docs/replace-oracle-argus.md first. Always run with --dry-run, show the counts and problems, then import within the operator's authorised migration. Never guess a column. List any imported case that lands on the clock.
