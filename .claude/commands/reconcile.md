---
description: Record a reconciliation with a licensor, distributor or vendor: their case count, ours, and anything missing.
---

Read CLAUDE.md. Record a reconciliation with a licensor, distributor or vendor: their case count, ours, and anything missing.

Run `npm run safety -- reconcile <partner> --theirs= --ours= [--missing=] [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run safety -- case <code>` or `npm run safety -- product <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Book in every missing case with /log-case --source=partner.
