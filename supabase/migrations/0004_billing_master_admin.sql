-- ============================================================================
-- DealStudio Phase 5: billing + Master Admin.
--   plans           - subscription tiers the platform sells ($20/mo default)
--   transactions    - every payment, synced from Stripe by the webhook
--   platform_admins - who may see across ALL organizations (you)
--   organizations   - gains suspended / comped, and a 30-day trial
--
-- Platform admins deliberately bypass tenant isolation. Every such policy is
-- additive (`org member OR platform admin`), so a normal user's access is
-- unchanged.  Safe to re-run.
-- ============================================================================
begin;

-- ── Billing state on the organization ────────────────────────────────────────

alter table public.organizations
  add column if not exists suspended boolean not null default false,
  add column if not exists comped    boolean not null default false,
  add column if not exists plan_id   uuid;

-- Trials are 30 days.
alter table public.organizations
  alter column trial_ends_at set default (now() + interval '30 days');

-- ── Plans ────────────────────────────────────────────────────────────────────

create table if not exists public.plans (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  price_cents     integer not null default 2000,
  currency        text not null default 'usd',
  interval        text not null default 'month' check (interval in ('month','year')),
  stripe_price_id text,
  description     text not null default '',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

insert into public.plans (name, price_cents, description)
select 'Pro Plan', 2000, 'Unlimited deal rooms and investors'
where not exists (select 1 from public.plans);

alter table public.organizations
  drop constraint if exists organizations_plan_id_fkey;
alter table public.organizations
  add constraint organizations_plan_id_fkey
  foreign key (plan_id) references public.plans(id) on delete set null;

-- ── Transactions (written by the Stripe webhook, read by admins) ─────────────

create table if not exists public.transactions (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid references public.organizations(id) on delete set null,
  stripe_event_id   text unique,
  stripe_invoice_id text,
  stripe_charge_id  text,
  event_name        text not null default 'payment',
  customer_email    text,
  amount_cents      integer not null default 0,
  currency          text not null default 'usd',
  status            text not null default 'paid'
                    check (status in ('paid','failed','refunded','pending')),
  kind              text not null default 'subscription'
                    check (kind in ('subscription','fee','refund')),
  created_at        timestamptz not null default now()
);
create index if not exists transactions_org_idx     on public.transactions (org_id);
create index if not exists transactions_created_idx on public.transactions (created_at desc);

-- ── Platform admins ──────────────────────────────────────────────────────────

create table if not exists public.platform_admins (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_admins where auth_user_id = auth.uid()
  );
$$;

-- Seed: the existing owners become platform admins.
insert into public.platform_admins (auth_user_id)
select u.id from auth.users u
where u.email in ('hello@dealstudio.io', 'jaquimccarthy@gmail.com')
on conflict (auth_user_id) do nothing;

-- ── Access ───────────────────────────────────────────────────────────────────

alter table public.plans           enable row level security;
alter table public.transactions    enable row level security;
alter table public.platform_admins enable row level security;

-- Plans are readable by any signed-in user (the billing screen shows them);
-- only platform admins may change them.
drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select to authenticated using (true);
drop policy if exists plans_write on public.plans;
create policy plans_write on public.plans for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- A company sees its own transactions; a platform admin sees them all.
drop policy if exists tx_read on public.transactions;
create policy tx_read on public.transactions for select to authenticated
  using (org_id in (select public.my_org_ids()) or public.is_platform_admin());
drop policy if exists tx_write on public.transactions;
create policy tx_write on public.transactions for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists pa_read on public.platform_admins;
create policy pa_read on public.platform_admins for select to authenticated
  using (auth_user_id = auth.uid() or public.is_platform_admin());

-- Platform admins can see and edit every organization (additive to org_read).
drop policy if exists org_platform_all on public.organizations;
create policy org_platform_all on public.organizations for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists members_platform_read on public.org_members;
create policy members_platform_read on public.org_members for select to authenticated
  using (public.is_platform_admin());

-- ── Master Admin RPCs ────────────────────────────────────────────────────────

-- Every organization, with its owner and billing state.
create or replace function public.admin_list_orgs()
returns table (
  id uuid, name text, owner_email text, plan text, plan_name text,
  subscription_status text, suspended boolean, comped boolean,
  trial_ends_at timestamptz, deal_count bigint, created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select
    o.id, o.name,
    (select u.email from public.org_members m
       join auth.users u on u.id = m.auth_user_id
      where m.org_id = o.id order by m.created_at limit 1) as owner_email,
    o.plan,
    (select p.name from public.plans p where p.id = o.plan_id) as plan_name,
    o.subscription_status, o.suspended, o.comped, o.trial_ends_at,
    (select count(*) from public.dealstudios d where d.org_id = o.id) as deal_count,
    o.created_at
  from public.organizations o
  where public.is_platform_admin()
  order by o.created_at desc;
$$;

create or replace function public.admin_update_org(
  p_org uuid,
  p_suspended boolean default null,
  p_comped boolean default null,
  p_plan_id uuid default null,
  p_status text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  update public.organizations set
    suspended           = coalesce(p_suspended, suspended),
    comped              = coalesce(p_comped, comped),
    plan_id             = coalesce(p_plan_id, plan_id),
    subscription_status = coalesce(nullif(p_status,''), subscription_status),
    updated_at          = now()
  where id = p_org;
end;
$$;

-- Transactions across the platform, optionally filtered by window and kind.
create or replace function public.admin_list_transactions(
  p_since timestamptz default null, p_kind text default null)
returns table (
  id uuid, created_at timestamptz, event_name text, org_name text,
  customer_email text, stripe_invoice_id text, amount_cents integer,
  currency text, status text, kind text
) language sql stable security definer set search_path = public as $$
  select t.id, t.created_at, t.event_name,
         (select o.name from public.organizations o where o.id = t.org_id) as org_name,
         t.customer_email, t.stripe_invoice_id, t.amount_cents, t.currency, t.status, t.kind
  from public.transactions t
  where public.is_platform_admin()
    and (p_since is null or t.created_at >= p_since)
    and (p_kind  is null or t.kind = p_kind)
  order by t.created_at desc
  limit 500;
$$;

/** True when the org may use the app: comped, subscribed, or still in trial. */
create or replace function public.org_entitled(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organizations o
    where o.id = p_org
      and o.suspended = false
      and (
        o.comped = true
        or o.subscription_status in ('active','trialing')
        or o.trial_ends_at > now()
      )
  );
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────

grant select on public.plans to authenticated;
grant select on public.transactions to authenticated;
grant select on public.platform_admins to authenticated;
grant insert, update, delete on public.plans to authenticated;

grant execute on function public.is_platform_admin()                       to authenticated;
grant execute on function public.admin_list_orgs()                         to authenticated;
grant execute on function public.admin_update_org(uuid,boolean,boolean,uuid,text) to authenticated;
grant execute on function public.admin_list_transactions(timestamptz,text) to authenticated;
grant execute on function public.org_entitled(uuid)                        to authenticated;

commit;
