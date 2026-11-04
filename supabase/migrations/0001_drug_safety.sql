-- Drug safety (pharmacovigilance) for medicine and medical device sponsors in
-- Australia and New Zealand: markets, products, the reporting rules each case is
-- held to, adverse event cases and their reactions, follow-up requests, regulator
-- submissions, literature searches, safety issues, periodic reports, partner
-- reconciliations and an append-only activity log.
-- Plain Postgres; runs the same on PGlite. No extensions.

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- One row per country you hold products in. The sponsor's details and the
-- pharmacovigilance contact person each regulator must be told about.
create table markets (
  country text primary key check (country in ('AU','NZ')),
  regulator text not null,
  sponsor_name text not null,
  pv_contact text,
  pv_contact_notified_on date,
  literature_every_days int not null default 7 check (literature_every_days between 1 and 90),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A product as approved in one market (an ARTG entry, a Medsafe consent).
-- listed_reactions is the reference safety information: a reaction on this list
-- is expected, anything else is unexpected.
create table products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  ingredient text not null,
  kind text not null check (kind in ('medicine','device')),
  country text not null references markets(country),
  approval_ref text,
  approved_on date,
  listed_reactions text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The clock each case is held to, as rows. Change a rule by changing a row; the
-- source says where it comes from (docs/compliance.md).
-- trigger: serious (a serious adverse reaction to a medicine), followup (medically
-- relevant follow-up to a case already sent), public_health_threat, death_serious_injury,
-- near_event (device categories), ssi and osi (safety issues).
create table reporting_rules (
  id uuid primary key default gen_random_uuid(),
  country text not null references markets(country),
  product_kind text not null check (product_kind in ('medicine','device','any')),
  trigger text not null check (trigger in ('serious','followup','public_health_threat','death_serious_injury','near_event','ssi','osi')),
  days int not null check (days between 0 and 365),
  unit text not null default 'calendar days' check (unit in ('calendar days','hours')),
  source text not null,
  unique (country, product_kind, trigger)
);

create table partners (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  role text not null check (role in ('licensor','licensee','distributor','vendor','other')),
  products text[] not null default '{}',
  reconcile_every_days int not null default 30 check (reconcile_every_days between 1 and 365),
  last_reconciled_on date,
  agreement_ref text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One adverse event case (an individual case safety report).
-- received_on is the day anyone in the business (or a vendor or partner working for
-- it) first heard of it. day_zero is the day the four minimum elements were all
-- known (reporter, patient, product, reaction): the reporting clock runs from here.
create table cases (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  product_id uuid not null references products(id),
  received_on date not null,
  day_zero date,
  source text not null check (source in ('spontaneous','literature','study','partner','regulator','social_media','other')),
  partner_id uuid references partners(id),
  reporter_type text check (reporter_type in ('doctor','pharmacist','nurse','other_health_professional','consumer','lawyer','other')),
  reporter_name text,
  reporter_contact text,
  patient_initials text,
  patient_age int check (patient_age between 0 and 130),
  patient_sex text check (patient_sex in ('F','M','X')),
  country text not null,                -- where the reaction happened (ISO code)
  serious_criteria text[] not null default '{}' check (serious_criteria <@ array['death','life_threatening','hospitalisation','disability','congenital_anomaly','medically_important']::text[]),
  device_category text check (device_category in ('public_health_threat','death_serious_injury','near_event')),
  causality text check (causality in ('certain','probable','possible','unlikely','unrelated','unassessable')),
  assessed_on date,
  assessed_by text,
  narrative text not null default '',
  status text not null default 'open' check (status in ('open','closed','nullified')),
  closed_on date,
  close_note text,
  source_ref text,                      -- the old system's case number, the article, the partner's reference
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (day_zero is null or day_zero >= received_on)
);

create table reactions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id),
  term text not null,
  onset_on date,
  outcome text not null default 'unknown' check (outcome in ('recovered','recovering','not_recovered','recovered_with_sequelae','fatal','unknown')),
  created_at timestamptz not null default now(),
  unique (case_id, term)
);

-- Questions sent back to the reporter, and the day an answer came.
-- medically_relevant: the answer changes the case, so it goes to the regulator as a follow-up.
create table followups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  case_id uuid not null references cases(id),
  requested_on date not null,
  due_on date not null,
  question text not null,
  received_on date,
  answer text,
  medically_relevant boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_on >= requested_on),
  check (received_on is null or received_on >= requested_on)
);

-- Every report lodged with a regulator, initial or follow-up.
create table submissions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id),
  kind text not null check (kind in ('initial','followup')),
  followup_id uuid references followups(id),
  regulator text not null,
  submitted_on date not null,
  reference text not null,
  submitted_by text not null,
  created_at timestamptz not null default now(),
  check ((kind = 'followup') = (followup_id is not null))
);
create unique index submissions_one_initial on submissions (case_id) where kind = 'initial';
create unique index submissions_one_per_followup on submissions (followup_id) where followup_id is not null;

create table literature_searches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  country text not null references markets(country),
  run_on date not null,
  source text not null,
  search_string text not null,
  hits int not null default 0 check (hits >= 0),
  cases_found int not null default 0 check (cases_found >= 0),
  run_by text not null,
  created_at timestamptz not null default now()
);

-- Safety issues and signals. kind: signal (still being evaluated), ssi (significant
-- safety issue), osi (other safety issue). aware_on is the day the business
-- established the issue (Day 0 for the regulator's clock).
create table safety_issues (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  product_id uuid not null references products(id),
  title text not null,
  source text not null,
  opened_on date not null,
  kind text not null default 'signal' check (kind in ('signal','ssi','osi','not_a_signal')),
  aware_on date,
  assessment text,
  reported_on date,
  reference text,
  status text not null default 'open' check (status in ('open','closed')),
  closed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table periodic_reports (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  product_id uuid not null references products(id),
  period_from date not null,
  period_to date not null,
  due_on date not null,
  submitted_on date,
  reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_to >= period_from)
);

create table reconciliations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id),
  reconciled_on date not null,
  their_cases int not null check (their_cases >= 0),
  our_cases int not null check (our_cases >= 0),
  missing text not null default '',
  by_whom text not null,
  created_at timestamptz not null default now()
);

create table imports (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  file_name text not null,
  file_sha256 text not null,
  rows_read int not null,
  rows_imported int not null,
  actor text not null,
  created_at timestamptz not null default now()
);

-- Who changed what. Append-only: an inspector reads this.
create table activity (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor text not null,
  command text not null,
  record_id text,
  detail text not null default ''
);
create or replace function activity_append_only() returns trigger language plpgsql as $$
begin raise exception 'activity is append-only'; end $$;
create trigger activity_no_update before update or delete on activity for each row execute function activity_append_only();

create trigger markets_touch before update on markets for each row execute function touch_updated_at();
create trigger products_touch before update on products for each row execute function touch_updated_at();
create trigger partners_touch before update on partners for each row execute function touch_updated_at();
create trigger cases_touch before update on cases for each row execute function touch_updated_at();
create trigger followups_touch before update on followups for each row execute function touch_updated_at();
create trigger issues_touch before update on safety_issues for each row execute function touch_updated_at();
create trigger periodic_touch before update on periodic_reports for each row execute function touch_updated_at();

-- ------------------------------------------------------------------ views

-- Each reaction marked expected or unexpected against the product's listed reactions.
create view reaction_check as
select r.id, c.code as case_code, p.code as product, p.ingredient, c.country, c.received_on, r.term, r.outcome,
  exists (select 1 from unnest(p.listed_reactions) l where lower(l) = lower(r.term)) as expected
from reactions r join cases c on c.id = r.case_id join products p on p.id = c.product_id
where c.status <> 'nullified';

-- One row per case: is it valid, is it serious, which rule applies, when it is due.
-- A case from another country is recorded but not reported to this market's regulator one by one.
create view case_clock as
with base as (
  select c.*, p.code as product, p.name as product_name, p.kind as product_kind, p.country as market, m.regulator,
    cardinality(c.serious_criteria) > 0 as serious,
    (c.reporter_type is not null) as has_reporter,
    (c.patient_initials is not null or c.patient_age is not null or c.patient_sex is not null) as has_patient,
    exists (select 1 from reactions r where r.case_id = c.id) as has_reaction,
    (select string_agg(r.term, ', ' order by r.term) from reactions r where r.case_id = c.id) as reactions,
    exists (select 1 from reaction_check x where x.case_code = c.code and not x.expected) as unexpected
  from cases c join products p on p.id = c.product_id join markets m on m.country = p.country
), keyed as (
  select b.*, (b.has_reporter and b.has_patient and b.has_reaction) as valid,
    case when b.country <> b.market then null
         when b.product_kind = 'medicine' and b.serious then 'serious'
         when b.product_kind = 'device' then b.device_category end as trigger
  from base b
)
select k.id, k.code, k.product, k.product_name, k.product_kind, k.market, k.regulator, k.country, k.source, k.received_on, k.day_zero,
  k.valid, k.has_reporter, k.has_patient, k.has_reaction, k.serious, array_to_string(k.serious_criteria, ', ') as seriousness, k.device_category,
  k.reactions, k.unexpected, k.causality, k.status, k.trigger, rr.days as rule_days,
  case when rr.days is not null and k.day_zero is not null then k.day_zero + rr.days end as due_on,
  s.submitted_on, s.reference,
  case when rr.days is not null and k.day_zero is not null and s.submitted_on is null then (k.day_zero + rr.days) - current_date end as days_left,
  case when s.submitted_on is not null and k.day_zero is not null then s.submitted_on - k.day_zero end as days_to_submit,
  (k.trigger is not null) as reportable,
  current_date - k.received_on as days_open
from keyed k
left join reporting_rules rr on rr.country = k.market and rr.trigger = k.trigger and rr.product_kind in (k.product_kind, 'any')
left join submissions s on s.case_id = k.id and s.kind = 'initial';

-- Follow-up answers that change a reported case: each needs its own report.
create view followup_clock as
select f.code, c.code as case_code, cc.market, cc.regulator, f.requested_on, f.due_on as answer_due, f.received_on, f.medically_relevant,
  cc.submitted_on as initial_submitted_on,
  case when f.received_on is not null and f.medically_relevant and cc.reportable then f.received_on + rr.days end as report_due,
  s.submitted_on as reported_on, s.reference
from followups f join cases c on c.id = f.case_id join case_clock cc on cc.id = c.id
left join reporting_rules rr on rr.country = cc.market and rr.trigger = 'followup' and rr.product_kind in (cc.product_kind, 'any')
left join submissions s on s.followup_id = f.id;

create view issue_clock as
select i.code, p.code as product, p.country as market, m.regulator, i.title, i.kind, i.opened_on, i.aware_on, i.reported_on, i.status,
  rr.days as rule_days, rr.unit,
  case when i.aware_on is not null and rr.days is not null then
    case when rr.unit = 'hours' then i.aware_on + ceil(rr.days / 24.0)::int else i.aware_on + rr.days end end as due_on,
  current_date - i.opened_on as days_open
from safety_issues i join products p on p.id = i.product_id join markets m on m.country = p.country
left join reporting_rules rr on rr.country = p.country and rr.trigger = i.kind and rr.product_kind in (p.kind, 'any');

-- Everything that needs a person, worst first.
-- severity 1 = a regulator deadline missed or within three days; 2 = overdue work; 3 = housekeeping.
create view safety_attention as
select 1 as severity, code as item, 'report overdue' as rule,
  product || ' to ' || regulator || ', due ' || due_on || ' (' || rule_days || ' days from Day 0 ' || day_zero || ')' as detail, -days_left as days
from case_clock where status = 'open' and days_left < 0
union all
select 1, code, 'report due within 3 days', product || ' to ' || regulator || ', due ' || due_on, -days_left
from case_clock where status = 'open' and days_left between 0 and 3
union all
select 1, code, 'serious case not assessed', product || ': ' || seriousness || ', causality not recorded', days_open
from case_clock where status = 'open' and (serious or device_category is not null) and causality is null
union all
select 1, f.code, 'follow-up report overdue', f.case_code || ' answer received ' || f.received_on || ', report due ' || f.report_due, current_date - f.report_due
from followup_clock f where f.report_due is not null and f.reported_on is null and f.report_due < current_date
union all
select 1, code, 'safety issue report overdue', title || ' (' || upper(kind) || ', aware ' || aware_on || ', due ' || due_on || ')', current_date - due_on
from issue_clock where kind in ('ssi','osi') and reported_on is null and due_on < current_date
union all
select 2, code, 'case not valid yet', product || ': missing ' || concat_ws(', ',
    case when not has_reporter then 'reporter' end, case when not has_patient then 'patient' end, case when not has_reaction then 'reaction' end), days_open
from case_clock where status = 'open' and not valid
union all
select 2, f.code, 'follow-up unanswered', c.code || ': ' || f.question, current_date - f.due_on
from followups f join cases c on c.id = f.case_id where f.received_on is null and f.due_on < current_date and c.status = 'open'
union all
select 2, f.code, 'follow-up answer not judged', 'answer to ' || c.code || ' came ' || f.received_on || '; is it medically relevant?', current_date - f.received_on
from followups f join cases c on c.id = f.case_id where f.received_on is not null and f.medically_relevant is null
union all
select 2, m.country, 'literature search overdue',
  coalesce('last search ' || max(l.run_on) || ', every ' || m.literature_every_days || ' days', 'no literature search recorded'),
  current_date - coalesce(max(l.run_on), min(p.approved_on)) - m.literature_every_days
from markets m join products p on p.country = m.country and p.active left join literature_searches l on l.country = m.country
group by m.country, m.literature_every_days
having coalesce(max(l.run_on), date '1900-01-01') < current_date - m.literature_every_days
union all
select 2, code, 'signal open over 60 days', title || ', opened ' || opened_on, days_open
from issue_clock where kind = 'signal' and status = 'open' and days_open > 60
union all
select 2, pr.code, 'periodic report due', p.code || ' ' || pr.period_from || ' to ' || pr.period_to || ', due ' || pr.due_on, current_date - pr.due_on
from periodic_reports pr join products p on p.id = pr.product_id where pr.submitted_on is null and pr.due_on <= current_date + 30
union all
select 2, code, 'partner reconciliation overdue', name || coalesce(', last ' || last_reconciled_on, ', never reconciled') || ', every ' || reconcile_every_days || ' days',
  current_date - coalesce(last_reconciled_on, date '1900-01-01') - reconcile_every_days
from partners where active and coalesce(last_reconciled_on, date '1900-01-01') < current_date - reconcile_every_days
union all
select 3, country, 'pharmacovigilance contact not notified', regulator || ' has not been told who your contact person is', null
from markets where pv_contact is null or pv_contact_notified_on is null
union all
select 3, code, 'case open over 30 days', product || ', ' || coalesce(reactions, 'no reaction') || case when reportable and submitted_on is not null then ', reported ' || submitted_on else '' end, days_open
from case_clock where status = 'open' and days_open > 30 and (days_left is null) and valid;
