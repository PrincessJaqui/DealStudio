-- ============================================================================
-- Demo Deal content: Value Proposition and Competition.
--
-- Fills the public demo room so a visitor sees complete, well-argued sections
-- rather than empty headings. Everything is Demo Co. and plainly fictional.
--
-- Only touches the deal flagged demo_mode, so no real customer's deal room is
-- affected. Safe to re-run.
-- ============================================================================
begin;

update public.dealstudios d
   set value_prop = jsonb_build_object(
         'headline',
         'Mid-market operators run their most important workflow on spreadsheets. We replace it with software they can actually afford.',

         'problem',
         'Operators with 20 to 500 employees are stuck between two bad options. The enterprise tools that solve this properly start at six figures and need an implementation partner. The cheap point tools solve one step and leave the other five in a spreadsheet. So the workflow lives in a shared file that three people edit, nobody trusts, and everybody works around.',

         'solution',
         'One product that covers the whole workflow, priced for a company that does not have a procurement department. It installs in an afternoon, not a quarter, and it does not need a consultant to keep it running.',

         'pillars', jsonb_build_array(
           jsonb_build_object(
             'title', 'We are the only product built for this segment',
             'description', 'The incumbents are priced for enterprise and structurally cannot come down: their cost to serve requires the six-figure contract. That leaves the mid-market underserved rather than merely unserved.'
           ),
           jsonb_build_object(
             'title', 'Switching cost works in our favour, once',
             'description', 'This workflow is sticky. That is why the incumbents keep their customers, and it is why the ones we win stay. Our net revenue retention on the first nineteen pilot accounts is 112 percent.'
           ),
           jsonb_build_object(
             'title', 'A small team can operate it',
             'description', 'What needed a dedicated infrastructure team five years ago is now a managed service. Four engineers run what would previously have taken twenty, which is what lets us charge a fifth of the incumbent price and still hold margin.'
           )
         )
       ),
       competition = jsonb_build_object(
         'overview',
         'The honest answer is that most of this market is not served by software at all. Our real competitor is a spreadsheet that mostly works, and any pitch that pretends otherwise is not being straight with you.',

         'competitors', jsonb_build_array(
           jsonb_build_object(
             'name', 'Incumbent A',
             'segment', 'Enterprise',
             'weakness', 'Six-figure floor and a six-month implementation. They cannot serve a 60-person operator profitably, and they know it.'
           ),
           jsonb_build_object(
             'name', 'Incumbent B',
             'segment', 'Enterprise',
             'weakness', 'Requires a systems integrator. The software is good; the total cost of ownership is three times the licence.'
           ),
           jsonb_build_object(
             'name', 'Point tool C',
             'segment', 'SMB',
             'weakness', 'Solves the first step well and then hands the user back to their spreadsheet. Cheap, and it stays cheap because it does not do enough.'
           ),
           jsonb_build_object(
             'name', 'Spreadsheets',
             'segment', 'Everyone',
             'weakness', 'Free, familiar, already in place, and genuinely hard to displace. This is the competitor we actually lose to, and we list it first in every internal review.'
           )
         ),

         'edge',
         'We win where the workflow is painful enough that a spreadsheet has started to cost real money, but the company is too small for an enterprise contract. That is a narrow wedge and we are not pretending it is the whole market. It is roughly 29,000 operators, it is growing, and nobody is serving it properly today.'
       ),
       updated_at = now()
  from public.organizations o
 where o.id = d.org_id
   and d.demo_mode = true;

commit;

select company_name,
       (value_prop is not null)  as has_value_prop,
       (competition is not null) as has_competition
from public.dealstudios
where demo_mode = true;
