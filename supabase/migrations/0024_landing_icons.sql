-- ============================================================================
-- Icons on the seeded landing feature cards.
--
-- The landing was seeded (0020) before feature items had an icon field, so a
-- site that already published its landing has icon-less cards.
--
-- site_content.value IS the blocks array (not an object wrapping one).
--
-- This only fills an icon that is missing or blank, so a founder who has already
-- chosen one keeps it, and any copy they have edited is untouched.
-- Safe to re-run.
-- ============================================================================
begin;

update public.site_content sc
   set value = (
     select jsonb_agg(
       case
         when block->>'type' = 'features' and jsonb_typeof(block->'items') = 'array' then
           jsonb_set(
             block,
             '{items}',
             (
               select coalesce(jsonb_agg(
                 case
                   when coalesce(item->>'icon', '') = '' then
                     item || jsonb_build_object('icon',
                       case (ord - 1)
                         when 0 then 'lock'
                         when 1 then 'trending-up'
                         when 2 then 'bar-chart'
                         else 'sparkles'
                       end)
                   else item
                 end
                 order by ord
               ), '[]'::jsonb)
               from jsonb_array_elements(block->'items') with ordinality as t(item, ord)
             )
           )
         else block
       end
       order by b.ord
     )
     from jsonb_array_elements(sc.value) with ordinality as b(block, ord)
   )
 where sc.key = 'landing'
   and jsonb_typeof(sc.value) = 'array';

commit;
