---
description: Record the reporter's answer and whether it changes the case. A medically relevant answer goes back to the regulator within 15 days.
---

Read CLAUDE.md. Record the reporter's answer and whether it changes the case. A medically relevant answer goes back to the regulator within 15 days.

Run `npm run safety -- followup-received <FU code> --answer= --relevant=yes|no [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run safety -- case <code>` or `npm run safety -- product <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Whether the answer is medically relevant is the qualified person's call. Ask if it is not clear.
