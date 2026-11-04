---
description: Mark a case as a duplicate or not a real case. Nothing is deleted.
---

Read CLAUDE.md. Mark a case as a duplicate or not a real case. Nothing is deleted.

Run `npm run safety -- nullify <case> --reason= --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run safety -- case <code>` or `npm run safety -- product <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

If it was already lodged, the output says to tell the regulator.
