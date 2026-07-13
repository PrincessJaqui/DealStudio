-- ============================================================================
-- Industry Reading becomes its own orderable section, and the default order
-- moves Documents and Articles to the bottom.
--
-- Reference material belongs after the argument, not before it.
--
-- IMPORTANT: this only rewrites deals still sitting on the OLD DEFAULT order.
-- A founder who deliberately arranged their own sections keeps exactly what they
-- chose; they just gain 'articles' on the end (resolveSectionOrder appends any
-- key it does not find, so no section is ever silently hidden).
--
-- Safe to re-run.
-- ============================================================================
begin;

alter table public.dealstudios
  alter column section_order set default
    '["problem","valueprop","team","market","businessmodel","competition","documents","articles"]'::jsonb;

-- Never set, so it gets the new default.
update public.dealstudios
   set section_order =
     '["problem","valueprop","team","market","businessmodel","competition","documents","articles"]'::jsonb
 where section_order is null;

-- Still on the old default, untouched by the founder: move it to the new one.
update public.dealstudios
   set section_order =
     '["problem","valueprop","team","market","businessmodel","competition","documents","articles"]'::jsonb
 where section_order =
     '["documents","problem","valueprop","market","competition","businessmodel","team"]'::jsonb;

commit;

select slug, section_order from public.dealstudios;
