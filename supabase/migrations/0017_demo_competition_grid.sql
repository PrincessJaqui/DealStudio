-- ============================================================================
-- Demo Deal: competition as a comparison grid.
--
-- Rewrites the demo's competition into the new shape (rows = what you compete
-- on, columns = players, with marks) so the demo shows the actual chart rather
-- than a bare list.
--
-- Demo Co is flagged is_you, so it is pinned first and highlighted. The status
-- quo (spreadsheets) is included on purpose: a competitive grid that leaves it
-- out reads as naive, and the demo should model the honest version.
-- Safe to re-run.
-- ============================================================================
begin;

update public.dealstudios d
   set competition = jsonb_build_object(
     'overview',
     'Most of this market is not served by software at all. Our real competitor is a spreadsheet that mostly works, and any pitch that pretends otherwise is not being straight with you.',

     'features', jsonb_build_array(
       jsonb_build_object('id', 'f_price',    'label', 'Priced for mid-market'),
       jsonb_build_object('id', 'f_whole',    'label', 'Covers the whole workflow'),
       jsonb_build_object('id', 'f_selfserve','label', 'Live in a day, no integrator'),
       jsonb_build_object('id', 'f_audit',    'label', 'Audit trail'),
       jsonb_build_object('id', 'f_api',      'label', 'Open API')
     ),

     'competitors', jsonb_build_array(
       jsonb_build_object(
         'id', 'c_us', 'name', 'Demo Co', 'segment', 'Mid-market',
         'is_you', true, 'weakness', '',
         'marks', jsonb_build_object(
           'f_price', true, 'f_whole', true, 'f_selfserve', true,
           'f_audit', true, 'f_api', true)
       ),
       jsonb_build_object(
         'id', 'c_a', 'name', 'Incumbent A', 'segment', 'Enterprise',
         'weakness', 'Six-figure floor and a six-month implementation. They cannot serve a 60-person operator profitably, and they know it.',
         'marks', jsonb_build_object(
           'f_price', false, 'f_whole', true, 'f_selfserve', false,
           'f_audit', true, 'f_api', true)
       ),
       jsonb_build_object(
         'id', 'c_b', 'name', 'Incumbent B', 'segment', 'Enterprise',
         'weakness', 'Requires a systems integrator. The software is good; the total cost of ownership is three times the licence.',
         'marks', jsonb_build_object(
           'f_price', false, 'f_whole', true, 'f_selfserve', false,
           'f_audit', true, 'f_api', false)
       ),
       jsonb_build_object(
         'id', 'c_c', 'name', 'Point tool C', 'segment', 'SMB',
         'weakness', 'Solves the first step well and then hands the user back to their spreadsheet.',
         'marks', jsonb_build_object(
           'f_price', true, 'f_whole', false, 'f_selfserve', true,
           'f_audit', false, 'f_api', true)
       ),
       jsonb_build_object(
         'id', 'c_ss', 'name', 'Spreadsheets', 'segment', 'Everyone',
         'weakness', 'Free, familiar, already in place, and genuinely hard to displace. This is the competitor we actually lose to, and we list it first in every internal review.',
         'marks', jsonb_build_object(
           'f_price', true, 'f_whole', false, 'f_selfserve', true,
           'f_audit', false, 'f_api', false)
       )
     ),

     'edge',
     'We win where the workflow is painful enough that a spreadsheet has started to cost real money, but the company is too small for an enterprise contract. That is a narrow wedge and we are not pretending it is the whole market. It is roughly 29,000 operators, it is growing, and nobody is serving it properly today.'
   ),
   stat_slots = '[{"kind":"total_raised","value":"$250K"},{"kind":"instrument","value":"SAFE"}]'::jsonb,
   updated_at = now()
 where d.demo_mode = true;

commit;

select company_name,
       jsonb_array_length(competition->'features')    as rows,
       jsonb_array_length(competition->'competitors') as players
from public.dealstudios
where demo_mode = true;
