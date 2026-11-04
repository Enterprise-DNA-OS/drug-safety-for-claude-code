---
description: Add the reporter or patient details that came in later. The clock starts the day the case becomes valid.
---

Read CLAUDE.md. Add the reporter or patient details that came in later. The clock starts the day the case becomes valid.

Run `npm run safety -- update-case <case> [--reporter-type=] [--reporter=] [--contact=] [--initials=] [--age=] [--sex=F|M|X] [--narrative=] [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run safety -- case <code>` or `npm run safety -- product <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
