---
description: Close a safety issue once it is reported and acted on.
---

Read CLAUDE.md. Close a safety issue once it is reported and acted on.

Run `npm run safety -- close-issue <issue> [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run safety -- case <code>` or `npm run safety -- product <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
