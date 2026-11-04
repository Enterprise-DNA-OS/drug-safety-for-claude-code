#!/usr/bin/env node
// The one CLI for Drug Safety for Claude Code.
//
//   npm run safety -- help
//   npm run safety -- attention            # what needs a person this week
//   npm run safety -- case C-0003          # one case, everything about it
//   npm run safety -- clock --json         # machine output for any read
//
// Every write needs --actor=<who is doing it> and lands in the append-only activity log.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table as textTable, heading, truncate } from './lib/format.mjs';

// ------------------------------------------------------------------ reads

export const reads = {
  products: {
    about: 'Every product by market: approval, kind, and the reactions its label already lists.',
    sql: `select p.code, p.name, p.ingredient, p.kind, p.country as market, p.approval_ref, p.approved_on,
            array_to_string(p.listed_reactions, ', ') as listed_reactions,
            (select count(*) from cases c where c.product_id = p.id and c.status = 'open')::int as open_cases
          from products p where p.active order by p.country, p.code`,
  },
  rules: {
    about: 'The reporting clock each kind of case and issue is held to, and where each rule comes from.',
    sql: `select country, product_kind, replace(trigger, '_', ' ') as trigger, days, unit, source from reporting_rules order by country, product_kind, days`,
  },
  cases: {
    about: 'Every open case: product, seriousness, causality, and the reporting deadline if it has one.',
    sql: `select code, product, country, source, received_on, day_zero, case when valid then 'yes' else 'NO' end as valid,
            coalesce(nullif(seriousness, ''), case when device_category is not null then replace(device_category, '_', ' ') else 'non-serious' end) as seriousness,
            reactions, coalesce(causality, '-') as causality, due_on, submitted_on
          from case_clock where status = 'open' order by received_on, code`,
  },
  clock: {
    about: 'Reportable cases not yet lodged, soonest deadline first: the reporting clock.',
    sql: `select code, product, regulator, replace(trigger, '_', ' ') as rule, day_zero, rule_days, due_on, days_left, coalesce(causality, '-') as causality
          from case_clock where status = 'open' and reportable and submitted_on is null order by due_on nulls last, code`,
  },
  submissions: {
    about: 'Reports lodged in the last 90 days, initial and follow-up, and whether each was on time.',
    sql: `select c.code as case, s.kind, s.regulator, s.submitted_on, s.reference, s.submitted_by,
            case when s.kind = 'initial' then cc.days_to_submit else s.submitted_on - f.received_on end as days_taken,
            case when s.kind = 'initial' then (cc.days_to_submit <= cc.rule_days)::text else (s.submitted_on <= fc.report_due)::text end as on_time
          from submissions s join cases c on c.id = s.case_id join case_clock cc on cc.id = c.id
          left join followups f on f.id = s.followup_id left join followup_clock fc on fc.code = f.code
          where s.submitted_on >= current_date - 90 order by s.submitted_on desc`,
  },
  followups: {
    about: 'Questions out to reporters, and answers still to judge or report.',
    sql: `select code, case_code as case, requested_on, answer_due, received_on,
            case when medically_relevant is null then '-' when medically_relevant then 'yes' else 'no' end as relevant, report_due, reported_on
          from followup_clock where reported_on is null and (received_on is null or medically_relevant is null or report_due is not null)
          order by coalesce(report_due, answer_due), code`,
  },
  literature: {
    about: 'Literature searches by market: when, where, what was searched and what was found.',
    sql: `select code, country, run_on, source, search_string, hits, cases_found, run_by from literature_searches order by run_on desc, code`,
  },
  issues: {
    about: 'Signals and safety issues: kind, when you became aware, the regulator deadline, reported or not.',
    sql: `select code, product, title, kind, opened_on, aware_on, due_on, reported_on, status, days_open from issue_clock order by status desc, opened_on, code`,
  },
  periodic: {
    about: 'Periodic safety reports by product: period, due date, lodged or not.',
    sql: `select pr.code, p.code as product, pr.period_from, pr.period_to, pr.due_on, pr.submitted_on, pr.reference,
            case when pr.submitted_on is null then pr.due_on - current_date end as days_left
          from periodic_reports pr join products p on p.id = pr.product_id order by pr.due_on`,
  },
  partners: {
    about: 'Licensors, distributors and vendors you swap safety data with, and when each was last reconciled.',
    sql: `select p.code, p.name, p.role, array_to_string(p.products, ', ') as products, p.agreement_ref, p.reconcile_every_days as every_days, p.last_reconciled_on,
            (p.last_reconciled_on + p.reconcile_every_days) as next_due,
            (select missing from reconciliations r where r.partner_id = p.id order by reconciled_on desc limit 1) as last_gap
          from partners p where p.active order by next_due nulls first, p.code`,
  },
  signals: {
    about: 'Reaction terms by ingredient: the last 90 days against the 270 days before, and whether the label lists them.',
    sql: `select ingredient, term, case when bool_or(expected) then 'listed' else 'NOT LISTED' end as label,
            count(*) filter (where received_on >= current_date - 90)::int as last_90_days,
            count(*) filter (where received_on < current_date - 90 and received_on >= current_date - 360)::int as prior_270_days,
            string_agg(distinct case_code, ', ') as cases
          from reaction_check where received_on >= current_date - 360 group by ingredient, term
          order by (count(*) filter (where received_on >= current_date - 90)) desc, bool_or(expected), ingredient, term`,
  },
  attention: {
    about: 'What needs a person this week: deadlines missed or close, unassessed serious cases, unanswered follow-ups, overdue searches and reconciliations.',
    sql: `select item, rule, detail, days from safety_attention order by severity, days desc nulls last, item`,
  },
  stats: {
    about: 'By market over the last 365 days: cases, serious cases, reports lodged, on time, and average days to lodge.',
    sql: `select market, count(*)::int as cases, count(*) filter (where serious or device_category is not null)::int as serious,
            count(*) filter (where reportable)::int as reportable, count(*) filter (where submitted_on is not null)::int as lodged,
            count(*) filter (where days_to_submit <= rule_days)::int as on_time, count(*) filter (where days_to_submit > rule_days)::int as late,
            round(avg(days_to_submit), 1)::float as avg_days_to_lodge,
            count(*) filter (where country <> market)::int as from_overseas
          from case_clock where status <> 'nullified' and received_on >= current_date - 365 group by market order by market`,
  },
  compliance: {
    about: 'Check the records against the rules in docs/compliance.md.',
    sql: null,
  },
  activity: {
    about: 'The append-only log of who changed what.',
    sql: `select created_at, actor, command, record_id, detail from activity order by id`,
  },
};

// Each rule matches a row in docs/compliance.md.
export const complianceRules = [
  { rule: 'REPORT-ON-TIME', sql: `select code, product || ' to ' || regulator || ': ' || case when submitted_on is null then 'not lodged, due ' || due_on
        else 'lodged ' || days_to_submit || ' days after Day 0 (limit ' || rule_days || ')' end as finding
      from case_clock where status <> 'nullified' and reportable and ((submitted_on is null and due_on < current_date) or days_to_submit > rule_days)` },
  { rule: 'FOLLOWUP-ON-TIME', sql: `select code, case_code || ': answer received ' || received_on || ', ' || coalesce('reported ' || reported_on, 'not reported') || ', due ' || report_due as finding
      from followup_clock where report_due is not null and ((reported_on is null and report_due < current_date) or reported_on > report_due)` },
  { rule: 'SAFETY-ISSUE-ON-TIME', sql: `select code, upper(kind) || ' aware ' || aware_on || ', ' || coalesce('reported ' || reported_on, 'not reported') || ', due ' || due_on as finding
      from issue_clock where kind in ('ssi','osi') and ((reported_on is null and due_on < current_date) or reported_on > due_on)` },
  { rule: 'VALID-CASE', sql: `select code, 'missing ' || concat_ws(', ', case when not has_reporter then 'reporter' end, case when not has_patient then 'patient' end,
        case when not has_reaction then 'reaction' end) || '; follow-up ' || case when exists (select 1 from followups f join cases c on c.id = f.case_id where c.code = case_clock.code)
        then 'requested' else 'NOT requested' end as finding
      from case_clock where status = 'open' and not valid` },
  { rule: 'ASSESSMENT', sql: `select code, product || ': ' || coalesce(nullif(seriousness, ''), replace(device_category, '_', ' ')) || ', no causality recorded' as finding
      from case_clock where status <> 'nullified' and (serious or device_category is not null) and causality is null` },
  { rule: 'DEVICE-CATEGORY', sql: `select code, product || ': a device case with no reporting category' as finding
      from case_clock where status = 'open' and product_kind = 'device' and device_category is null` },
  { rule: 'LITERATURE', sql: `select code, finding from (
        select m.country as code, coalesce('last search ' || max(l.run_on), 'no search recorded') || ', every ' || m.literature_every_days || ' days' as finding,
          coalesce(max(l.run_on), date '1900-01-01') < current_date - m.literature_every_days as late
        from markets m join products p on p.country = m.country and p.active left join literature_searches l on l.country = m.country
        group by m.country, m.literature_every_days) x where late` },
  { rule: 'PV-CONTACT', sql: `select country as code, regulator || ' not told who the pharmacovigilance contact is' ||
        coalesce('; first approval ' || (select min(approved_on) from products p where p.country = m.country), '') as finding
      from markets m where pv_contact is null or pv_contact_notified_on is null` },
  { rule: 'PERIODIC', sql: `select pr.code, p.code || ' due ' || pr.due_on || coalesce(', lodged ' || pr.submitted_on, ', not lodged') as finding
      from periodic_reports pr join products p on p.id = pr.product_id where (pr.submitted_on is null and pr.due_on < current_date) or pr.submitted_on > pr.due_on` },
  { rule: 'PARTNER-RECONCILIATION', sql: `select code, name || coalesce(', last reconciled ' || last_reconciled_on, ', never reconciled') || ', agreement says every ' || reconcile_every_days || ' days' as finding
      from partners where active and coalesce(last_reconciled_on, date '1900-01-01') < current_date - reconcile_every_days` },
];

// ------------------------------------------------------------------ usage

export const usage = {
  ...Object.fromEntries(Object.keys(reads).map((k) => [k, ''])),
  product: '<product code or name words>',
  case: '<case code>',
  'log-case': '--product= --source=spontaneous|literature|study|partner|regulator|social_media|other --country=<ISO> [--received=YYYY-MM-DD] [--reporter-type=] [--reporter=] [--contact=] [--initials=] [--age=] [--sex=F|M|X] [--reaction=] [--onset=YYYY-MM-DD] [--narrative=] [--partner=] [--ref=] [--code=] --actor=',
  'update-case': '<case> [--reporter-type=] [--reporter=] [--contact=] [--initials=] [--age=] [--sex=F|M|X] [--narrative=] [--on=YYYY-MM-DD] --actor=',
  'add-reaction': '<case> --term= [--onset=YYYY-MM-DD] [--outcome=recovered|recovering|not_recovered|recovered_with_sequelae|fatal|unknown] [--on=YYYY-MM-DD] --actor=',
  assess: '<case> --serious=none|death,life_threatening,hospitalisation,disability,congenital_anomaly,medically_important [--device-category=public_health_threat|death_serious_injury|near_event] --causality=certain|probable|possible|unlikely|unrelated|unassessable [--on=YYYY-MM-DD] --actor=',
  submit: '<case> --reference= [--followup=<FU code>] [--on=YYYY-MM-DD] --actor=',
  'request-followup': '<case> --question= [--due=YYYY-MM-DD] [--on=YYYY-MM-DD] [--code=] --actor=',
  'followup-received': '<FU code> --answer= --relevant=yes|no [--on=YYYY-MM-DD] --actor=',
  'close-case': '<case> --note= [--on=YYYY-MM-DD] --actor=',
  nullify: '<case> --reason= --actor=',
  'log-search': '--country=AU|NZ --source= --search= --hits= --cases= [--on=YYYY-MM-DD] [--code=] --actor=',
  'raise-issue': '--product= --title= --source= [--on=YYYY-MM-DD] [--code=] --actor=',
  'classify-issue': '<issue> --kind=ssi|osi|not_a_signal --assessment= [--aware=YYYY-MM-DD] --actor=',
  'report-issue': '<issue> --reference= [--on=YYYY-MM-DD] --actor=',
  'close-issue': '<issue> [--on=YYYY-MM-DD] --actor=',
  reconcile: '<partner> --theirs= --ours= [--missing=] [--on=YYYY-MM-DD] --actor=',
  'submit-periodic': '<periodic report code> --reference= [--on=YYYY-MM-DD] --actor=',
  'set-contact': '<AU|NZ> --name= [--notified=YYYY-MM-DD] --actor=',
  import: 'argus --cases=<line listing.csv> [--market=AU|NZ] [--dry-run] --actor=',
  export: '--out=<new-file.json>',
  'draft-report': '<case>',
  'draft-followup': '<case>',
  'draft-issue': '<issue>',
  'line-listing': '<product> [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]',
  'weekly-review': '',
  help: '',
};

const mutating = new Set(['log-case', 'update-case', 'add-reaction', 'assess', 'submit', 'request-followup', 'followup-received', 'close-case', 'nullify',
  'log-search', 'raise-issue', 'classify-issue', 'report-issue', 'close-issue', 'reconcile', 'submit-periodic', 'set-contact', 'import']);
const SOURCES = ['spontaneous', 'literature', 'study', 'partner', 'regulator', 'social_media', 'other'];
const REPORTERS = ['doctor', 'pharmacist', 'nurse', 'other_health_professional', 'consumer', 'lawyer', 'other'];
const SERIOUS = ['death', 'life_threatening', 'hospitalisation', 'disability', 'congenital_anomaly', 'medically_important'];
const DEVICE_CATS = ['public_health_threat', 'death_serious_injury', 'near_event'];
const CAUSALITY = ['certain', 'probable', 'possible', 'unlikely', 'unrelated', 'unassessable'];
const OUTCOMES = ['recovered', 'recovering', 'not_recovered', 'recovered_with_sequelae', 'fatal', 'unknown'];
const TABLES = ['markets', 'products', 'reporting_rules', 'partners', 'cases', 'reactions', 'followups', 'submissions', 'literature_searches',
  'safety_issues', 'periodic_reports', 'reconciliations', 'imports', 'activity'];

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
function need(v, label) {
  if (typeof v !== 'string' || !v.trim()) throw Error(`--${label} is required`);
  return v.trim();
}
function date(v, label, { past = true } = {}) {
  v = need(v, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) throw Error(`--${label} needs a real YYYY-MM-DD date`);
  if (past && v > today()) throw Error(`--${label} cannot be in the future`);
  return v;
}
const dateOr = (v, label, dflt) => (v === undefined ? dflt : date(v, label));
function one(v, values, label) {
  if (!values.includes(v)) throw Error(`--${label} must be one of ${values.join(', ')}`);
  return v;
}
function count(v, label) {
  const n = Number(need(v, label));
  if (!Number.isInteger(n) || n < 0) throw Error(`--${label} must be a whole number, zero or more`);
  return n;
}
function yesNo(v, label) {
  const s = need(v, label).toLowerCase();
  if (!['yes', 'no'].includes(s)) throw Error(`--${label} must be yes or no`);
  return s === 'yes';
}

function parse(args) {
  const pos = [];
  const f = {};
  for (const arg of args) {
    if (!arg.startsWith('--')) { pos.push(arg); continue; }
    const [key, ...rest] = arg.slice(2).split('=');
    if (Object.hasOwn(f, key)) throw Error(`Duplicate flag --${key}`);
    f[key] = rest.length ? rest.join('=') : true;
  }
  const cmd = pos.shift() || 'help';
  if (!Object.hasOwn(usage, cmd)) throw Error(`Unknown command "${cmd}". Run: npm run safety -- help`);
  const allowed = new Set(['json', ...[...usage[cmd].matchAll(/--([a-z-]+)/g)].map((m) => m[1])]);
  for (const k of Object.keys(f)) if (!allowed.has(k)) throw Error(`Unknown flag --${k} for ${cmd}. Usage: ${cmd} ${usage[cmd]}`);
  if (f.json !== undefined && f.json !== true) throw Error('--json is a boolean flag');
  if (Object.hasOwn(reads, cmd) && pos.length) throw Error(`Usage: ${cmd} takes no arguments`);
  return { cmd, pos, f };
}

async function log(db, actor, command, recordId, detail) {
  await db.query('insert into activity (actor, command, record_id, detail) values ($1,$2,$3,$4)', [actor, command, recordId, detail]);
}

// Match by code (case-insensitive, prefix) or by words in the name. Ambiguous -> list and fail.
async function findOne(db, table, q, label, nameCol = 'name') {
  q = need(q, label);
  const exact = await db.query(`select * from ${table} where lower(code) = lower($1)`, [q]);
  if (exact.length) return exact[0];
  const rows = await db.query(
    `select * from ${table} where lower(code) like lower($1) || '%' or lower(${nameCol}) like '%' || lower($1) || '%' order by code`, [q]);
  if (!rows.length) throw Error(`No matching ${label} for "${q}"`);
  if (rows.length > 1) throw Error(`Ambiguous: "${q}" matches ${rows.map((r) => `${r.code} (${truncate(r[nameCol], 40)})`).join('; ')}`);
  return rows[0];
}
const findProduct = (db, q) => findOne(db, 'products', q, 'product');
const findCase = (db, q) => findOne(db, 'cases', q, 'case', 'narrative');
const findIssue = (db, q) => findOne(db, 'safety_issues', q, 'issue', 'title');
const findPartner = (db, q) => findOne(db, 'partners', q, 'partner');
const findFollowup = (db, q) => findOne(db, 'followups', q, 'follow-up', 'question');
async function nextCode(db, table, prefix, width) {
  const rows = await db.query(`select code from ${table} where code like $1`, [`${prefix}%`]);
  const n = rows.reduce((m, r) => Math.max(m, Number(r.code.slice(prefix.length)) || 0), 0) + 1;
  return prefix + String(n).padStart(width, '0');
}
async function openCase(db, q) {
  const c = await findCase(db, q);
  if (c.status !== 'open') throw Error(`${c.code} is ${c.status}`);
  return c;
}
const clockOf = async (db, code) => (await db.query('select * from case_clock where code = $1', [code]))[0];

// Day zero is the day the four minimum elements are all known. Set it once, the first time they are.
async function startClock(db, c, on, actor) {
  const k = await clockOf(db, c.code);
  if (!k.valid || k.day_zero) return null;
  const dz = on < c.received_on ? c.received_on : on;
  await db.query('update cases set day_zero = $2 where id = $1', [c.id, dz]);
  await log(db, actor, 'day-zero', c.code, `all four minimum elements known on ${dz}`);
  return dz;
}

// ------------------------------------------------------------------ commands

async function productDetail(db, q) {
  const p = await findProduct(db, q);
  return {
    product: (await db.query(reads.products.sql.replace('where p.active', 'where p.id = $1'), [p.id]))[0],
    open_cases: await db.query(`select code, received_on, seriousness, reactions, causality, due_on, submitted_on from case_clock where product = $1 and status = 'open' order by received_on`, [p.code]),
    reactions: await db.query(`select term, case when expected then 'listed' else 'NOT LISTED' end as label, count(*)::int as cases from reaction_check where product = $1 group by term, expected order by count(*) desc, term`, [p.code]),
    issues: await db.query('select code, title, kind, status, due_on, reported_on from issue_clock where product = $1 order by opened_on', [p.code]),
    periodic: await db.query('select code, period_from, period_to, due_on, submitted_on from periodic_reports where product_id = $1 order by due_on', [p.id]),
  };
}

async function caseDetail(db, q) {
  const c = await findCase(db, q);
  const k = await clockOf(db, c.code);
  return {
    case: { code: c.code, product: `${k.product} (${k.product_name})`, market: k.market, regulator: k.regulator, country: c.country, source: c.source,
      source_ref: c.source_ref, received_on: c.received_on, day_zero: c.day_zero, valid: k.valid,
      reporter: [c.reporter_type, c.reporter_name, c.reporter_contact].filter(Boolean).join(', ') || null,
      patient: [c.patient_initials, c.patient_age != null ? `${c.patient_age} years` : null, c.patient_sex].filter(Boolean).join(', ') || null,
      seriousness: k.seriousness || (c.device_category ? null : 'non-serious'), device_category: c.device_category, causality: c.causality,
      assessed: c.assessed_on ? `${c.assessed_on} by ${c.assessed_by}` : null, reportable: k.reportable ? `yes, ${k.rule_days} days (${k.trigger.replace(/_/g, ' ')})` : k.country !== k.market ? 'no, the reaction happened outside this market' : 'no',
      due_on: k.due_on, days_left: k.days_left, status: c.status, narrative: c.narrative, close_note: c.close_note },
    reactions: await db.query(`select rc.term, r.onset_on, rc.outcome, case when rc.expected then 'listed' else 'NOT LISTED' end as label from reaction_check rc join reactions r on r.id = rc.id where rc.case_code = $1 order by r.onset_on, rc.term`, [c.code]),
    followups: await db.query('select code, requested_on, answer_due, received_on, medically_relevant, report_due, reported_on from followup_clock where case_code = $1 order by requested_on', [c.code]),
    submissions: await db.query('select kind, regulator, submitted_on, reference, submitted_by from submissions where case_id = $1 order by submitted_on', [c.id]),
    activity: await db.query('select created_at, actor, command, detail from activity where record_id = $1 order by id', [c.code]),
  };
}

async function logCase(db, f, actor) {
  const p = await findProduct(db, f.product);
  const source = one(need(f.source, 'source'), SOURCES, 'source');
  const country = need(f.country, 'country').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw Error('--country is the two-letter country where the reaction happened (AU, NZ, GB...)');
  const received = dateOr(f.received, 'received', today());
  const partner = f.partner ? await findPartner(db, f.partner) : null;
  if (source === 'partner' && !partner) throw Error('--partner is required when --source=partner');
  if (f['reporter-type']) one(f['reporter-type'], REPORTERS, 'reporter-type');
  if (f.sex) one(f.sex, ['F', 'M', 'X'], 'sex');
  const age = f.age === undefined ? null : count(f.age, 'age');
  if (f.ref) {
    const dup = await db.query('select code from cases where source_ref = $1', [f.ref]);
    if (dup.length) throw Error(`${f.ref} is already booked in as ${dup[0].code}`);
  }
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'cases', 'C-', 4);
  await db.exec('BEGIN');
  try {
    const c = (await db.query(`insert into cases (code, product_id, received_on, source, partner_id, reporter_type, reporter_name, reporter_contact,
        patient_initials, patient_age, patient_sex, country, narrative, source_ref) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
      [code, p.id, received, source, partner?.id || null, f['reporter-type'] || null, f.reporter || null, f.contact || null, f.initials || null, age, f.sex || null,
        country, f.narrative || '', f.ref || null]))[0];
    if (f.reaction) await db.query('insert into reactions (case_id, term, onset_on) values ($1,$2,$3)', [c.id, need(f.reaction, 'reaction').toLowerCase(), f.onset ? date(f.onset, 'onset') : null]);
    await log(db, actor, 'log-case', code, `${p.code} ${source} from ${country}, received ${received}`);
    const dz = await startClock(db, c, received, actor);
    await db.exec('COMMIT');
    const k = await clockOf(db, code);
    return { case: code, product: p.code, received_on: received, valid: k.valid, day_zero: dz,
      next: k.valid ? `Assess it today: npm run safety -- assess ${code} --serious=... --causality=...`
        : `Not valid yet (needs ${[!k.has_reporter && 'reporter', !k.has_patient && 'patient', !k.has_reaction && 'reaction'].filter(Boolean).join(', ')}). Request follow-up: npm run safety -- request-followup ${code} --question=...` };
  } catch (e) { await db.exec('ROLLBACK'); throw e; }
}

async function updateCase(db, q, f, actor) {
  const c = await openCase(db, q);
  const on = dateOr(f.on, 'on', today());
  const sets = [];
  const vals = [c.id];
  const put = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (f['reporter-type'] !== undefined) put('reporter_type', one(f['reporter-type'], REPORTERS, 'reporter-type'));
  if (f.reporter !== undefined) put('reporter_name', need(f.reporter, 'reporter'));
  if (f.contact !== undefined) put('reporter_contact', need(f.contact, 'contact'));
  if (f.initials !== undefined) put('patient_initials', need(f.initials, 'initials'));
  if (f.age !== undefined) put('patient_age', count(f.age, 'age'));
  if (f.sex !== undefined) put('patient_sex', one(f.sex, ['F', 'M', 'X'], 'sex'));
  if (f.narrative !== undefined) put('narrative', need(f.narrative, 'narrative'));
  if (!sets.length) throw Error('Nothing to update: pass at least one of --reporter-type, --reporter, --contact, --initials, --age, --sex, --narrative');
  await db.exec('BEGIN');
  try {
    await db.query(`update cases set ${sets.join(', ')} where id = $1`, vals);
    await log(db, actor, 'update-case', c.code, sets.map((s) => s.split(' =')[0]).join(', '));
    const dz = await startClock(db, c, on, actor);
    await db.exec('COMMIT');
    const k = await clockOf(db, c.code);
    return { case: c.code, valid: k.valid, day_zero: k.day_zero, ...(dz ? { clock_started: dz, due_on: k.due_on } : {}) };
  } catch (e) { await db.exec('ROLLBACK'); throw e; }
}

async function addReaction(db, q, f, actor) {
  const c = await openCase(db, q);
  const term = need(f.term, 'term').toLowerCase();
  const outcome = one(f.outcome || 'unknown', OUTCOMES, 'outcome');
  const on = dateOr(f.on, 'on', today());
  const dup = await db.query('select 1 from reactions where case_id = $1 and term = $2', [c.id, term]);
  if (dup.length) throw Error(`${c.code} already lists "${term}"`);
  await db.exec('BEGIN');
  try {
    await db.query('insert into reactions (case_id, term, onset_on, outcome) values ($1,$2,$3,$4)', [c.id, term, f.onset ? date(f.onset, 'onset') : null, outcome]);
    await log(db, actor, 'add-reaction', c.code, `${term} (${outcome})`);
    const dz = await startClock(db, c, on, actor);
    await db.exec('COMMIT');
    const listed = (await db.query('select expected from reaction_check where case_code = $1 and term = $2', [c.code, term]))[0].expected;
    return { case: c.code, term, label: listed ? 'listed' : 'NOT LISTED (unexpected)', ...(dz ? { clock_started: dz } : {}) };
  } catch (e) { await db.exec('ROLLBACK'); throw e; }
}

async function assess(db, q, f, actor) {
  const c = await openCase(db, q);
  const p = (await db.query('select * from products where id = $1', [c.product_id]))[0];
  const raw = need(f.serious, 'serious').toLowerCase();
  const serious = raw === 'none' ? [] : [...new Set(raw.split(',').map((s) => one(s.trim(), SERIOUS, 'serious')))];
  const cat = f['device-category'] ? one(f['device-category'], DEVICE_CATS, 'device-category') : null;
  if (cat && p.kind !== 'device') throw Error(`${p.code} is a medicine; --device-category is for device cases`);
  if (p.kind === 'device' && !cat && !c.device_category) throw Error(`${p.code} is a device: say which reporting category with --device-category=${DEVICE_CATS.join('|')}`);
  const causality = one(need(f.causality, 'causality'), CAUSALITY, 'causality');
  const on = dateOr(f.on, 'on', today());
  await db.query(`update cases set serious_criteria = $2, device_category = coalesce($3, device_category), causality = $4, assessed_on = $5, assessed_by = $6 where id = $1`,
    [c.id, serious, cat, causality, on, actor]);
  await log(db, actor, 'assess', c.code, `${serious.length ? serious.join(', ') : 'non-serious'}${cat ? `, ${cat}` : ''}, causality ${causality}`);
  const k = await clockOf(db, c.code);
  return { case: c.code, seriousness: k.seriousness || 'non-serious', device_category: k.device_category, causality, unexpected: k.unexpected,
    reportable: k.reportable, due_on: k.due_on, days_left: k.days_left,
    ...(k.reportable && !k.submitted_on ? { next: `Lodge with ${k.regulator} by ${k.due_on}. Draft it: npm run safety -- draft-report ${c.code}` } : {}) };
}

async function submit(db, q, f, actor) {
  const c = await findCase(db, q);
  if (c.status === 'nullified') throw Error(`${c.code} is nullified`);
  const k = await clockOf(db, c.code);
  const on = dateOr(f.on, 'on', today());
  const ref = need(f.reference, 'reference');
  if (f.followup) {
    const fu = await findFollowup(db, f.followup);
    if (fu.case_id !== c.id) throw Error(`${fu.code} belongs to another case`);
    if (!fu.received_on) throw Error(`${fu.code} has no answer yet`);
    if (!k.submitted_on) throw Error(`${c.code} has no initial report yet; lodge that first`);
    if ((await db.query('select 1 from submissions where followup_id = $1', [fu.id])).length) throw Error(`${fu.code} is already reported`);
    await db.query(`insert into submissions (case_id, kind, followup_id, regulator, submitted_on, reference, submitted_by) values ($1,'followup',$2,$3,$4,$5,$6)`,
      [c.id, fu.id, k.regulator, on, ref, actor]);
    await log(db, actor, 'submit', c.code, `follow-up ${fu.code} lodged with ${k.regulator}, ${ref}`);
    return { case: c.code, followup: fu.code, regulator: k.regulator, submitted_on: on, reference: ref };
  }
  if (!k.valid) throw Error(`${c.code} is not a valid case yet: it needs a reporter, a patient, the product and a reaction`);
  if (k.submitted_on) throw Error(`${c.code} was already lodged on ${k.submitted_on} (${k.reference}). For new information use --followup=`);
  if (on < k.day_zero) throw Error(`--on ${on} is before Day 0 (${k.day_zero})`);
  await db.query(`insert into submissions (case_id, kind, regulator, submitted_on, reference, submitted_by) values ($1,'initial',$2,$3,$4,$5)`, [c.id, k.regulator, on, ref, actor]);
  const after = await clockOf(db, c.code);
  await log(db, actor, 'submit', c.code, `lodged with ${k.regulator}, ${ref}, ${after.days_to_submit} days after Day 0`);
  return { case: c.code, regulator: k.regulator, submitted_on: on, reference: ref, days_after_day_zero: after.days_to_submit,
    on_time: after.rule_days == null ? 'no deadline applies' : after.days_to_submit <= after.rule_days };
}

async function requestFollowup(db, q, f, actor) {
  const c = await openCase(db, q);
  const on = dateOr(f.on, 'on', today());
  const due = f.due ? date(f.due, 'due', { past: false }) : addDays(on, 14);
  if (due < on) throw Error('--due is before the request date');
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'followups', 'FU-', 3);
  await db.query('insert into followups (code, case_id, requested_on, due_on, question) values ($1,$2,$3,$4,$5)', [code, c.id, on, due, need(f.question, 'question')]);
  await log(db, actor, 'request-followup', c.code, `${code}: ${f.question}`);
  return { followup: code, case: c.code, requested_on: on, answer_due: due, draft: `npm run safety -- draft-followup ${c.code}` };
}

async function followupReceived(db, q, f, actor) {
  const fu = await findFollowup(db, q);
  if (fu.received_on) throw Error(`${fu.code} was already answered on ${fu.received_on}`);
  const on = dateOr(f.on, 'on', today());
  if (on < fu.requested_on) throw Error(`--on is before the request (${fu.requested_on})`);
  const relevant = yesNo(f.relevant, 'relevant');
  await db.query('update followups set received_on = $2, answer = $3, medically_relevant = $4 where id = $1', [fu.id, on, need(f.answer, 'answer'), relevant]);
  const c = (await db.query('select * from cases where id = $1', [fu.case_id]))[0];
  await log(db, actor, 'followup-received', c.code, `${fu.code} answered${relevant ? ', medically relevant' : ''}`);
  const row = (await db.query('select * from followup_clock where code = $1', [fu.code]))[0];
  return { followup: fu.code, case: c.code, received_on: on, medically_relevant: relevant,
    ...(row.report_due ? { report_due: row.report_due, next: row.initial_submitted_on ? `Lodge the follow-up by ${row.report_due}: npm run safety -- submit ${c.code} --followup=${fu.code} --reference=...` : `The initial report is not lodged yet; put this answer in it.` } : {}) };
}

async function closeCase(db, q, f, actor) {
  const c = await openCase(db, q);
  const k = await clockOf(db, c.code);
  if (k.reportable && !k.submitted_on) throw Error(`${c.code} is reportable and not lodged with ${k.regulator} (due ${k.due_on}). Lodge it first.`);
  const owed = await db.query('select code from followup_clock where case_code = $1 and report_due is not null and reported_on is null and initial_submitted_on is not null', [c.code]);
  if (owed.length) throw Error(`${c.code} has follow-up information not yet lodged: ${owed.map((r) => r.code).join(', ')}`);
  if ((k.serious || k.device_category) && !k.causality) throw Error(`${c.code} is serious and has no causality assessment`);
  const on = dateOr(f.on, 'on', today());
  await db.query(`update cases set status = 'closed', closed_on = $2, close_note = $3 where id = $1`, [c.id, on, need(f.note, 'note')]);
  await log(db, actor, 'close-case', c.code, f.note);
  return { case: c.code, closed_on: on };
}

async function nullify(db, q, f, actor) {
  const c = await openCase(db, q);
  await db.query(`update cases set status = 'nullified', closed_on = $2, close_note = $3 where id = $1`, [c.id, today(), `Nullified: ${need(f.reason, 'reason')}`]);
  await log(db, actor, 'nullify', c.code, f.reason);
  const k = await clockOf(db, c.code);
  return { case: c.code, status: 'nullified', ...(k.submitted_on ? { next: `It was lodged as ${k.reference}: tell ${k.regulator} it is a duplicate or invalid so they nullify their copy too.` } : {}) };
}

async function logSearch(db, f, actor) {
  const country = one(need(f.country, 'country').toUpperCase(), ['AU', 'NZ'], 'country');
  const on = dateOr(f.on, 'on', today());
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'literature_searches', 'LS-', 4);
  await db.query(`insert into literature_searches (code, country, run_on, source, search_string, hits, cases_found, run_by) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [code, country, on, need(f.source, 'source'), need(f.search, 'search'), count(f.hits, 'hits'), count(f.cases, 'cases'), actor]);
  await log(db, actor, 'log-search', code, `${country}: ${f.hits} hits, ${f.cases} cases`);
  const every = (await db.query('select literature_every_days from markets where country = $1', [country]))[0].literature_every_days;
  return { search: code, country, run_on: on, next_due: addDays(on, every), ...(Number(f.cases) ? { next: `Book in each case with --source=literature --ref=${code}` } : {}) };
}

async function raiseIssue(db, f, actor) {
  const p = await findProduct(db, f.product);
  const on = dateOr(f.on, 'on', today());
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'safety_issues', 'SI-', 3);
  await db.query('insert into safety_issues (code, product_id, title, source, opened_on) values ($1,$2,$3,$4,$5)', [code, p.id, need(f.title, 'title'), need(f.source, 'source'), on]);
  await log(db, actor, 'raise-issue', code, `${p.code}: ${f.title}`);
  return { issue: code, product: p.code, opened_on: on, next: `Evaluate it, then classify: npm run safety -- classify-issue ${code} --kind=ssi|osi|not_a_signal --assessment=...` };
}

async function classifyIssue(db, q, f, actor) {
  const i = await findIssue(db, q);
  if (i.status !== 'open') throw Error(`${i.code} is closed`);
  const kind = one(need(f.kind, 'kind'), ['ssi', 'osi', 'not_a_signal'], 'kind');
  const aware = dateOr(f.aware, 'aware', today());
  if (aware < i.opened_on) throw Error(`--aware is before the issue was opened (${i.opened_on})`);
  await db.query('update safety_issues set kind = $2, aware_on = $3, assessment = $4 where id = $1', [i.id, kind, kind === 'not_a_signal' ? null : aware, need(f.assessment, 'assessment')]);
  await log(db, actor, 'classify-issue', i.code, `${kind}: ${f.assessment}`);
  const row = (await db.query('select * from issue_clock where code = $1', [i.code]))[0];
  return { issue: i.code, kind, aware_on: row.aware_on, due_on: row.due_on, ...(row.due_on ? { next: `Notify ${row.regulator} by ${row.due_on}. Draft it: npm run safety -- draft-issue ${i.code}` } : {}) };
}

async function reportIssue(db, q, f, actor) {
  const i = await findIssue(db, q);
  if (!['ssi', 'osi'].includes(i.kind)) throw Error(`${i.code} is a ${i.kind}; classify it as ssi or osi first`);
  if (i.reported_on) throw Error(`${i.code} was reported on ${i.reported_on}`);
  const on = dateOr(f.on, 'on', today());
  await db.query('update safety_issues set reported_on = $2, reference = $3 where id = $1', [i.id, on, need(f.reference, 'reference')]);
  await log(db, actor, 'report-issue', i.code, `reported ${on}, ${f.reference}`);
  const row = (await db.query('select * from issue_clock where code = $1', [i.code]))[0];
  return { issue: i.code, reported_on: on, due_on: row.due_on, on_time: on <= row.due_on };
}

async function closeIssue(db, q, f, actor) {
  const i = await findIssue(db, q);
  if (i.status === 'closed') throw Error(`${i.code} is already closed`);
  if (i.kind === 'signal') throw Error(`${i.code} is still a signal under evaluation; classify it first`);
  if (['ssi', 'osi'].includes(i.kind) && !i.reported_on) throw Error(`${i.code} is a ${i.kind} and has not been reported`);
  const on = dateOr(f.on, 'on', today());
  await db.query(`update safety_issues set status = 'closed', closed_on = $2 where id = $1`, [i.id, on]);
  await log(db, actor, 'close-issue', i.code, `closed ${on}`);
  return { issue: i.code, closed_on: on };
}

async function reconcile(db, q, f, actor) {
  const p = await findPartner(db, q);
  const on = dateOr(f.on, 'on', today());
  const theirs = count(f.theirs, 'theirs');
  const ours = count(f.ours, 'ours');
  if (theirs !== ours && !f.missing) throw Error(`The counts differ (${theirs} theirs, ${ours} ours): say which cases with --missing=`);
  await db.exec('BEGIN');
  try {
    await db.query('insert into reconciliations (partner_id, reconciled_on, their_cases, our_cases, missing, by_whom) values ($1,$2,$3,$4,$5,$6)', [p.id, on, theirs, ours, f.missing || '', actor]);
    await db.query('update partners set last_reconciled_on = greatest(coalesce(last_reconciled_on, $2), $2) where id = $1', [p.id, on]);
    await log(db, actor, 'reconcile', p.code, `${theirs} theirs, ${ours} ours${f.missing ? `; missing ${f.missing}` : ''}`);
    await db.exec('COMMIT');
  } catch (e) { await db.exec('ROLLBACK'); throw e; }
  return { partner: p.code, reconciled_on: on, next_due: addDays(on, p.reconcile_every_days), ...(f.missing ? { next: `Book in the missing cases with --source=partner --partner=${p.code}` } : {}) };
}

async function submitPeriodic(db, q, f, actor) {
  const pr = await findOne(db, 'periodic_reports', q, 'periodic report', 'code');
  if (pr.submitted_on) throw Error(`${pr.code} was lodged on ${pr.submitted_on}`);
  const on = dateOr(f.on, 'on', today());
  await db.query('update periodic_reports set submitted_on = $2, reference = $3 where id = $1', [pr.id, on, need(f.reference, 'reference')]);
  await log(db, actor, 'submit-periodic', pr.code, `lodged ${on}, ${f.reference}`);
  return { periodic_report: pr.code, submitted_on: on, due_on: pr.due_on, on_time: on <= pr.due_on };
}

async function setContact(db, q, f, actor) {
  const country = one(need(q, 'country').toUpperCase(), ['AU', 'NZ'], 'country');
  const notified = f.notified ? date(f.notified, 'notified') : null;
  await db.query('update markets set pv_contact = $2, pv_contact_notified_on = $3 where country = $1', [country, need(f.name, 'name'), notified]);
  await log(db, actor, 'set-contact', country, `${f.name}${notified ? `, regulator told ${notified}` : ', regulator not told yet'}`);
  return { market: country, pv_contact: f.name, notified_on: notified };
}

// ------------------------------------------------------------------ import from an Argus case line listing

const ACOLS = {
  case_no: ['Case Number', 'Case Num', 'Case ID', 'Manufacturer Control Number', 'Case'],
  received: ['Initial Receipt Date', 'Receipt Date', 'Initial Received Date', 'Aware Date', 'Date Received'],
  product: ['Suspect Product', 'Product Name', 'Product', 'Primary Suspect Product', 'Drug'],
  country: ['Country of Incidence', 'Country', 'Occurrence Country', 'Event Country'],
  report_type: ['Report Type', 'Case Source', 'Source'],
  reporter_type: ['Reporter Type', 'Reporter Occupation', 'Reporter Qualification'],
  reporter: ['Reporter Name', 'Reporter'],
  initials: ['Patient Initials', 'Patient ID', 'Initials'],
  age: ['Patient Age', 'Age'],
  sex: ['Patient Sex', 'Gender', 'Sex'],
  term: ['Event PT', 'Preferred Term', 'Event Preferred Term', 'Event Verbatim', 'Reaction', 'Event'],
  onset: ['Onset Date', 'Event Onset Date'],
  outcome: ['Event Outcome', 'Outcome'],
  serious: ['Serious', 'Case Serious', 'Seriousness'],
  criteria: ['Seriousness Criteria', 'Serious Criteria'],
  causality: ['Company Causality', 'Causality', 'Reporter Causality', 'Relatedness'],
  narrative: ['Narrative', 'Case Narrative', 'Brief Narrative'],
  submitted: ['Submission Date', 'Date Submitted', 'Report Sent Date', 'Regulatory Submission Date'],
  reference: ['Submission Reference', 'Regulatory Reference', 'Agency Reference', 'Local Reference'],
};
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function normDate(v, label) {
  v = String(v || '').trim();
  if (!v) return null;
  let m;
  if ((m = v.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = v.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{4})$/)) && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if ((m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  throw Error(`${label} "${v}" is not a date this importer reads (2026-03-04, 04-MAR-2026 or 04/03/2026)`);
}
const COUNTRY = { australia: 'AU', 'new zealand': 'NZ', 'united kingdom': 'GB', 'united states': 'US', canada: 'CA', ireland: 'IE', singapore: 'SG' };
const mapCountry = (v) => { const s = String(v || '').trim(); return /^[A-Za-z]{2}$/.test(s) ? s.toUpperCase() : COUNTRY[s.toLowerCase()] || null; };
const mapSource = (v) => { const s = String(v || '').toLowerCase();
  return s.includes('lit') ? 'literature' : s.includes('study') || s.includes('trial') ? 'study' : s.includes('licens') || s.includes('partner') ? 'partner'
    : s.includes('regulat') || s.includes('authority') ? 'regulator' : s.includes('social') ? 'social_media' : 'spontaneous'; };
const mapReporter = (v) => { const s = String(v || '').toLowerCase(); if (!s) return null;
  return s.includes('physician') || s.includes('doctor') ? 'doctor' : s.includes('pharmac') ? 'pharmacist' : s.includes('nurse') ? 'nurse'
    : s.includes('lawyer') ? 'lawyer' : s.includes('consumer') || s.includes('patient') || s.includes('non-health') ? 'consumer'
    : s.includes('health') ? 'other_health_professional' : 'other'; };
const mapCriteria = (v) => String(v || '').toLowerCase().split(/[;,|]/).map((s) => s.trim()).filter(Boolean).map((s) =>
  s.includes('death') || s.includes('fatal') ? 'death' : s.includes('life') ? 'life_threatening' : s.includes('hospital') ? 'hospitalisation'
    : s.includes('disab') || s.includes('incapac') ? 'disability' : s.includes('congenital') ? 'congenital_anomaly' : 'medically_important');
const mapCausality = (v) => { const s = String(v || '').toLowerCase(); if (!s) return null;
  return s.includes('not related') || s.includes('unrelated') ? 'unrelated' : s.includes('unlikely') ? 'unlikely' : s.includes('certain') ? 'certain'
    : s.includes('probable') || s.includes('likely') ? 'probable' : s.includes('possib') || s.includes('related') ? 'possible' : 'unassessable'; };
const mapOutcome = (v) => { const s = String(v || '').toLowerCase(); if (!s) return 'unknown';
  return s.includes('fatal') || s.includes('died') ? 'fatal' : s.includes('sequel') ? 'recovered_with_sequelae' : s.includes('not recovered') ? 'not_recovered'
    : s.includes('recovering') ? 'recovering' : s.includes('recovered') || s.includes('resolved') ? 'recovered' : 'unknown'; };

async function importArgus(db, f, actor) {
  const file = need(f.cases, 'cases');
  const text = fs.readFileSync(file, 'utf8');
  const rows = parseCsv(text);
  const market = f.market ? one(f.market.toUpperCase(), ['AU', 'NZ'], 'market') : null;
  const products = await db.query('select id, code, name, kind, country from products');
  const problems = [];
  const byCase = new Map();
  rows.forEach((r, i) => {
    const line = i + 2;
    try {
      const g = (k) => pick(r, ...ACOLS[k]).trim();
      const no = need(g('case_no'), "case number");
      const country = mapCountry(g('country'));
      if (!country) throw Error(`country "${g('country')}" is not a country this importer knows; use the two-letter code`);
      const mkt = ['AU', 'NZ'].includes(country) ? country : market;
      if (!mkt) throw Error(`case from ${country}: pass --market=AU or --market=NZ to say which market's product it belongs to`);
      const name = g('product').toLowerCase();
      const p = products.find((x) => x.country === mkt && (x.code.toLowerCase() === name || x.name.toLowerCase() === name || x.name.toLowerCase().startsWith(name)));
      if (!p) throw Error(`product "${g('product')}" is not set up for ${mkt}; add it first`);
      if (!byCase.has(no)) {
        const serious = mapCriteria(g('criteria'));
        if (!serious.length && /^(y|yes|serious|true|1)$/i.test(g('serious'))) serious.push('medically_important');
        const age = g('age') === '' ? null : parseInt(g('age'), 10);
        byCase.set(no, { no, product: p, country, received: need(normDate(g('received'), "receipt date") || '', "receipt date"),
          source: mapSource(g('report_type')), reporter_type: mapReporter(g('reporter_type')), reporter: g('reporter') || null,
          initials: g('initials') || null, age: Number.isFinite(age) ? age : null, sex: (g('sex')[0] || '').toUpperCase() || null,
          serious, causality: mapCausality(g('causality')), narrative: g('narrative'), submitted: normDate(g('submitted'), "submission date"),
          reference: g('reference') || null, reactions: [] });
      }
      const c = byCase.get(no);
      if (c.sex && !['F', 'M', 'X'].includes(c.sex)) c.sex = null;
      const term = g('term').toLowerCase();
      if (term && !c.reactions.some((x) => x.term === term)) c.reactions.push({ term, onset: normDate(g('onset'), "onset date"), outcome: mapOutcome(g('outcome')) });
    } catch (e) { problems.push(`row ${line}: ${e.message}`); }
  });
  const existing = new Set((await db.query('select source_ref from cases where source_ref is not null')).map((r) => r.source_ref));
  const fresh = [...byCase.values()].filter((c) => !existing.has(c.no));
  const summary = { rows: rows.length, cases_in_file: byCase.size, cases_new: fresh.length, cases_already_here: byCase.size - fresh.length,
    reactions_new: fresh.reduce((n, c) => n + c.reactions.length, 0), problems, dry_run: Boolean(f['dry-run']) };
  if (problems.length || f['dry-run']) {
    if (problems.length && !f['dry-run']) throw Error(`Nothing imported. Fix these first:\n  ${problems.join('\n  ')}`);
    return summary;
  }
  await db.exec('BEGIN');
  try {
    let lodged = 0;
    for (const c of fresh) {
      const code = await nextCode(db, 'cases', 'C-', 4);
      const row = (await db.query(`insert into cases (code, product_id, received_on, source, reporter_type, reporter_name, patient_initials, patient_age, patient_sex,
          country, serious_criteria, causality, assessed_on, assessed_by, narrative, source_ref) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning *`,
        [code, c.product.id, c.received, c.source, c.reporter_type, c.reporter, c.initials, c.age, c.sex, c.country, c.serious, c.causality,
          c.causality ? c.received : null, c.causality ? 'imported from Argus' : null, c.narrative, c.no]))[0];
      for (const r of c.reactions) await db.query('insert into reactions (case_id, term, onset_on, outcome) values ($1,$2,$3,$4)', [row.id, r.term, r.onset, r.outcome]);
      const k = await clockOf(db, code);
      if (k.valid) await db.query('update cases set day_zero = received_on where id = $1', [row.id]);
      if (c.submitted && c.reference && k.valid) {
        await db.query(`insert into submissions (case_id, kind, regulator, submitted_on, reference, submitted_by) values ($1,'initial',$2,$3,$4,'imported from Argus')`,
          [row.id, k.regulator, c.submitted < c.received ? c.received : c.submitted, c.reference]);
        lodged++;
      }
    }
    await db.query('insert into imports (source, file_name, file_sha256, rows_read, rows_imported, actor) values ($1,$2,$3,$4,$5,$6)',
      ['argus', path.basename(file), createHash('sha256').update(text).digest('hex'), rows.length, fresh.length, actor]);
    await log(db, actor, 'import', null, `argus: ${fresh.length} cases, ${summary.reactions_new} reactions, ${lodged} already lodged`);
    await db.exec('COMMIT');
    // Imported cases arrive open. Anything reportable and not lodged shows on the clock and in attention.
    return { ...summary, already_lodged: lodged };
  } catch (e) { await db.exec('ROLLBACK'); throw e; }
}

async function exportAll(db, f) {
  const out = path.resolve(need(f.out, 'out'));
  if (fs.existsSync(out)) throw Error(`${out} already exists; choose a new file name`);
  const data = { exported_at: new Date().toISOString() };
  for (const t of TABLES) data[t] = await db.query(`select * from ${t}`);
  fs.writeFileSync(out, JSON.stringify(data, null, 2), { mode: 0o600 });
  return { file: out, tables: Object.fromEntries(TABLES.map((t) => [t, data[t].length])) };
}

// ------------------------------------------------------------------ drafts

function draftsDir() {
  const dir = path.join(process.env.OUTPUT_DIR || REPO_ROOT, 'drafts');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const md = (rows) => {
  if (!rows.length) return '_None._\n';
  const cols = Object.keys(rows[0]);
  const cell = (v) => String(v ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ');
  return `| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n${rows.map((r) => `| ${cols.map((c) => cell(r[c])).join(' | ')} |`).join('\n')}\n`;
};

async function draftReport(db, q) {
  const d = await caseDetail(db, q);
  const c = d.case;
  const lodged = d.submissions.find((s) => s.kind === 'initial');
  const body = `# Adverse event report for ${c.regulator}: ${c.code}

| Field | Value |
|---|---|
| Product | ${c.product} |
| Report type | ${c.source}${c.source_ref ? ` (${c.source_ref})` : ''} |
| Received | ${c.received_on} |
| Day 0 | ${c.day_zero || 'not yet: the case is not valid'} |
| Deadline | ${c.due_on || 'none applies'} |
| Reporter | ${c.reporter || 'not known'} |
| Patient | ${c.patient || 'not known'} |
| Country of the reaction | ${c.country} |
| Seriousness | ${c.seriousness || ''}${c.device_category ? ` ${c.device_category.replace(/_/g, ' ')}` : ''} |
| Company causality | ${c.causality || 'not assessed'} |

## Reactions
${md(d.reactions)}
## What happened
${c.narrative || '[Write the narrative: who, what, when, dose, other medicines, outcome.]'}

## Follow-up so far
${md(d.followups.filter((x) => x.received_on).map((x) => ({ followup: x.code, received: x.received_on, relevant: x.medically_relevant })))}
_Draft prepared ${today()} from case ${c.code}. ${lodged ? `The initial report went as ${lodged.reference} on ${lodged.submitted_on}; mark this as a follow-up and quote that reference.` : `Lodge it with ${c.regulator} the way it asks (online form, data link or a CIOMS form), then record the reference: npm run safety -- submit ${c.code} --reference=<ref>`} Nothing has been sent._
`;
  const file = path.join(draftsDir(), `report-${c.code.toLowerCase()}-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, case: c.code, regulator: c.regulator, due_on: c.due_on };
}

async function draftFollowup(db, q) {
  const d = await caseDetail(db, q);
  const c = d.case;
  const open = d.followups.filter((x) => !x.received_on);
  const qs = (await db.query(`select f.question from followups f join cases c on c.id = f.case_id where c.code = $1 and f.received_on is null order by f.requested_on`, [c.code])).map((r) => r.question);
  const k = await clockOf(db, c.code);
  const missing = [!k.has_patient && 'the patient\'s age, sex or initials', !k.has_reaction && 'what happened to the patient', !k.has_reporter && 'your role (doctor, pharmacist, nurse, patient)'].filter(Boolean);
  const market = (await db.query('select * from markets where country = $1', [k.market]))[0];
  const body = `# Follow-up request: ${c.code}

To: ${c.reporter || '[reporter]'}${c.reporter && c.source !== 'social_media' ? '' : ' (reply privately, never in a public thread)'}

Thank you for telling us about a possible side effect of ${k.product_name}. We take every report seriously and are required to follow it up.

To understand what happened, could you tell us:

${(qs.length ? qs : missing).map((x, i) => `${i + 1}. ${x}`).join('\n') || '1. [Add the questions.]'}

Anything you can share helps, even if you do not know every answer. Your details are kept confidential and used only for monitoring the safety of this medicine.

${market.pv_contact || '[Name]'}
Pharmacovigilance, ${market.sponsor_name}

_Draft prepared ${today()} for case ${c.code}${open.length ? ` (${open.map((x) => x.code).join(', ')} open)` : ''}. Check it, send it from your usual address, then record the request if you have not: npm run safety -- request-followup ${c.code} --question=... Nothing has been sent._
`;
  const file = path.join(draftsDir(), `followup-${c.code.toLowerCase()}-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, case: c.code, questions: (qs.length ? qs : missing).length };
}

async function draftIssue(db, q) {
  const i = await findIssue(db, q);
  const row = (await db.query('select * from issue_clock where code = $1', [i.code]))[0];
  const p = (await db.query('select * from products where id = $1', [i.product_id]))[0];
  const terms = await db.query(`select term, count(*)::int as cases, string_agg(case_code, ', ') as case_codes, bool_or(expected) as listed from reaction_check where ingredient = $1 group by term order by count(*) desc limit 10`, [p.ingredient]);
  const market = (await db.query('select * from markets where country = $1', [p.country]))[0];
  const kindName = { ssi: 'Significant safety issue', osi: 'Other safety issue', signal: 'Signal under evaluation', not_a_signal: 'Closed as not a signal' }[i.kind];
  const body = `# ${kindName} notification to ${row.regulator}: ${i.code}

| Field | Value |
|---|---|
| Sponsor | ${market.sponsor_name} |
| Product | ${p.name} (${p.approval_ref || 'approval not recorded'}) |
| Active ingredient | ${p.ingredient} |
| Issue | ${i.title} |
| Where it came from | ${i.source} |
| Became aware | ${i.aware_on || 'not yet classified'} |
| Deadline | ${row.due_on || 'none until classified'} |

## Assessment
${i.assessment || '[What the evidence shows, how strong it is, and what it means for patients.]'}

## Reaction terms reported for ${p.ingredient}
${md(terms.map((t) => ({ term: t.term, cases: t.cases, label: t.listed ? 'listed' : 'not listed', case_codes: t.case_codes })))}
## Proposed action
[Label change, letter to health professionals, recall, further study, or no action and why.]

## Contact
${market.pv_contact || '[Pharmacovigilance contact]'}, ${market.sponsor_name}

_Draft prepared ${today()} from issue ${i.code}. Lodge it the way ${row.regulator} asks, then record it: npm run safety -- report-issue ${i.code} --reference=<ref>. Nothing has been sent._
`;
  const file = path.join(draftsDir(), `issue-${i.code.toLowerCase()}-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, issue: i.code, kind: i.kind, due_on: row.due_on };
}

async function lineListing(db, q, f) {
  const p = await findProduct(db, q);
  const pr = (await db.query('select * from periodic_reports where product_id = $1 and submitted_on is null order by due_on limit 1', [p.id]))[0];
  const from = f.from ? date(f.from, 'from') : pr?.period_from || addDays(today(), -365);
  const to = f.to ? date(f.to, 'to') : pr?.period_to || today();
  if (to < from) throw Error('--to is before --from');
  const cases = await db.query(`select code, received_on, country, source, coalesce(nullif(seriousness, ''), 'non-serious') as seriousness, reactions, causality,
      case when unexpected then 'yes' else 'no' end as unexpected, coalesce(reference, '-') as reference
    from case_clock where (product = $1 or (product_name = $2 and market <> $3)) and status <> 'nullified' and received_on between $4 and $5 order by received_on`,
    [p.code, p.name, p.country, from, to]);
  const terms = await db.query(`select term, case when bool_or(expected) then 'listed' else 'not listed' end as label, count(*)::int as cases
    from reaction_check where ingredient = $1 and received_on between $2 and $3 group by term order by count(*) desc, term`, [p.ingredient, from, to]);
  const issues = await db.query(`select code, title, kind, status from issue_clock where product = $1 and opened_on <= $2 order by opened_on`, [p.code, to]);
  const body = `# Periodic safety report line listing: ${p.name}, ${from} to ${to}

${pr ? `Periodic report ${pr.code}, due ${pr.due_on}.` : 'No periodic report is scheduled for this product; this listing covers the period asked for.'}

## Cases in the period (${cases.length})
${md(cases)}
## Summary by reaction term
${md(terms)}
## Signals and safety issues
${md(issues)}
_Draft tables prepared ${today()} for the periodic report. The benefit and risk discussion is written by the qualified person; nothing has been lodged._
`;
  const file = path.join(draftsDir(), `line-listing-${p.code.toLowerCase()}-${to}.md`);
  fs.writeFileSync(file, body);
  return { file, product: p.code, from, to, cases: cases.length, terms: terms.length };
}

async function weeklyReview(db) {
  const att = await db.query(reads.attention.sql);
  const clock = await db.query(reads.clock.sql);
  const fu = await db.query(reads.followups.sql);
  const urgent = (await db.query('select item, rule from safety_attention where severity = 1 order by item'));
  const body = `# Drug safety: weekly review, ${today()}

${urgent.length ? `**${urgent.length} item(s) touch a regulator deadline and come first:** ${urgent.map((u) => `${u.item} (${u.rule})`).join('; ')}.` : '**Nothing this week is past or near a regulator deadline.**'}

## Needs attention
${md(att)}
## The reporting clock
${md(clock)}
## Follow-ups
${md(fu)}
_Draft from three commands: attention, clock, followups. Read before the safety meeting._
`;
  const file = path.join(draftsDir(), `weekly-review-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, needs_attention: att.length, urgent: urgent.length, on_the_clock: clock.length, followups: fu.length };
}

// ------------------------------------------------------------------ run

export async function run(db, args) {
  const { cmd, pos, f } = parse(args);
  let actor = null;
  if (mutating.has(cmd)) actor = need(f.actor, 'actor');
  if (Object.hasOwn(reads, cmd)) {
    if (cmd === 'compliance') {
      const out = [];
      for (const r of complianceRules) for (const row of await db.query(r.sql)) out.push({ rule: r.rule, code: row.code, finding: row.finding });
      return out.sort((a, b) => a.code.localeCompare(b.code) || a.rule.localeCompare(b.rule));
    }
    return db.query(reads[cmd].sql);
  }
  const target = pos[0];
  switch (cmd) {
    case 'help': return Object.entries(usage).map(([command, a]) => ({ command, args: a, about: reads[command]?.about || '' }));
    case 'product': return productDetail(db, pos.join(' '));
    case 'case': return caseDetail(db, pos.join(' '));
    case 'log-case': return logCase(db, f, actor);
    case 'update-case': return updateCase(db, target, f, actor);
    case 'add-reaction': return addReaction(db, target, f, actor);
    case 'assess': return assess(db, target, f, actor);
    case 'submit': return submit(db, target, f, actor);
    case 'request-followup': return requestFollowup(db, target, f, actor);
    case 'followup-received': return followupReceived(db, target, f, actor);
    case 'close-case': return closeCase(db, target, f, actor);
    case 'nullify': return nullify(db, target, f, actor);
    case 'log-search': return logSearch(db, f, actor);
    case 'raise-issue': return raiseIssue(db, f, actor);
    case 'classify-issue': return classifyIssue(db, target, f, actor);
    case 'report-issue': return reportIssue(db, target, f, actor);
    case 'close-issue': return closeIssue(db, target, f, actor);
    case 'reconcile': return reconcile(db, pos.join(' '), f, actor);
    case 'submit-periodic': return submitPeriodic(db, target, f, actor);
    case 'set-contact': return setContact(db, target, f, actor);
    case 'import':
      if (target !== 'argus') throw Error(`Usage: import ${usage.import}`);
      return importArgus(db, f, actor);
    case 'export': return exportAll(db, f);
    case 'draft-report': return draftReport(db, pos.join(' '));
    case 'draft-followup': return draftFollowup(db, pos.join(' '));
    case 'draft-issue': return draftIssue(db, pos.join(' '));
    case 'line-listing': return lineListing(db, pos.join(' '), f);
    case 'weekly-review': return weeklyReview(db);
    default: throw Error(`Unknown command ${cmd}`);
  }
}

function print(cmd, result) {
  if (Array.isArray(result)) {
    if (!result.length) { console.log('  (none)'); return; }
    const cols = Object.keys(result[0]).map((key) => ({ key, label: key, width: ['detail', 'finding', 'about', 'args', 'search_string', 'title', 'reactions', 'source'].includes(key) ? 46 : undefined,
      align: typeof result[0][key] === 'number' ? 'right' : 'left' }));
    console.log(textTable(result, cols));
    return;
  }
  if (cmd === 'case' || cmd === 'product') {
    const head = result.case || result.product;
    console.log(heading(`${head.code}  ${head.product || head.name || ''}`));
    for (const [k, v] of Object.entries(head)) if (v !== null && v !== undefined && v !== '' && !['code', 'product', 'name'].includes(k)) console.log(`  ${k.padEnd(18)}${v}`);
    for (const [label, rows] of Object.entries(result)) {
      if (!Array.isArray(rows)) continue;
      console.log(heading(label.replace(/_/g, ' ')));
      print('', rows);
    }
    return;
  }
  for (const [k, v] of Object.entries(result)) console.log(`  ${k.padEnd(22)}${Array.isArray(v) ? (v.length ? '\n    ' + v.join('\n    ') : 'none') : typeof v === 'object' && v ? JSON.stringify(v) : v}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  let db;
  try {
    db = await getDb();
    const result = await run(db, args);
    if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else print(args.find((a) => !a.startsWith('--')) || 'help', result);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    if (db) await db.close();
  }
}
