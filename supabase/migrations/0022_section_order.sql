-- ============================================================================
-- Section display order.
--
-- The order the founder arranges their tabs in is the order an investor scrolls
-- through the room. One list drives both, so the admin cannot show a different
-- story from the one the investor reads.
--
-- Only the content sections are orderable. Details is pinned first (it is the
-- deck and the deal terms, which every investor looks for immediately), and
-- Deal Flow and Settings are admin-only and pinned last, so they never appear
-- in this list at all.
--
-- Unknown or missing keys fall back to the default order, so a deal saved before
-- this migration keeps working.
-- Safe to re-run.
-- ============================================================================
begin;

alter table public.dealstudios
  add column if not exists section_order jsonb;

update public.dealstudios
   set section_order = '["documents","problem","valueprop","market","competition","businessmodel","team"]'::jsonb
 where section_order is null;

commit;

select slug, section_order from public.dealstudios;
