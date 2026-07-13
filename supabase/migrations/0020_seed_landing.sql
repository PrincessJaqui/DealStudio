-- ============================================================================
-- Seed the landing editor with the page that is actually live.
--
-- The editor previously started empty and fell back to the built-in page, so
-- the first thing a platform admin saw was a blank canvas: to change one word
-- of the headline you had to rebuild the whole page from scratch.
--
-- This loads the real copy in as blocks, so opening the editor shows the live
-- page and you edit from there.
--
-- Only seeds when the key is unset or empty, so re-running never clobbers work
-- that has already been published.
-- ============================================================================
begin;

insert into public.site_content (key, value, updated_at)
select 'landing', $json$[
  {
    "id": "b_hero",
    "type": "hero",
    "eyebrow": "",
    "title": "Your Studio, Your Raise.",
    "body": "Build your deal, upload your deck, and manage investor access from a single command center.",
    "ctaLabel": "Start free for 30 days",
    "ctaHref": "/signup"
  },
  {
    "id": "b_features",
    "type": "features",
    "title": "The Professional Command Center for Your Raise",
    "body": "",
    "items": [
      {
        "title": "Gated access",
        "body": "Password, invite-only, or a private share link. Revoke anytime. You decide who sees what, per investor."
      },
      {
        "title": "Live business model",
        "body": "An interactive revenue model and market funnel investors can explore. Edit once, everyone sees the latest."
      },
      {
        "title": "Investor analytics",
        "body": "See who opened the deck, what they read, and how long. Follow up on the ones leaning in."
      }
    ]
  },
  {
    "id": "b_cta",
    "type": "cta",
    "dark": true,
    "title": "Ready to open your deal room?",
    "body": "Publish a private, always-current investor page in minutes.",
    "ctaLabel": "Start free for 30 days",
    "ctaHref": "/signup"
  }
]$json$::jsonb, now()
where not exists (
  select 1 from public.site_content
   where key = 'landing'
     and value is not null
     and jsonb_array_length(value) > 0
);

commit;

select key, jsonb_array_length(value) as blocks from public.site_content where key = 'landing';
