# Drug Safety for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What needs attention this week | `/attention` |
| What is due to the regulator, soonest first | `/clock` |
| Everything about one case or one product | `/case`, `/product` |
| A new report came in (call, email, form, partner, article) | `/log-case` |
| More details or another reaction arrived | `/update-case`, `/add-reaction` |
| The qualified person has assessed a case | `/assess` |
| A report was lodged with the TGA or Medsafe | `/submit` |
| Ask the reporter for more | `/request-followup`, then `/draft-followup` |
| The reporter answered | `/followup-received` |
| Open questions and answers owed | `/followups` |
| Close a case, or mark a duplicate | `/close-case`, `/nullify` |
| Open cases | `/cases` |
| Reports lodged and on time | `/submissions`, `/stats` |
| Products and their labels | `/products` |
| Is anything new turning up | `/signals` |
| A possible signal | `/raise-issue`, `/classify-issue`, `/report-issue`, `/close-issue`, `/issues` |
| Draft the safety issue notification | `/draft-issue` |
| The literature search was run | `/log-search`, `/literature` |
| A partner reconciliation | `/reconcile`, `/partners` |
| Periodic safety reports | `/periodic`, `/line-listing`, `/submit-periodic` |
| Our contact person with the regulator | `/set-contact` |
| What deadlines apply | `/rules` |
| Are we compliant | `/compliance` |
| Draft the report for the regulator | `/draft-report` |
| The Monday review | `/weekly-review` |
| Bring data across from Argus | `/import` (test run first) |
| A full copy of the data | `/export` |
| Who recorded what | `/activity` |
| Change a field, rule or product | `/customise` |
| A new printable page | `/new-view` |

If an ask fits nothing here, run the CLI directly (`npm run safety -- help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.
- Seriousness, causality, medical relevance and whether a signal is real are the qualified person's decisions. Ask; never decide them.
- Nothing is lodged with a regulator from here. Draft the report, a person lodges it, then record the reference with `/submit`.
- Cases hold health information. Never paste a case into another tool, email or chat outside this folder.
- Never change a rule in `reporting_rules` without its source, and update docs/compliance.md in the same change.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off Oracle Argus.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/oracle-argus
