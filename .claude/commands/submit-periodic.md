---
description: Record a periodic safety report lodged with the regulator.
---

Read CLAUDE.md. Record a periodic safety report lodged with the regulator.

Run `npm run safety -- submit-periodic <periodic report code> --reference= [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run safety -- case <code>` or `npm run safety -- product <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
