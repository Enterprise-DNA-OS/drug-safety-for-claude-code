---
description: Draft the case line listing and reaction summary for a periodic safety report.
---

Read CLAUDE.md. Draft the case line listing and reaction summary for a periodic safety report.

Run `npm run safety -- line-listing <product> [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Writes a draft to drafts/. The benefit and risk discussion is for the qualified person; never write conclusions about the product's safety.
