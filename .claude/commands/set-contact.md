---
description: Record the pharmacovigilance contact person for a market and the day the regulator was told.
---

Read CLAUDE.md. Record the pharmacovigilance contact person for a market and the day the regulator was told.

Run `npm run safety -- set-contact <AU|NZ> --name= [--notified=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run safety -- case <code>` or `npm run safety -- product <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
