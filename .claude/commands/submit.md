---
description: Record a report lodged with the TGA or Medsafe, initial or follow-up, with its reference.
---

Read CLAUDE.md. Record a report lodged with the TGA or Medsafe, initial or follow-up, with its reference.

Run `npm run safety -- submit <case> --reference= [--followup=<FU code>] [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run safety -- case <code>` or `npm run safety -- product <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

This records a report someone lodged. It never contacts the regulator. If the output says late, say so plainly.
