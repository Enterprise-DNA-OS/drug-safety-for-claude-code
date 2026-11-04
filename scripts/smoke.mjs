// npm test: a temporary database, migrate, seed twice, then every command and every gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { seed } from './seed.mjs';
import { run, reads, usage } from './safety.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'safety-'));
process.env.DATA_DIR = path.join(tmp, 'db');
process.env.OUTPUT_DIR = tmp;
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || '';
const db = await getDb();
const exercised = new Set();
let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg); checks++; };
const call = async (args) => { exercised.add(args[0]); return run(db, args); };
const fail = async (args, re) => { exercised.add(args[0]); await assert.rejects(() => run(db, args), re); checks++; };
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const fixture = (name) => path.join(REPO_ROOT, 'fixtures', name);
const actor = '--actor=Tester';

try {
  ok((await migrate(db)).ran.length === 1, 'migration applies');
  ok((await migrate(db)).ran.length === 0, 'migration is idempotent');
  await seed(db);
  await seed(db);
  ok((await db.query('select * from cases')).length === 13, 'seed is idempotent');
  ok((await db.query('select * from submissions')).length === 4, 'seeded submissions are not doubled');

  // Every read works in both shapes.
  for (const name of Object.keys(reads)) ok(Array.isArray(await call([name, '--json'])), `${name} returns rows`);
  ok((await call(['help'])).length === Object.keys(usage).length, 'help lists every command');

  // The attention list finds what the seed planted.
  const att = await call(['attention']);
  const has = (item, rule) => att.some((r) => r.item === item && r.rule === rule);
  ok(has('C-0003', 'report overdue'), 'New Zealand serious case past 15 days');
  ok(has('C-0006', 'report overdue'), 'device case past 10 days');
  ok(has('C-0002', 'report due within 3 days'));
  ok(has('C-0010', 'serious case not assessed'));
  ok(has('FU-001', 'follow-up report overdue'));
  ok(has('SI-002', 'safety issue report overdue'), 'a significant safety issue has 72 hours');
  ok(has('C-0005', 'case not valid yet'));
  ok(has('FU-002', 'follow-up unanswered'));
  ok(has('AU', 'literature search overdue'));
  ok(!has('NZ', 'literature search overdue'), 'a search six days ago is on time');
  ok(has('P-KPD', 'partner reconciliation overdue'));
  ok(!has('P-MLS', 'partner reconciliation overdue'), 'a 90-day agreement reconciled 20 days ago is fine');
  ok(has('SI-001', 'signal open over 60 days'));
  ok(has('PR-CVX-2', 'periodic report due'));
  ok(has('NZ', 'pharmacovigilance contact not notified'));
  ok(has('C-0004', 'case open over 30 days'));
  ok(!att.some((r) => r.item === 'C-0009'), 'an overseas case is not on the local clock');
  ok(!att.some((r) => r.item === 'C-0007'), 'a near event with 20 days left needs nothing yet');

  const clock = await call(['clock']);
  ok(clock[0].code === 'C-0003' && clock.find((r) => r.code === 'C-0007').rule_days === 30, 'device near events run on 30 days');
  ok(!clock.some((r) => r.code === 'C-0004'), 'a non-serious medicine case is not reportable one by one');
  const comp = await call(['compliance']);
  const finds = (rule, code) => comp.some((r) => r.rule === rule && r.code === code);
  ok(finds('REPORT-ON-TIME', 'C-0008'), 'a report lodged on day 20 is late');
  ok(!finds('REPORT-ON-TIME', 'C-0001'), 'a report lodged on day 8 is on time');
  ok(finds('REPORT-ON-TIME', 'C-0003') && finds('FOLLOWUP-ON-TIME', 'FU-001') && finds('SAFETY-ISSUE-ON-TIME', 'SI-002'));
  ok(!finds('FOLLOWUP-ON-TIME', 'FU-004'), 'a follow-up lodged in 5 days is on time');
  ok(finds('VALID-CASE', 'C-0005') && finds('ASSESSMENT', 'C-0010') && finds('LITERATURE', 'AU') && finds('PV-CONTACT', 'NZ'));
  ok(finds('PARTNER-RECONCILIATION', 'P-KPD') && !finds('PERIODIC', 'PR-CVX-1'));
  const sig = await call(['signals']);
  ok(sig[0].term === 'hepatic enzyme increased' && sig[0].label === 'NOT LISTED' && sig[0].last_90_days === 3, 'the liver signal leads');
  ok(sig.find((r) => r.term === 'hypotension').label === 'listed');
  const st = await call(['stats']);
  ok(st.find((r) => r.market === 'AU').late === 1 && st.find((r) => r.market === 'AU').from_overseas === 1);

  // Lookup: code, prefix, name words, ambiguity, misses, bad flags.
  ok((await call(['product', 'dermacalm'])).product.code === 'DRM-NZ');
  ok((await call(['case', 'c-0003'])).case.regulator === 'Medsafe');
  await fail(['product', 'corvexa'], /Ambiguous/);
  await fail(['product', 'nothing like this'], /No matching/);
  await fail(['attention', '--wat'], /Unknown flag/);
  await fail(['attention', 'extra'], /takes no arguments/);
  await fail(['attention', '--json=no'], /boolean/);

  // A case from first word to closed.
  await fail(['log-case', '--product=CVX-AU', '--source=spontaneous', '--country=AU'], /--actor/);
  await fail(['log-case', '--product=CVX-AU', '--source=partner', '--country=AU', actor], /--partner is required/);
  const nc = await call(['log-case', '--product=CVX-AU', '--source=spontaneous', '--country=AU', `--received=${day(-2)}`, '--reporter-type=consumer', '--reporter=Caller', '--reaction=rash', actor]);
  ok(nc.case === 'C-0014' && !nc.valid && !nc.day_zero, 'no patient yet: no clock');
  await fail(['submit', 'C-0014', '--reference=X', actor], /not a valid case/);
  const up = await call(['update-case', 'C-0014', '--age=40', '--sex=F', actor]);
  ok(up.valid && up.clock_started === day(0), 'the clock starts the day the fourth element arrives');
  await fail(['update-case', 'C-0014', actor], /Nothing to update/);
  const rx = await call(['add-reaction', 'C-0014', '--term=Headache', '--outcome=recovered', actor]);
  ok(rx.label === 'listed', 'a listed reaction is expected');
  ok((await call(['add-reaction', 'C-0014', '--term=angioedema', actor])).label.startsWith('NOT LISTED'));
  await fail(['add-reaction', 'C-0014', '--term=rash', actor], /already lists/);
  await fail(['assess', 'C-0014', '--serious=hospital', '--causality=possible', actor], /--serious must be one of/);
  await fail(['assess', 'C-0014', '--serious=none', '--device-category=near_event', '--causality=possible', actor], /is a medicine/);
  const as = await call(['assess', 'C-0014', '--serious=life_threatening,hospitalisation', '--causality=probable', actor]);
  ok(as.reportable && as.due_on === day(15) && as.unexpected, 'serious and unexpected, due in 15 days');
  await fail(['close-case', 'C-0014', '--note=done', actor], /not lodged/);
  const fq = await call(['request-followup', 'C-0014', '--question=Was adrenaline given?', actor]);
  ok(fq.followup === 'FU-005' && fq.answer_due === day(14));
  await fail(['submit', 'C-0014', '--reference=R1', `--followup=${fq.followup}`, actor], /no answer yet/);
  const sub = await call(['submit', 'C-0014', '--reference=AEMS-TEST-1', actor]);
  ok(sub.on_time === true && sub.days_after_day_zero === 0);
  await fail(['submit', 'C-0014', '--reference=AEMS-TEST-2', actor], /already lodged/);
  const fr = await call(['followup-received', 'FU-005', '--answer=Yes, in the emergency department.', '--relevant=yes', actor]);
  ok(fr.report_due === day(15));
  await fail(['followup-received', 'FU-005', '--answer=again', '--relevant=no', actor], /already answered/);
  await fail(['close-case', 'C-0014', '--note=done', actor], /follow-up information not yet lodged/);
  ok((await call(['submit', 'C-0014', '--reference=AEMS-TEST-1-F1', '--followup=FU-005', actor])).followup === 'FU-005');
  ok((await call(['close-case', 'C-0014', '--note=Lodged with follow-up.', actor])).closed_on === day(0));
  await fail(['close-case', 'C-0014', '--note=again', actor], /closed/);
  const cd = await call(['case', 'C-0014']);
  ok(cd.submissions.length === 2 && cd.activity.some((a) => a.command === 'day-zero'), 'every step is on the record');

  // Device cases need a category; duplicates are nullified, never deleted.
  const dv = await call(['log-case', '--product=FLX-AU', '--source=spontaneous', '--country=AU', '--reporter-type=nurse', '--initials=ZZ', '--reaction=device leak', actor]);
  await fail(['assess', dv.case, '--serious=none', '--causality=possible', actor], /device-category/);
  ok((await call(['assess', dv.case, '--serious=none', '--device-category=public_health_threat', '--causality=possible', actor])).due_on === day(2));
  ok((await call(['nullify', dv.case, '--reason=duplicate of C-0006', actor])).status === 'nullified');
  ok(!(await call(['clock'])).some((r) => r.code === dv.case), 'a nullified case leaves the clock');
  await fail(['log-case', '--product=CVX-AU', '--source=spontaneous', '--country=AU', '--ref=ARG-2025-0041', actor], /already booked in/);

  // The overdue items clear when the work is done.
  ok((await call(['submit', 'C-0003', '--reference=NZ-CARM-1', actor])).on_time === false, 'late is recorded as late');
  ok((await call(['submit', 'C-0001', '--followup=FU-001', '--reference=AEMS-2026-11873-F1', actor])).followup === 'FU-001');
  ok((await call(['assess', 'C-0010', '--serious=hospitalisation', '--causality=probable', actor])).due_on);
  ok((await call(['set-contact', 'NZ', '--name=Dr Mere Walsh', `--notified=${day(0)}`, actor])).notified_on === day(0));
  const ls = await call(['log-search', '--country=AU', '--source=Embase and PubMed', '--search=corvatan OR corvexa', '--hits=12', '--cases=0', actor]);
  ok(ls.next_due === day(7));
  ok((await call(['reconcile', 'Kiwi Pharma', '--theirs=4', '--ours=4', actor])).next_due === day(30));
  await fail(['reconcile', 'P-MLS', '--theirs=5', '--ours=4', actor], /say which cases/);
  const att2 = await call(['attention']);
  for (const [item, rule] of [['C-0003', 'report overdue'], ['FU-001', 'follow-up report overdue'], ['C-0010', 'serious case not assessed'],
    ['NZ', 'pharmacovigilance contact not notified'], ['AU', 'literature search overdue'], ['P-KPD', 'partner reconciliation overdue']]) {
    ok(!att2.some((r) => r.item === item && r.rule === rule), `${item} ${rule} cleared`);
  }

  // Safety issues: signal, classify, report, close.
  const si = await call(['raise-issue', '--product=VLN-AU', '--title=Somnolence and driving', '--source=literature', actor]);
  await fail(['report-issue', si.issue, '--reference=X', actor], /classify it/);
  await fail(['close-issue', si.issue, actor], /still a signal/);
  const cl = await call(['classify-issue', si.issue, '--kind=osi', '--assessment=Label update needed.', actor]);
  ok(cl.due_on === day(30));
  await fail(['close-issue', si.issue, actor], /not been reported/);
  ok((await call(['report-issue', si.issue, '--reference=SI-TGA-TEST', actor])).on_time === true);
  ok((await call(['close-issue', si.issue, actor])).closed_on === day(0));
  ok((await call(['classify-issue', 'SI-002', '--kind=ssi', '--assessment=Lot recall under way.', `--aware=${day(-5)}`, actor])).due_on === day(-2), '72 hours is three days from Day 0');
  ok((await call(['submit-periodic', 'PR-CVX-2', '--reference=PSUR-TEST', actor])).on_time === true);
  await fail(['submit-periodic', 'PR-CVX-2', '--reference=again', actor], /was lodged/);

  // Import from an Argus line listing: dry run, refusals, real run, idempotent rerun.
  await fail(['import', 'argus', `--cases=${fixture('bad-line-listing.csv')}`, actor], /Nothing imported/);
  const bad = await call(['import', 'argus', `--cases=${fixture('bad-line-listing.csv')}`, '--dry-run', actor]);
  ok(bad.problems.length === 3 && bad.problems.some((p) => /not a date/.test(p)) && bad.problems.some((p) => /not set up/.test(p)) && bad.problems.some((p) => /--market/.test(p)));
  const dry = await call(['import', 'argus', `--cases=${fixture('argus-line-listing.csv')}`, '--dry-run', actor]);
  ok(dry.cases_new === 3 && dry.reactions_new === 4 && dry.dry_run);
  const imp = await call(['import', 'argus', `--cases=${fixture('argus-line-listing.csv')}`, actor]);
  ok(imp.cases_new === 3 && imp.already_lodged === 1);
  ok((await call(['import', 'argus', `--cases=${fixture('argus-line-listing.csv')}`, actor])).cases_new === 0, 'importing twice adds nothing');
  const impd = await db.query(`select k.code, k.market, k.serious, k.due_on, k.submitted_on, k.causality, c.reporter_type from case_clock k join cases c on c.id = k.id where k.code in (select code from cases where source_ref like 'ARG-2026-01%') order by k.code`);
  ok(impd.length === 3 && impd[1].market === 'NZ' && impd[1].submitted_on === '2026-10-15' && impd[1].reporter_type === 'pharmacist');
  ok(impd[2].serious && impd[2].due_on === '2026-10-30' && impd[2].causality === 'probable', 'an imported serious case not yet lodged lands on the clock');
  ok(!impd[0].serious, 'a non-serious import stays non-serious');

  // Drafts and listings.
  const dr = await call(['draft-report', 'C-0002']);
  ok(fs.readFileSync(dr.file, 'utf8').includes('hepatic enzyme increased') && dr.due_on);
  const df = await call(['draft-followup', 'C-0005']);
  ok(fs.readFileSync(df.file, 'utf8').includes('Who had the reaction') && df.questions === 1);
  const di = await call(['draft-issue', 'SI-001']);
  ok(fs.readFileSync(di.file, 'utf8').includes('corvatan'));
  const ll = await call(['line-listing', 'CVX-AU']);
  ok(ll.cases >= 2, 'the periodic listing covers the cases in the period');
  await fail(['line-listing', 'CVX-AU', `--from=${day(-1)}`, `--to=${day(-5)}`], /before --from/);
  const wk = await call(['weekly-review']);
  ok(fs.readFileSync(wk.file, 'utf8').includes('The reporting clock') && wk.needs_attention > 0);
  const out = path.join(tmp, 'snapshot.json');
  const snap = await call(['export', `--out=${out}`]);
  ok(snap.tables.cases > 13 && JSON.parse(fs.readFileSync(out, 'utf8')).activity.length > 20);
  await fail(['export', `--out=${out}`], /already exists/);

  // The activity log is append-only.
  await assert.rejects(() => db.query(`update activity set actor = 'someone else'`), /append-only/); checks++;
  await assert.rejects(() => db.query('delete from activity'), /append-only/); checks++;

  for (const name of Object.keys(usage)) ok(exercised.has(name), `smoke exercises ${name}`);
} finally {
  await db.close();
}

// The CLI, views and documents run as a person would run them.
const env = { ...process.env, DATA_DIR: path.join(tmp, 'db'), OUTPUT_DIR: tmp };
for (const args of [['scripts/safety.mjs', 'attention'], ['scripts/safety.mjs', 'case', 'C-0002', '--json'], ['scripts/view.mjs'], ['scripts/docs.mjs']]) {
  const r = spawnSync(process.execPath, args, { cwd: REPO_ROOT, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `${args.join(' ')} failed: ${r.stderr}`);
  checks++;
}
const miss = spawnSync(process.execPath, ['scripts/safety.mjs', 'product', 'corvexa'], { cwd: REPO_ROOT, env, encoding: 'utf8' });
assert.equal(miss.status, 1);
assert.match(miss.stderr, /Ambiguous/);
checks++;

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`PASS  ${checks} checks, ${Object.keys(usage).length} commands`);
