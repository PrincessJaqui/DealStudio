-- ============================================================================
-- Functions for the merged people table.
-- Safe to re-run.
-- ============================================================================
begin;

-- ── One row per person, pipeline and viewers merged ─────────────────────────
-- A viewer who is not in the pipeline still appears, because "someone opened
-- your deck and you have never spoken to them" is the single most useful row on
-- this screen.
create or replace function public.admin_deal_people(p_deal uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not public.owns_deal(p_deal) then
    raise exception 'not authorized';
  end if;

  select coalesce(jsonb_agg(x order by x->>'last_seen' desc nulls last), '[]'::jsonb)
    into v
  from (
    select jsonb_build_object(
      'access_id',     a.id,
      'visit_id',      vi.id,
      'email',         coalesce(a.email, vi.email),
      'name',          a.name,
      'company_name',  a.company_name,
      'company_logo',  a.company_logo,
      'linkedin',      a.linkedin,
      'website',       a.website,
      'stage',         coalesce(a.stage, case when vi.id is not null then 'viewed' else 'prospect' end),
      -- The access GATE, separate from the pipeline stage above.
      -- coalesce: a pure viewer has no access row, so a.status is null and
      -- (null = 'revoked') is null, not false. A null here renders as an empty
      -- cell that looks like a bug.
      'blocked',       coalesce(a.status = 'revoked', false),
      'share_token',   a.share_token,
      'visits',        coalesce(vi.page_views, 0),
      'total_seconds', coalesce(vi.total_seconds, 0),
      'deck_views',    coalesce(vi.deck_views, 0),
      'sections',      coalesce(vi.sections, '{}'::jsonb),
      'doc_views',     (
        select count(*) from jsonb_each(coalesce(vi.sections, '{}'::jsonb)) e
         where e.key like 'doc:%' and (e.value)::text <> '0'
      ),
      'last_seen',     vi.last_seen_at,
      'committed',     coalesce(a.committed_amount, 0),
      'note_count',    (select count(*) from public.dealstudio_notes n where n.access_id = a.id),
      'forwards',      greatest(0, (
        select count(*) - 1 from public.dealstudio_share_opens so where so.access_id = a.id
      ))
    ) as x
    from public.dealstudio_access a
    full outer join public.dealstudio_visits vi
      on vi.dealstudio_id = a.dealstudio_id
     and lower(vi.email) = lower(a.email)
   where coalesce(a.dealstudio_id, vi.dealstudio_id) = p_deal
  ) t;

  return v;
end;
$$;

grant execute on function public.admin_deal_people(uuid) to authenticated;


-- ── Change a stage. A note is REQUIRED. ─────────────────────────────────────
-- The note is the point: three weeks later "why is this one marked passed" has
-- an answer. Recording the change without a reason is how a pipeline becomes
-- a list of colours nobody trusts.
create or replace function public.admin_set_stage(
  p_access uuid,
  p_stage  text,
  p_note   text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_deal uuid;
  v_old  text;
begin
  select dealstudio_id, stage into v_deal, v_old
    from public.dealstudio_access where id = p_access;

  if v_deal is null then
    return jsonb_build_object('ok', false, 'message', 'No such person.');
  end if;
  if not public.owns_deal(v_deal) then
    raise exception 'not authorized';
  end if;

  if nullif(trim(coalesce(p_note, '')), '') is null then
    return jsonb_build_object('ok', false, 'message', 'Add a note explaining the change.');
  end if;

  update public.dealstudio_access set stage = p_stage where id = p_access;

  insert into public.dealstudio_notes (access_id, body, kind, author)
  values (
    p_access,
    format('%s to %s. %s', coalesce(v_old, 'new'), p_stage, trim(p_note)),
    'stage',
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'stage', p_stage);
end;
$$;

grant execute on function public.admin_set_stage(uuid, text, text) to authenticated;


-- ── Notes ───────────────────────────────────────────────────────────────────
create or replace function public.admin_deal_notes(p_access uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_deal uuid;
  v jsonb;
begin
  select dealstudio_id into v_deal from public.dealstudio_access where id = p_access;
  if v_deal is null or not public.owns_deal(v_deal) then
    raise exception 'not authorized';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id, 'body', n.body, 'kind', n.kind,
           'created_at', n.created_at, 'updated_at', n.updated_at
         ) order by n.created_at desc), '[]'::jsonb)
    into v
    from public.dealstudio_notes n
   where n.access_id = p_access;

  return v;
end;
$$;

grant execute on function public.admin_deal_notes(uuid) to authenticated;


-- ── Forward tracking: called by the investor page, anonymously ──────────────
create or replace function public.track_invite_open(p_token uuid, p_session text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_access uuid;
begin
  select id into v_access from public.dealstudio_access where share_token = p_token;
  if v_access is null then return; end if;

  insert into public.dealstudio_share_opens (access_id, session_token)
  values (v_access, coalesce(nullif(trim(p_session), ''), 'unknown'))
  on conflict (access_id, session_token) do nothing;
end;
$$;

grant execute on function public.track_invite_open(uuid, text) to anon, authenticated;

commit;
