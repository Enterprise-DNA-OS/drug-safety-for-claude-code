---
description: Open a signal for evaluation on a product: what was seen and where it came from.
---

Read CLAUDE.md. Open a signal for evaluation on a product: what was seen and where it came from.

Run `npm run safety -- raise-issue --product= --title= --source= [--on=YYYY-MM-DD] [--code=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run safety -- case <code>` or `npm run safety -- product <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
