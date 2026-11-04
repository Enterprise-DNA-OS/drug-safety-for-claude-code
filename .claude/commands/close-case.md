---
description: Close a case once everything owed on it is lodged. Refuses while a report or follow-up is outstanding.
---

Read CLAUDE.md. Close a case once everything owed on it is lodged. Refuses while a report or follow-up is outstanding.

Run `npm run safety -- close-case <case> --note= [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run safety -- case <code>` or `npm run safety -- product <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
