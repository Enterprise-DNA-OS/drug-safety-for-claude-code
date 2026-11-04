---
description: Record that a safety issue was lodged with the regulator, with its reference.
---

Read CLAUDE.md. Record that a safety issue was lodged with the regulator, with its reference.

Run `npm run safety -- report-issue <issue> --reference= [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run safety -- case <code>` or `npm run safety -- product <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

This records a notification someone made. It never contacts the regulator.
