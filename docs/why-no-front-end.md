# Why there is no front end

Oracle Argus is a case database with a subscription priced by how many cases you book in. The tables underneath it are ordinary: a few entities, a few relationships, a handful of workflows you repeat every week. What you pay for is the layer on top that lets people who do not write SQL get at those tables. Screens, filters, dashboards, forms.

That layer used to be the whole product, because talking to a database was hard. It is not hard any more. Open this folder in Claude Code, describe what you want, and it writes the query, runs it, and explains the answer. Ask a question the dashboard never had a chart for and you still get an answer.

## What you gain

- **Better answers.** A dashboard shows what the vendor decided to chart. Here you ask your own question, in your own words, and get it answered against your own data.
- **No seats.** Everyone who needs to look can look. The bill does not grow with headcount.
- **Your data in your Postgres.** Plain tables. Back them up, query them from anything, leave any time. There is no export step because there is nothing to leave.
- **A process that matches you.** When your way of working changes, you add a command. You do not wait for a feature request to clear.

## What you give up

- **Case entry forms.** A case is booked in by describing it to Claude Code, or from a CSV. There is no screen with a field for every element.
- **A phone app.** It runs where Claude Code runs.
- **Electronic gateway submission.** Argus can send E2B messages straight to a regulator. Here a report is drafted and lodged through the regulator's online form, then the reference is recorded. A sponsor lodging thousands of cases a year wants the gateway; most Australian and New Zealand sponsors lodge a handful a month.
- **A vendor help desk.** This is open source. Enterprise DNA supports the installed version for businesses that want someone to call.

## Who this fits

Sponsors with a small safety team who already use Claude Code, or who would rather learn to ask than learn another interface. If your team needs a screen to look at all day, keep Oracle Argus. If you need the answers more than the screens, this is cheaper, faster and yours.

Installed and run for you: https://enterprisedna.co/omni/instead-of/oracle-argus
