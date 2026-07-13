-- ============================================================================
-- Viewable shared room password.
--
-- The shared password is not a login credential: it is a secret the founder
-- hands out to investors. So they need to read it back, which a bcrypt hash
-- cannot do. Losing it today means resetting it and re-notifying everyone.
--
-- So the plaintext is stored ALONGSIDE the hash. The hash still does the
-- verifying; the plaintext exists only so the owner can see what they set.
--
-- The tradeoff, stated plainly: anyone who obtains a dump of this table can
-- read deal room passwords. That is contained by two things, and both must
-- hold:
--
--   1. RLS on dealstudios already restricts select to the owning org.
--   2. get_dealstudio_public strips the column, so an anonymous visitor to a
--      deal room can never receive it. That strip is the load-bearing part of
--      this migration, and it is tested below.
--
-- Safe to re-run.
-- ============================================================================
begin;

alter table public.dealstudios
  add column if not exists shared_password_plain text;

comment on column public.dealstudios.shared_password_plain is
  'Plaintext of the shared room password so the owner can read it back. NEVER expose in any public RPC.';

-- Store both. The hash keeps doing the verifying.
create or replace function public.dealstudio_set_shared_password(p_slug text, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;

  update public.dealstudios set
    shared_password_hash  = case when nullif(p_password, '') is null then null
                                 else extensions.crypt(p_password, extensions.gen_salt('bf')) end,
    shared_password_plain = nullif(p_password, ''),
    updated_at = now()
  where slug = p_slug;
end;
$$;

-- The public payload must strip the plaintext as well as the hash. Without this
-- line, every visitor to a deal room could read the password out of the network
-- response.
create or replace function public.get_dealstudio_public(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(d) - 'shared_password_hash' - 'shared_password_plain' - 'org_id'
         || jsonb_build_object(
              'documents',
              coalesce((
                select jsonb_agg(to_jsonb(doc) order by doc.sort_order)
                  from public.deal_documents doc
                 where doc.dealstudio_id = d.id and doc.is_archived = false
              ), '[]'::jsonb),
              'theme', jsonb_build_object(
                'brand_from',   coalesce(d.brand_from,   o.brand_from),
                'brand_to',     coalesce(d.brand_to,     o.brand_to),
                'brand_accent', coalesce(d.brand_accent, o.brand_accent),
                'accent_to',    coalesce(d.accent_to,    o.accent_to),
                'logo_url',     coalesce(d.logo_url,     o.logo_url)
              )
            )
    from public.dealstudios d
    join public.organizations o on o.id = d.org_id
   where d.slug = p_slug and d.is_active = true
   limit 1;
$$;

grant execute on function public.get_dealstudio_public(text) to anon, authenticated;

commit;
