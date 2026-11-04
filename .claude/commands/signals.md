---
description: Count reaction terms by ingredient over the last 90 days against the 270 days before, and show which ones the label does not list.
---

Read CLAUDE.md. Count reaction terms by ingredient over the last 90 days against the 270 days before, and show which ones the label does not list.

Run `npm run safety -- signals`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Lead with unlisted terms that are rising. Suggest /raise-issue for any cluster; never decide a signal on your own.
