-- ============================================================================
-- Expose the live committed total to the investor page -- but ONLY when the
-- founder has actually chosen to show it.
--
-- The Committed stat tile used to be a number typed by hand. It drifted: an
-- investor commits, the pipeline updates, and the investor page still shows last
-- month's figure. Now it reads the same sum Deal Flow does.
--
-- The condition matters. Putting the committed total in the public payload
-- unconditionally would hand it to every visitor even when the founder never
-- chose to display it. It is only included when a stat slot asks for it.
--
-- Safe to re-run.
-- ============================================================================
begin;

create or replace function public.deal_committed_total(p_slug text)
returns numeric
language sql stable security definer set search_path = public as $$
  select case
    when exists (
      select 1
        from public.dealstudios d,
             jsonb_array_elements(coalesce(d.stat_slots, '[]'::jsonb)) s
       where lower(d.slug) = lower(trim(p_slug))
         and d.is_active
         and s->>'kind' = 'total_raised'
    )
    then coalesce((
      select sum(a.committed_amount)
        from public.dealstudio_access a
        join public.dealstudios d2 on d2.id = a.dealstudio_id
       where lower(d2.slug) = lower(trim(p_slug))
         and a.stage = 'committed'
    ), 0)
    -- Not displayed, so not disclosed.
    else null
  end;
$$;

grant execute on function public.deal_committed_total(text) to anon, authenticated;

commit;
