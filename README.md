# DealStudio

DealStudio is a private, secure investor deal studio: an investor-facing view
(deck and document viewer, market, an interactive business model / revenue
calculator, team, meeting scheduler) plus an admin editor and investor
pipeline / analytics dashboard. It runs on its own domain (dealstudio.io),
GitHub, Vercel, and Supabase.

## What's included
- **Investor view** (`/`, `/dealstudio`): gated access, deck/document viewer,
  Market, interactive Business Model / Revenue calculator, Team, meeting
  scheduler, and per-visitor analytics capture.
- **Admin view** (`/admin`): deal studio editor (Market, Business Model, Team,
  documents, availability) and the investor pipeline (leads, stages, notes
  history, contact details, viewer analytics).
- **Edge function**: `supabase/functions/send-deal-meeting-request`.

## Stack
Vite + React + TypeScript + Tailwind v4 + Supabase. (The Vite config keeps the
version-pinned import aliases from the source app so the UI/editor resolve.)

## Setup

### 1. Install & run
```bash
npm install
cp .env.example .env      # fill in your new Supabase URL + anon key
npm run dev
```

### 2. Supabase
The app talks to Supabase through a set of tables and **Postgres functions
(RPCs)**. The RPC bodies live in the original project, not this repo, so the
cleanest path is to copy the deal studio schema into a **new** Supabase project:

- Tables: `dealstudios`, `deal_documents`, `dealstudio_access`,
  `dealstudio_visits`, `deal_meetings`, `analytics_events`,
  `analytics_sessions`, `user_roles`.
- RPCs and edge-function details are listed in `supabase/schema.sql`.

Export them from the old project (`supabase db dump`, or `pg_get_functiondef`
per function) and run the result on the new project. Then set Row Level Security
to match.

### 3. Edge function
```bash
supabase functions deploy send-deal-meeting-request
supabase secrets set RESEND_API_KEY=... DEALSTUDIO_INBOX=hello@dealstudio.io SITE_URL=https://dealstudio.io
```

### 4. Admin access
`/admin` gates on the `user_roles` table. Create a Supabase auth user and give
it the admin role your RPCs expect.

### 5. Deploy (Vercel)
Import the repo, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build
env vars, framework preset **Vite**, build `npm run build`, output `dist`.

## Notes / honest caveats
- This is an extraction: the frontend is complete and self-contained, but it
  **cannot run until the Supabase schema + RPCs above exist** in your new
  project — those functions are the backend contract.
- `src/lib/supabase.ts` was slimmed to just the client. `src/lib/mockData.ts` is
  a minimal `Event` type used by the availability calendar.
- Branding still references DealStudio in a couple of places (logo asset, default
  inbox); swap `src/assets/dealstudio-nav-logo.png` and the copy as you like.
- The Vite config carries unused `figma:asset` aliases from the source app; they
  are harmless and can be trimmed.
# DealStudio
