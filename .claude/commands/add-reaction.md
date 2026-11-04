---
description: Add a reaction term to a case. Says whether the label lists it.
---

Read CLAUDE.md. Add a reaction term to a case. Says whether the label lists it.

Run `npm run safety -- add-reaction <case> --term= [--onset=YYYY-MM-DD] [--outcome=recovered|recovering|not_recovered|recovered_with_sequelae|fatal|unknown] [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run safety -- case <code>` or `npm run safety -- product <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Use one plain term per reaction, the way it will be counted (for example "hepatic enzyme increased", not a sentence).
