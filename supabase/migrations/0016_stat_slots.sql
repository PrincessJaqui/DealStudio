-- ============================================================================
-- Deal Information: two fixed tiles, two configurable ones.
--
-- Round and Raise Amount are the two facts every investor looks for first, so
-- they stay put. The remaining two tiles become slots the founder can point at
-- whatever matters for their raise: total raised so far, team size, the
-- instrument, headquarters, or something of their own.
--
-- stat_slots holds the two choices:
--   [{"kind":"team_size"}, {"kind":"instrument","value":"SAFE"}]
--
-- For kinds that already have a column (team_size, headquarters) the value is
-- read from that column, so nothing is duplicated. For the rest the value lives
-- in the slot itself.
-- Safe to re-run.
-- ============================================================================
begin;

alter table public.dealstudios
  add column if not exists stat_slots jsonb;

-- Existing deals keep what they already showed.
update public.dealstudios
   set stat_slots = '[{"kind":"team_size"},{"kind":"headquarters"}]'::jsonb
 where stat_slots is null;

commit;

select slug, stat_slots from public.dealstudios;
