-- ============================================================================
-- Share image per deal. The picture that shows when a deal link is pasted into
-- iMessage, Slack, LinkedIn, etc.
--
--   share_image_url    -> the stored 1200x630 PNG served as og:image
--   share_image_source -> 'auto' (generated from the deck's first slide) or
--                         'custom' (the founder uploaded their own). This flag is
--                         what protects a founder's override: when a NEW deck is
--                         uploaded we regenerate the auto image, but only if the
--                         source is still 'auto'. A custom image is never
--                         overwritten by a deck change.
--
-- Rendering the slide happens in the BROWSER at upload time (the client already
-- renders PDF pages to canvas for thumbnails), so there is no serverless PDF
-- renderer to go wrong. This migration is just the two columns to store the
-- result.
-- ============================================================================
begin;

alter table public.dealstudios
  add column if not exists share_image_url text,
  add column if not exists share_image_source text not null default 'auto'
    check (share_image_source in ('auto', 'custom'));

commit;

select 'share image columns ready' as status;
