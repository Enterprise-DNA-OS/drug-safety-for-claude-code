---
description: Record a literature search: market, databases, the search string, hits and cases found.
---

Read CLAUDE.md. Record a literature search: market, databases, the search string, hits and cases found.

Run `npm run safety -- log-search --country=AU|NZ --source= --search= --hits= --cases= [--on=YYYY-MM-DD] [--code=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run safety -- case <code>` or `npm run safety -- product <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Book in each case found with /log-case --source=literature.
