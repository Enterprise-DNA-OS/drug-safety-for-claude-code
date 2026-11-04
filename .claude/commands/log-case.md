---
description: Book in a new adverse event report the day it arrives: product, source, where it happened and whatever details came with it.
---

Read CLAUDE.md. Book in a new adverse event report the day it arrives: product, source, where it happened and whatever details came with it.

Run `npm run safety -- log-case --product= --source=spontaneous|literature|study|partner|regulator|social_media|other --country=<ISO> [--received=YYYY-MM-DD] [--reporter-type=] [--reporter=] [--contact=] [--initials=] [--age=] [--sex=F|M|X] [--reaction=] [--onset=YYYY-MM-DD] [--narrative=] [--partner=] [--ref=] [--code=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run safety -- case <code>` or `npm run safety -- product <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

The received date is the day anyone in the business, a vendor or a partner first heard of it. If the case is not valid yet, request follow-up straight away. If it is, assess it the same day.
