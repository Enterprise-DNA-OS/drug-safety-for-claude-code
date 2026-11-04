---
description: Record seriousness, the device reporting category and the company causality for a case. Shows the deadline that follows.
---

Read CLAUDE.md. Record seriousness, the device reporting category and the company causality for a case. Shows the deadline that follows.

Run `npm run safety -- assess <case> --serious=none|death,life_threatening,hospitalisation,disability,congenital_anomaly,medically_important [--device-category=public_health_threat|death_serious_injury|near_event] --causality=certain|probable|possible|unlikely|unrelated|unassessable [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run safety -- case <code>` or `npm run safety -- product <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

The assessment is a medical judgement by the qualified person. Ask for it; never decide seriousness or causality yourself.
