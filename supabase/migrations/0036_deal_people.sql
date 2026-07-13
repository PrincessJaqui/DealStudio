-- ============================================================================
-- One table of people per deal: pipeline and viewers merged.
--
-- TWO WORDS THAT MEAN DIFFERENT THINGS, AND MUST STAY SEPARATE:
--   status  = the ACCESS GATE. approved / revoked. dealstudio_verify_access
--             only lets in 'approved'. Blocking sets 'revoked'.
--   stage   = the PIPELINE. prospect, met, viewed, lead, ... closed, passed.
--
-- The UI calls the pipeline column "Status", which is fine for a founder, but
-- collapsing them in the database would mean marking someone "passed" silently
-- locked them out of the room, or that blocking someone reset their pipeline.
-- They stay separate.
--
-- Safe to re-run.
-- ============================================================================
begin;

-- ── Pipeline stages ─────────────────────────────────────────────────────────
alter table public.dealstudio_access drop constraint if exists dealstudio_access_stage_check;

-- Old values map forward: reached_out -> met, engaged -> interested.
update public.dealstudio_access set stage = 'met'        where stage = 'reached_out';
update public.dealstudio_access set stage = 'interested' where stage = 'engaged';

alter table public.dealstudio_access
  add constraint dealstudio_access_stage_check
  check (stage in (
    'prospect',     -- founder added them by hand
    'met',          -- founder has spoken to them
    'viewed',       -- set automatically the first time they open the room
    'lead',         -- founder moved them into the pipeline
    'interested',
    'negotiating',
    'committed',
    'closed',
    'passed'
  ));

alter table public.dealstudio_access alter column stage set default 'prospect';

-- ── Who they are ────────────────────────────────────────────────────────────
alter table public.dealstudio_access
  add column if not exists company_name  text,
  add column if not exists company_logo  text,
  add column if not exists linkedin      text,
  add column if not exists website       text,
  -- Their own link. Anyone opening the room with this token is either them or
  -- someone they forwarded it to.
  add column if not exists share_token   uuid default gen_random_uuid();

update public.dealstudio_access set share_token = gen_random_uuid() where share_token is null;

create unique index if not exists dealstudio_access_share_token_key
  on public.dealstudio_access (share_token);

-- ── Notes, as real rows ─────────────────────────────────────────────────────
-- A note per row, not a blob in a text column: they need ordering, editing, and
-- an honest record of who changed a stage and why.
create table if not exists public.dealstudio_notes (
  id          uuid primary key default gen_random_uuid(),
  access_id   uuid not null references public.dealstudio_access(id) on delete cascade,
  body        text not null,
  -- 'note' = written by hand. 'stage' = written automatically when the stage
  -- changed, so the history explains itself later.
  kind        text not null default 'note' check (kind in ('note', 'stage')),
  author      uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

create index if not exists dealstudio_notes_access_idx
  on public.dealstudio_notes (access_id, created_at desc);

alter table public.dealstudio_notes enable row level security;

drop policy if exists notes_owner_all on public.dealstudio_notes;
create policy notes_owner_all on public.dealstudio_notes
  for all to authenticated
  using (exists (
    select 1 from public.dealstudio_access a
     where a.id = access_id and public.owns_deal(a.dealstudio_id)
  ))
  with check (exists (
    select 1 from public.dealstudio_access a
     where a.id = access_id and public.owns_deal(a.dealstudio_id)
  ));

-- ── Forward tracking ────────────────────────────────────────────────────────
-- Every distinct browser that opens someone's personal link. The FIRST is the
-- investor. Any others are people the link reached that we never sent it to.
--
-- This is a proxy for sharing, not a measurement of it: the same investor on a
-- phone and a laptop looks like one forward, and a forward nobody opens looks
-- like none. The UI says "Forwards" for exactly that reason.
create table if not exists public.dealstudio_share_opens (
  id             uuid primary key default gen_random_uuid(),
  access_id      uuid not null references public.dealstudio_access(id) on delete cascade,
  session_token  text not null,
  first_seen_at  timestamptz not null default now()
);

create unique index if not exists dealstudio_share_opens_uniq
  on public.dealstudio_share_opens (access_id, session_token);

alter table public.dealstudio_share_opens enable row level security;

drop policy if exists share_opens_owner_read on public.dealstudio_share_opens;
create policy share_opens_owner_read on public.dealstudio_share_opens
  for select to authenticated
  using (exists (
    select 1 from public.dealstudio_access a
     where a.id = access_id and public.owns_deal(a.dealstudio_id)
  ));

commit;
