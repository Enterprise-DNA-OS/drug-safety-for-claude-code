---
description: Record a question sent back to the reporter, with the date an answer is due.
---

Read CLAUDE.md. Record a question sent back to the reporter, with the date an answer is due.

Run `npm run safety -- request-followup <case> --question= [--due=YYYY-MM-DD] [--on=YYYY-MM-DD] [--code=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run safety -- case <code>` or `npm run safety -- product <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Then offer /draft-followup for the letter.
