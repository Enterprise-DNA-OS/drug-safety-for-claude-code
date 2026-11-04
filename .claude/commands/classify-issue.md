---
description: Classify a signal after evaluation as a significant safety issue, another safety issue or not a signal. Shows the regulator deadline.
---

Read CLAUDE.md. Classify a signal after evaluation as a significant safety issue, another safety issue or not a signal. Shows the regulator deadline.

Run `npm run safety -- classify-issue <issue> --kind=ssi|osi|not_a_signal --assessment= [--aware=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run safety -- case <code>` or `npm run safety -- product <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

The classification is the qualified person's call. A significant safety issue is due in 72 hours: say so loudly.
