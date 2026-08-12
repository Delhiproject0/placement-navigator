-- Local development and end-to-end test data.
--
-- Applied by `supabase db reset`, never to production. Shapes mirror the real
-- data deliberately: the CTC strings are the messy free-text forms that
-- actually occur ("11 LPA" next to "INR 34,05,000"), and several companies
-- have no dates at all, because 22 of the 59 live rows are in that state and
-- code that only ever sees fully-populated rows breaks on contact with them.

-- Accounts. Password for all three is "placement123".
select public.app_signup('admin@iiit.ac.in', 'placement123', 'Admin User');
select public.app_signup('editor@iiit.ac.in', 'placement123', 'Editor User');
select public.app_signup('student@iiit.ac.in', 'placement123', 'Student User');

update public.user_roles set role = 'admin'
  where user_id = (select id from public.app_users where email = 'admin@iiit.ac.in');
update public.user_roles set role = 'editor'
  where user_id = (select id from public.app_users where email = 'editor@iiit.ac.in');

-- ============================================================================
-- Seasons
--
-- Three, so the year selector and the per-company history are exercisable
-- locally. On the live database the migration infers seasons from the existing
-- rows instead; this only ever runs against a fresh local one.
-- ============================================================================

select public.ensure_season('2023-24');
select public.ensure_season('2024-25');
select public.ensure_season('2025-26');

update public.seasons set is_current = false;
update public.seasons set is_current = true where slug = '2025-26';

-- Companies, one per phase so every branch of resolvePhase() has a row.
insert into public.companies
  (season_id, name, description, job_location, offered_ctc, ctc_distribution, cgpa_cutoff, roles,
   people_selected, registration_deadline, ppt_datetime, oa_datetime, interview_datetime, status)
select (select id from public.seasons where slug = '2025-26'), *
from (values
  ('Wavelength Systems', 'Embedded and signal processing.', 'Bengaluru',
   'INR 34,05,000', 'Base 24L, Bonus 4L, ESOP 6L', 7.00, array['SDE', 'Hardware'],
   null, now() + interval '10 days', now() + interval '14 days',
   now() + interval '20 days', now() + interval '26 days', 'upcoming'),

  ('Kestrel Analytics', 'Quant research desk.', 'Mumbai',
   '20 LPA', null, 8.00, array['Quantitative Developer'],
   null, now() + interval '4 hours', now() + interval '3 days',
   now() + interval '9 days', null, 'upcoming'),

  ('Northwind Robotics', 'Autonomy for warehouse fleets.', 'Hyderabad',
   'INR 26,00,000', null, 7.50, array['Robotics Engineer', 'Perception', 'SLAM'],
   null, now() - interval '2 days', now() + interval '2 days',
   now() + interval '8 days', now() + interval '15 days', 'upcoming'),

  ('Halcyon Fintech', 'Payments infrastructure.', 'Pune',
   '11 LPA', null, 6.50, array['Backend Engineer'],
   null, now() - interval '20 days', now() - interval '9 days',
   now() + interval '5 days', now() + interval '12 days', 'ongoing'),

  ('Meridian Cloud', 'Distributed storage.', 'Bengaluru, Remote',
   'INR 41,50,000', 'Base 30L, RSU 9L, Joining 2.5L', 7.50, array['SDE', 'SRE'],
   null, now() - interval '30 days', now() - interval '22 days',
   now() - interval '10 days', now() + interval '6 days', 'ongoing'),

  ('Solstice Labs', 'Applied ML research.', 'Bengaluru',
   'INR 53,82,364, INR 44,73,930', 'Two offer bands', 8.50, array['Research Engineer', 'MLE'],
   4, now() - interval '60 days', now() - interval '50 days',
   now() - interval '40 days', now() - interval '30 days', 'upcoming'),

  ('Cobalt Semiconductors', 'Silicon verification.', 'Noida',
   '18,00,000 INR', null, 7.00, array['Design Verification'],
   11, now() - interval '90 days', now() - interval '80 days',
   now() - interval '70 days', now() - interval '62 days', 'completed'),

  ('Grayfield Consulting', 'Withdrew from the cycle.', 'Gurugram',
   '15', null, 7.00, array['Analyst'],
   null, now() - interval '15 days', null, null, null, 'cancelled'),

  -- No dates at all: the state 22 live companies are in.
  ('Aperture Systems', 'Announced, dates to follow.', null, '13.5', null, null,
   array['SDE'], null, null, null, null, null, 'upcoming'),
  ('Tessellate AI', 'Announced, dates to follow.', null, null, null, null,
   null::text[], null::integer, null::timestamptz, null::timestamptz, null::timestamptz,
   null::timestamptz, 'upcoming'::public.placement_status)
) as v;

-- ============================================================================
-- Previous seasons
--
-- Deliberately includes organisations that also appear in 2025-26, so the
-- "previous seasons" panel on a company page has something real to show and
-- the org_slug matching is exercised rather than assumed.
-- ============================================================================

insert into public.companies
  (season_id, name, job_location, offered_ctc, cgpa_cutoff, roles, people_selected,
   registration_deadline, oa_datetime, interview_datetime, status)
select (select id from public.seasons where slug = '2024-25'), *
from (values
  ('Solstice Labs', 'Bengaluru', 'INR 46,00,000', 8.00, array['Research Engineer'], 3,
   '2024-10-05'::timestamptz, '2024-10-20'::timestamptz, '2024-11-02'::timestamptz,
   'completed'::public.placement_status),
  ('Meridian Cloud', 'Bengaluru', 'INR 38,00,000', 7.50, array['SDE'], 6,
   '2024-09-18'::timestamptz, '2024-10-01'::timestamptz, '2024-10-14'::timestamptz, 'completed'),
  ('Cobalt Semiconductors', 'Noida', '16,00,000 INR', 7.00, array['Design Verification'], 9,
   '2024-09-02'::timestamptz, '2024-09-16'::timestamptz, '2024-09-28'::timestamptz, 'completed'),
  ('Harbour Analytics', 'Mumbai', '18 LPA', 7.50, array['Analyst'], 4,
   '2024-11-10'::timestamptz, '2024-11-24'::timestamptz, '2024-12-06'::timestamptz, 'completed')
) as v;

insert into public.companies
  (season_id, name, job_location, offered_ctc, cgpa_cutoff, roles, people_selected,
   registration_deadline, oa_datetime, interview_datetime, status)
select (select id from public.seasons where slug = '2023-24'), *
from (values
  ('Solstice Labs', 'Bengaluru', 'INR 39,00,000', 8.50, array['Research Engineer'], 2,
   '2023-10-08'::timestamptz, '2023-10-22'::timestamptz, '2023-11-05'::timestamptz,
   'completed'::public.placement_status),
  ('Cobalt Semiconductors', 'Noida', '14,00,000 INR', 7.00, array['Design Verification'], 7,
   '2023-09-05'::timestamptz, '2023-09-19'::timestamptz, '2023-10-01'::timestamptz, 'completed'),
  ('Ferrous Motors', 'Chennai', '12 LPA', 6.50, array['Embedded'], 11,
   '2023-08-28'::timestamptz, '2023-09-12'::timestamptz, '2023-09-25'::timestamptz, 'completed')
) as v;

-- An experience on a *previous* season's row, so the archive has content and
-- it can be verified that it never leaks into the current season.
insert into public.interview_experiences
  (company_id, user_id, round_name, experience, difficulty, result, tips)
select
  c.id,
  (select id from public.app_users where email = 'student@iiit.ac.in'),
  'Technical Interview',
  'The 2024 round was noticeably easier than this year - two medium DSA questions and a long discussion about my internship. They cared far more about the internship than about competitive programming.',
  'Medium',
  'Selected',
  'Know your internship work end to end. Half the interview was on it.'
from public.companies c
join public.seasons s on s.id = c.season_id
where c.name = 'Solstice Labs' and s.slug = '2024-25';

-- Contributions from the student account.
insert into public.interview_experiences
  (company_id, user_id, round_name, experience, difficulty, result, tips)
select
  c.id,
  (select id from public.app_users where email = 'student@iiit.ac.in'),
  'Online Assessment',
  'Two DSA questions in 90 minutes. The first was a straightforward sliding window; the second needed a segment tree and most people ran out of time on it. Sixty of us sat it, eighteen cleared.',
  'Hard',
  'Selected',
  'Practise segment trees and range queries. The platform did not allow custom test cases, so dry-run carefully before submitting.'
from public.companies c where c.name = 'Solstice Labs';

insert into public.interview_experiences
  (company_id, user_id, round_name, experience, difficulty, result, tips)
select
  c.id,
  (select id from public.app_users where email = 'student@iiit.ac.in'),
  'Technical Interview 1',
  'Forty-five minutes. Started with my resume projects for ten minutes, then a system design discussion about a rate limiter, then one coding question on LRU cache with a follow-up on making it thread safe.',
  'Medium',
  'Not Selected',
  'Be ready to justify every line on your resume. The follow-up questions went three levels deep on the project I listed first.'
from public.companies c where c.name = 'Cobalt Semiconductors';

insert into public.interview_questions
  (company_id, user_id, question, answer, topic, question_type)
select
  c.id,
  (select id from public.app_users where email = 'student@iiit.ac.in'),
  'Design a rate limiter that works across multiple application servers.',
  'Discussed a token bucket in Redis with atomic INCR plus expiry, then the failure modes when Redis is partitioned, and the trade-off against a sliding-window log.',
  'System Design',
  'System Design'
from public.companies c where c.name = 'Cobalt Semiconductors';

insert into public.interview_questions
  (company_id, user_id, question, answer, topic, question_type)
select
  c.id,
  (select id from public.app_users where email = 'student@iiit.ac.in'),
  'Given an array of integers, find the length of the longest subarray whose sum equals k.',
  'Prefix sums with a hash map of first-seen index. O(n) time, O(n) space.',
  'Arrays',
  'DSA'
from public.companies c where c.name = 'Solstice Labs';
