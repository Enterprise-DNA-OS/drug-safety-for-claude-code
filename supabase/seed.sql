-- Synthetic demo data: one sponsor, Harbour Therapeutics, selling in Australia and
-- New Zealand. Every name, product and person here is invented. Dates are relative
-- to today so the attention list always has something to say: a serious case due
-- in two days, a New Zealand case already overdue, a device death report past its
-- ten days, a significant safety issue nobody has lodged, an unanswered follow-up,
-- a follow-up answer that changes a case and has not gone back to the regulator,
-- a literature search that slipped, a partner not reconciled and a periodic report
-- coming due. Idempotent: safe to run twice. Never run against a real database.

insert into markets (country, regulator, sponsor_name, pv_contact, pv_contact_notified_on, literature_every_days) values
  ('AU', 'TGA', 'Harbour Therapeutics Pty Ltd', 'Dr Mere Walsh', current_date - 400, 7),
  ('NZ', 'Medsafe', 'Harbour Therapeutics NZ Limited', null, null, 7)
on conflict (country) do nothing;

insert into reporting_rules (country, product_kind, trigger, days, unit, source) values
  ('AU','medicine','serious',15,'calendar days','TGA, Pharmacovigilance responsibilities of medicine sponsors: serious Australian adverse reactions within 15 calendar days of receipt'),
  ('AU','medicine','followup',15,'calendar days','TGA, Pharmacovigilance responsibilities of medicine sponsors: follow-up information within 15 calendar days of awareness'),
  ('AU','any','ssi',72,'hours','TGA, Pharmacovigilance responsibilities of medicine sponsors: significant safety issues within 72 hours of Australian sponsor awareness'),
  ('AU','any','osi',30,'calendar days','TGA, Pharmacovigilance responsibilities of medicine sponsors: other safety issues within 30 calendar days of awareness'),
  ('AU','device','public_health_threat',2,'calendar days','Therapeutic Goods (Medical Devices) Regulations 2002, reg 5.7: serious threat to public health, within 2 days of awareness'),
  ('AU','device','death_serious_injury',10,'calendar days','Therapeutic Goods (Medical Devices) Regulations 2002, reg 5.7: death or serious injury, within 10 days of awareness'),
  ('AU','device','near_event',30,'calendar days','Therapeutic Goods (Medical Devices) Regulations 2002, reg 5.7: an event that might have led to death or serious injury, within 30 days'),
  ('NZ','medicine','serious',15,'calendar days','Medsafe, Guideline on the Regulation of Therapeutic Products in New Zealand Part 8 (Edition 3, March 2024): serious adverse reactions within 15 calendar days of receipt'),
  ('NZ','medicine','followup',15,'calendar days','Medsafe, Adverse reaction reporting for medicines (July 2025): medically relevant follow-up within 15 calendar days')
on conflict (country, product_kind, trigger) do nothing;

insert into products (code, name, ingredient, kind, country, approval_ref, approved_on, listed_reactions) values
  ('CVX-AU', 'Corvexa 40 mg tablets', 'corvatan', 'medicine', 'AU', 'ARTG 900101', current_date - 900, array['headache','dizziness','nausea','hypotension','fatigue']),
  ('CVX-NZ', 'Corvexa 40 mg tablets', 'corvatan', 'medicine', 'NZ', 'TT50-9001', current_date - 700, array['headache','dizziness','nausea','hypotension','fatigue']),
  ('VLN-AU', 'Valerine Night capsules', 'valerian root extract', 'medicine', 'AU', 'AUST L 900202', current_date - 1200, array['drowsiness','headache','stomach upset']),
  ('DRM-NZ', 'Dermacalm 1% cream', 'hydrocortisone', 'medicine', 'NZ', 'TT50-9002', current_date - 1500, array['application site irritation','skin thinning']),
  ('FLX-AU', 'Flowline infusion set', 'infusion set (class IIa)', 'device', 'AU', 'ARTG 900303', current_date - 600, array[]::text[])
on conflict (code) do nothing;

insert into partners (code, name, role, products, reconcile_every_days, last_reconciled_on, agreement_ref) values
  ('P-KPD', 'Kiwi Pharma Distribution', 'distributor', array['CVX-NZ','DRM-NZ'], 30, current_date - 45, 'SDEA-2024-03'),
  ('P-MLS', 'Meridian Life Sciences', 'licensor', array['CVX-AU','CVX-NZ'], 90, current_date - 20, 'SDEA-2023-11')
on conflict (code) do nothing;

-- Cases.
insert into cases (code, product_id, received_on, day_zero, source, partner_id, reporter_type, reporter_name, reporter_contact,
  patient_initials, patient_age, patient_sex, country, serious_criteria, device_category, causality, assessed_on, assessed_by, narrative, status, closed_on, close_note, source_ref)
select v.code, p.id, current_date - v.recv, case when v.dz is null then null else current_date - v.dz end, v.source,
  (select id from partners where code = v.partner), v.rtype, v.rname, v.rcontact, v.pinit, v.page, v.psex, v.country, v.serious::text[], v.devcat,
  v.causality, case when v.causality is null then null else current_date - v.recv + 1 end, case when v.causality is null then null else 'Dr Mere Walsh' end,
  v.narrative, v.status, case when v.closed is null then null else current_date - v.closed end, v.close_note, v.sref
from (values
  ('C-0001','CVX-AU',30,30,'spontaneous',null,'doctor','Dr A. Patel','GP, Parramatta','JK',67,'F','AU','{hospitalisation}',null,'probable',
    'Patient started Corvexa 40 mg daily. Eight days later presented to emergency with fainting and blood pressure 82/50. Admitted overnight, Corvexa stopped, recovered.','open',null,null,'ARG-2025-0041'),
  ('C-0002','CVX-AU',13,13,'spontaneous',null,'pharmacist','R. Ngata','Community pharmacy, Hobart','LM',54,'M','AU','{medically_important}',null,'possible',
    'Pharmacist reports raised liver enzymes (ALT five times the upper limit) found on routine bloods six weeks after starting Corvexa. Not admitted.','open',null,null,null),
  ('C-0003','CVX-NZ',18,18,'partner','P-KPD','doctor','Dr H. Tane','Hospital pharmacy, Hamilton','WT',72,'M','NZ','{hospitalisation}',null,'possible',
    'Distributor passed on a hospital report: elderly man admitted with raised liver enzymes and jaundice four weeks after starting Corvexa.','open',null,null,'KPD-118'),
  ('C-0004','VLN-AU',40,40,'spontaneous',null,'consumer','Consumer','Email via website','SB',38,'F','AU','{}',null,null,
    'Consumer reports a vivid dream and morning grogginess after the first two nights of Valerine Night.','open',null,null,null),
  ('C-0005','CVX-AU',5,null,'social_media',null,'consumer',null,'Facebook comment on brand page',null,null,null,'AU','{}',null,null,
    'Comment on the brand page says Corvexa made "someone in my family" pass out. No patient details yet.','open',null,null,null),
  ('C-0006','FLX-AU',12,12,'spontaneous',null,'nurse','S. Brennan RN','Ward 4B, regional hospital','PD',81,'F','AU','{hospitalisation}','death_serious_injury','possible',
    'Infusion set connector separated during a heparin infusion. Patient lost blood volume and needed a transfusion. Device retained by the hospital.','open',null,null,null),
  ('C-0007','FLX-AU',10,10,'spontaneous',null,'nurse','T. Lim RN','Day surgery unit','RA',45,'M','AU','{}','near_event','unlikely',
    'Connector found cracked on opening a new pack before use. No patient harm. Lot number recorded.','open',null,null,null),
  ('C-0008','CVX-AU',60,60,'study',null,'doctor','Dr K. Moore','Post-registration study site 3','EM',59,'F','AU','{hospitalisation}',null,'probable',
    'Study participant admitted with low blood pressure and a fall after a dose increase. Recovered.','closed',35,'Reported, study investigator confirmed recovery.','ARG-2025-0033'),
  ('C-0009','CVX-AU',9,9,'partner','P-MLS','doctor','Licensor safety team','Meridian Life Sciences','DF',63,'M','GB','{hospitalisation}',null,'possible',
    'Licensor case from the United Kingdom: hepatitis after six weeks of corvatan. Held for the signal review; not an Australian case.','open',null,null,'MLS-UK-2207'),
  ('C-0010','CVX-AU',3,3,'literature',null,'doctor','Okafor et al.','Aust Prescr case report','NR',70,'F','AU','{hospitalisation}',null,null,
    'Published case report from a Brisbane hospital: drug-induced liver injury in a woman on corvatan for three months.','open',null,null,'Literature hit LS-0012'),
  ('C-0011','DRM-NZ',50,50,'spontaneous',null,'pharmacist','J. Fale','Pharmacy, Porirua','TA',9,'M','NZ','{}',null,'probable',
    'Redness and stinging where the cream was applied on a child, settled after stopping.','closed',30,'Non-serious, recorded for the periodic report.',null),
  ('C-0012','CVX-AU',75,75,'spontaneous',null,'doctor','Dr L. Chen','GP, Geelong','BW',61,'M','AU','{medically_important}',null,'possible',
    'Liver enzymes three times the upper limit on routine bloods eight weeks after starting Corvexa. Stopped, enzymes settled.','closed',50,'Reported and closed.','ARG-2025-0029'),
  ('C-0013','CVX-AU',150,150,'spontaneous',null,'consumer','Consumer','Phone line','GH',47,'F','AU','{}',null,'probable',
    'Headache in the first week, settled on its own.','closed',120,'Non-serious, expected.',null)
) as v(code, product, recv, dz, source, partner, rtype, rname, rcontact, pinit, page, psex, country, serious, devcat, causality, narrative, status, closed, close_note, sref)
join products p on p.code = v.product
on conflict (code) do nothing;

insert into reactions (case_id, term, onset_on, outcome)
select c.id, v.term, current_date - v.onset, v.outcome
from (values
  ('C-0001','syncope',38,'recovered'), ('C-0001','hypotension',38,'recovered'),
  ('C-0002','hepatic enzyme increased',16,'not_recovered'),
  ('C-0003','hepatic enzyme increased',21,'recovering'), ('C-0003','jaundice',21,'recovering'),
  ('C-0004','abnormal dreams',42,'recovered'), ('C-0004','drowsiness',42,'recovered'),
  ('C-0005','syncope',6,'unknown'),
  ('C-0006','haemorrhage',12,'recovered'), ('C-0006','device connection issue',12,'unknown'),
  ('C-0007','device breakage',10,'unknown'),
  ('C-0008','hypotension',62,'recovered'), ('C-0008','fall',62,'recovered'),
  ('C-0009','hepatitis',20,'recovering'),
  ('C-0010','drug-induced liver injury',40,'recovering'),
  ('C-0011','application site irritation',52,'recovered'),
  ('C-0012','hepatic enzyme increased',78,'recovered'),
  ('C-0013','headache',152,'recovered')
) as v(code, term, onset, outcome)
join cases c on c.code = v.code
on conflict (case_id, term) do nothing;

insert into followups (code, case_id, requested_on, due_on, question, received_on, answer, medically_relevant)
select v.code, c.id, current_date - v.req, current_date - v.due, v.question, case when v.recv is null then null else current_date - v.recv end, v.answer, v.relevant
from (values
  ('FU-001','C-0001',25,11,'Discharge summary and blood pressure readings since stopping Corvexa?',20,'Discharge summary received: orthostatic hypotension, also on a new diuretic started the same week.',true),
  ('FU-002','C-0002',10,3,'Liver function results since stopping, other medicines, alcohol history?',null,null,null),
  ('FU-003','C-0005',4,-10,'Who had the reaction (their age and sex), and what happened after they took Corvexa?',null,null,null),
  ('FU-004','C-0012',70,56,'Repeat liver function after stopping?',60,'Enzymes back to normal four weeks after stopping.',true)
) as v(code, case_code, req, due, question, recv, answer, relevant)
join cases c on c.code = v.case_code
on conflict (code) do nothing;

insert into submissions (case_id, kind, followup_id, regulator, submitted_on, reference, submitted_by)
select c.id, v.kind, (select id from followups where code = v.fu), v.regulator, current_date - v.sub, v.ref, 'Dr Mere Walsh'
from (values
  ('C-0001','initial',null,'TGA',22,'AEMS-2026-11873'),
  ('C-0008','initial',null,'TGA',40,'AEMS-2026-10544'),
  ('C-0012','initial',null,'TGA',65,'AEMS-2026-10102'),
  ('C-0012','followup','FU-004','TGA',55,'AEMS-2026-10102-F1')
) as v(case_code, kind, fu, regulator, sub, ref)
join cases c on c.code = v.case_code
where not exists (select 1 from submissions s where s.reference = v.ref);

insert into literature_searches (code, country, run_on, source, search_string, hits, cases_found, run_by)
select v.code, v.country, current_date - v.ago, v.source, v.search, v.hits, v.found, 'Dr Mere Walsh'
from (values
  ('LS-0009','AU',32,'Embase and PubMed','corvatan OR corvexa OR "valerian root extract" OR valerine',14,0),
  ('LS-0010','AU',25,'Embase and PubMed','corvatan OR corvexa OR "valerian root extract" OR valerine',9,0),
  ('LS-0011','AU',18,'Embase and PubMed','corvatan OR corvexa OR "valerian root extract" OR valerine',11,0),
  ('LS-0012','AU',11,'Embase, PubMed and Australian Prescriber','corvatan OR corvexa OR "valerian root extract" OR valerine',16,1),
  ('LS-0013','NZ',6,'Embase, PubMed and NZ Medical Journal','corvatan OR corvexa OR hydrocortisone cream',21,0)
) as v(code, country, ago, source, search, hits, found)
on conflict (code) do nothing;

insert into safety_issues (code, product_id, title, source, opened_on, kind, aware_on, assessment, reported_on, reference, status, closed_on)
select v.code, p.id, v.title, v.source, current_date - v.opened, v.kind, case when v.aware is null then null else current_date - v.aware end,
  v.assessment, case when v.reported is null then null else current_date - v.reported end, v.ref, v.status, case when v.closed is null then null else current_date - v.closed end
from (values
  ('SI-001','CVX-AU','Liver injury with corvatan','Case series C-0002, C-0003, C-0009, C-0010, C-0012',70,'signal',null,null,null,null,'open',null),
  ('SI-002','FLX-AU','Connector separation on Flowline lot 24-118','Cases C-0006 and C-0007, both lot 24-118',8,'ssi',5,'Two connector failures from one lot within days, one with serious harm. Treat as significant.',null,null,'open',null),
  ('SI-003','VLN-AU','Next-day drowsiness and driving','Literature and two consumer reports',200,'osi',180,'Label already warns about drowsiness; add advice on driving.',165,'SI-TGA-2026-0410','closed',120)
) as v(code, product, title, source, opened, kind, aware, assessment, reported, ref, status, closed)
join products p on p.code = v.product
on conflict (code) do nothing;

insert into periodic_reports (code, product_id, period_from, period_to, due_on, submitted_on, reference)
select v.code, p.id, current_date - v.pfrom, current_date - v.pto, current_date + v.due, case when v.sub is null then null else current_date - v.sub end, v.ref
from (values
  ('PR-CVX-1','CVX-AU',770,405,-345,350,'PSUR-TGA-2025-0201'),
  ('PR-CVX-2','CVX-AU',405,40,20,null,null)
) as v(code, product, pfrom, pto, due, sub, ref)
join products p on p.code = v.product
on conflict (code) do nothing;

insert into reconciliations (partner_id, reconciled_on, their_cases, our_cases, missing, by_whom)
select p.id, current_date - v.ago, v.theirs, v.ours, v.missing, 'Dr Mere Walsh'
from (values ('P-KPD',45,3,3,''), ('P-MLS',20,41,40,'MLS-UK-2207 not yet booked in')) as v(partner, ago, theirs, ours, missing)
join partners p on p.code = v.partner
where not exists (select 1 from reconciliations r where r.partner_id = p.id and r.reconciled_on = current_date - v.ago);

insert into activity (actor, command, record_id, detail)
select 'seed', 'seed', null, 'synthetic demo data loaded'
where not exists (select 1 from activity where command = 'seed');
