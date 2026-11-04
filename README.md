<h1 align="center">Drug Safety for Claude Code</h1>

<p align="center">
  <strong>The open-source drug safety case system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Oracle Argus data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=oracle-argus">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/oracle-argus?utm_source=github&utm_medium=readme&utm_campaign=oracle-argus">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-oracle-argus">Instead of Oracle Argus</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Drug Safety for Claude Code does the job you pay Oracle Argus for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Oracle Argus dashboard cannot.

Oracle does not publish a price for Argus. It licenses Argus by the number of cases you book in, not by user, on premise or as a cloud subscription in Basic and Advanced tiers ([oracle.com](https://www.oracle.com/pl/corporate/accessibility/templates/t2-3551.html), checked 2026-11-04). A sponsor with a few dozen Australian and New Zealand cases a year either rents a slice of someone else's Argus through a service provider or keeps the safety database in spreadsheets.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=oracle-argus).

It is the safety database for medicine and medical device sponsors in Australia and New Zealand: prescription and over-the-counter medicines, listed complementary medicines, medicinal cannabis sponsors and device distributors. It books in every adverse event report the day it arrives, starts the reporting clock the day the four minimum elements are known, and holds each case to the TGA or Medsafe deadline that applies (15 calendar days for a serious medicine case, 2, 10 or 30 days for a device, 72 hours for a significant safety issue). Follow-ups, regulator submissions, literature searches, signals, periodic reports and partner reconciliations sit alongside, with an append-only record of every step for an inspector.

### Ten questions Oracle Argus will not answer for you

These run against the demo data today. Ask them in plain words.

1. Which serious cases are due to the TGA or Medsafe this week, and which are already late?
2. Which reactions keep turning up that our product information does not list?
3. How many days, on average, do we take from Day 0 to lodging a report, by market?
4. Which follow-up answers changed a case and have not gone back to the regulator?
5. Which cases are still not valid, and what is each one missing?
6. Which serious cases has nobody assessed for causality?
7. When did we last run the literature search for each market, and did it find anything?
8. Which partners have not reconciled their safety cases with us on schedule?
9. Which cases came from overseas, and how many involve a reaction our label does not list?
10. What goes into the next periodic report for Corvexa, and when is it due?

### Your first hour: ten things to ask for

1. "What needs attention this week?" (`/attention`)
2. "Set up our products: Corvexa 40 mg in Australia, ARTG 900101, and the reactions its product information lists." (`/customise`)
3. "Bring our case listing across from Argus." (`/import`, test run first)
4. "A pharmacist in Hobart just called about raised liver enzymes on Corvexa." (`/log-case`)
5. "Serious, medically important, possibly related." (`/assess` shows the deadline)
6. "What is on the clock?" (`/clock`)
7. "Draft the report for the TGA for C-0002." (`/draft-report`)
8. "Are we seeing more liver reactions than before?" (`/signals`, then `/raise-issue`)
9. "Put our logo and colours on the case reports." (edit `brand.json`, then `npm run docs`)
10. "Write the Monday safety review." (`/weekly-review`)

### Documents and views

- `npm run docs` renders a case report for every case (reporter, patient, reactions against the label, narrative, follow-up, reports lodged and every step) and a safety summary for every product, in your brand (`brand.json`), into `docs-out/`.
- `npm run view` renders the week, the reporting clock and the signals as read-only HTML pages into `views/`.
- `/compliance` checks the records against the rules in [docs/compliance.md](docs/compliance.md), each with its source.
- `/draft-report`, `/draft-followup`, `/draft-issue` and `/line-listing` write drafts to `drafts/`. Nothing is ever sent or lodged from here.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/drug-safety-for-claude-code.git
cd drug-safety-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`. On the demo data it finds a New Zealand liver case three days past its 15-day deadline, a device death-or-serious-injury report past its 10 days, a significant safety issue nobody has lodged, and a follow-up answer that changed a case and never went back to the TGA.

Or from the terminal: `npm run safety -- attention`.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/attention` | What needs a person this week: deadlines missed or close, unassessed serious cases, unanswered follow-ups, overdue searches and reconciliations. |
| `/clock` | Every reportable case not yet lodged, soonest deadline first. |
| `/cases`, `/case` | Every open case, or one case in full. |
| `/log-case` | Book in a new report the day it arrives. The clock starts when the case is valid. |
| `/update-case`, `/add-reaction` | Add the details and reaction terms that come in later. |
| `/assess` | Seriousness, device category and causality; shows the deadline that follows. |
| `/submit` | Record a report lodged with the TGA or Medsafe, initial or follow-up. |
| `/request-followup`, `/followup-received`, `/followups` | Questions to reporters and the answers, with the 15-day clock on relevant ones. |
| `/close-case`, `/nullify` | Close a case once everything is lodged; mark a duplicate. Nothing is deleted. |
| `/submissions`, `/stats` | Reports lodged and on time; cases, late reports and days to lodge by market. |
| `/products`, `/product` | Products by market, or one product with its cases, reaction terms and issues. |
| `/signals` | Reaction terms by ingredient, recent against prior, and whether the label lists them. |
| `/raise-issue`, `/classify-issue`, `/report-issue`, `/close-issue`, `/issues` | Signals through to significant or other safety issues and the regulator notification. |
| `/log-search`, `/literature` | Literature searches by market and what they found. |
| `/reconcile`, `/partners` | Reconciliations with licensors, distributors and vendors. |
| `/periodic`, `/submit-periodic`, `/line-listing` | Periodic safety reports, their dates, and the case listing for each. |
| `/set-contact`, `/rules` | The pharmacovigilance contact per market; the deadlines in force and their sources. |
| `/compliance` | The records checked against the rules in docs/compliance.md. |
| `/draft-report`, `/draft-followup`, `/draft-issue` | The report for the regulator, the letter to the reporter, the safety issue notification. |
| `/weekly-review` | The Monday review, written from attention, the clock and follow-ups. |
| `/import`, `/export` | Bring cases across from an Argus line listing; snapshot every table. |
| `/activity`, `/help` | The append-only log, and every command. |
| `/customise`, `/new-view` | Make it yours: a field, a rule, a product, a new printable page. |

## Instead of Oracle Argus

Export a case line listing from Argus to CSV and run `/import`: a test run first shows every row it cannot read, then one command brings the cases, reactions, seriousness, causality and any report already lodged. Cases already lodged stay lodged; reportable cases that were not land on the clock. MedDRA coding, E2B messages and the Argus audit trail stay in your Argus archive. The full mapping: [docs/replace-oracle-argus.md](docs/replace-oracle-argus.md).

## Architecture

```
drug-safety-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Drug Safety for Claude Code for your business, migrates your Oracle Argus data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=oracle-argus)
- Read more: [enterprisedna.co/omni/instead-of/oracle-argus](https://enterprisedna.co/omni/instead-of/oracle-argus?utm_source=github&utm_medium=readme&utm_campaign=oracle-argus)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
