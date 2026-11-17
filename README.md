# CSK Retention Predictor 2027

No login. A fan picks Retain/Release for every player, types a display name once, and submits.
Their browser remembers them (localStorage) so they aren't asked again and can see their own
submission; Supabase is still the source of truth — the name is just a label on a server-generated
participant id, and one prediction per id is enforced in the database, not in the browser.

## Setup (new project)
1. Create a Supabase project. Open the SQL editor and run `supabase/schema.sql`.
2. `cp .env.example .env` and fill in your project URL and anon key. Never put the service-role
   key in this project — it isn't needed.
3. `npm install && npm run dev`. Deploy to Vercel with the same two env vars.

## Upgrading an existing (v1, login-based) project
Run `supabase/migration_v2_remove_auth.sql` in the SQL editor instead of `schema.sql`. It drops
the auth-based tables/policies and creates `participants` in their place. It assumes no real
predictions have been collected yet — back up first if you already have live submissions.

## Adding player photos
`players.photo_url` holds the image shown on each card (object-fit: contain, so nothing is
cropped). It's already filled in for every player, including **Akash Madhwal**, who wasn't in
the original squad list — he's a right-arm fast bowler CSK signed as a 2026 injury replacement,
so he's seeded with `is_replacement=true`. A fresh install (`schema.sql`) gets all of this
automatically; if you already ran an earlier version of the schema, run
`supabase/update_photos_and_add_madhwal.sql` to backfill it.

Players with no `photo_url` show a yellow initial avatar automatically, so adding a new player
later without a photo yet is safe.

## Admin tasks (no admin panel in the app — use the Supabase dashboard/SQL editor)
- Deadline / open-close: `update competition_settings set deadline='...', submissions_open=true;`
- Players: insert/update/delete rows in `players` directly (table editor or SQL).
- After the official announcement: insert rows into `official_results` (player_id, decision),
  set `competition_settings.results_published=true`, then run `select recalculate_scores();`
  (safe to re-run any time).

Eligibility: toggle `players.is_active`. Khaleel Ahmed and Nathan Ellis (traded to SRH) are
seeded inactive.

## My Prediction page + share cards
- After submitting (and whenever a returning participant opens the site on the same browser) the app shows
  **My Prediction**, loaded live from Supabase via `get_my_prediction` + the `players` table. It is never
  rebuilt from the on-screen selection state. After results are published, ✓/✗ badges appear next to picks.
- **Share**: `src/lib/shareCard.js` draws the cards straight onto a canvas — 4:3 (1600×1200) and
  Instagram Story (1080×1920, content kept inside the safe areas). Download buttons, plus Web Share API on
  mobile with a download fallback.
- Player photos come from CSK's gallery. `vercel.json` (prod) and `vite.config.js` (dev) proxy them through
  `/cskimg/...` so the canvas can read them. If a photo can't load, an initial avatar is drawn instead.
- No database migration is needed for this feature.

## Deadline
Run `supabase/update_deadline_659pm.sql` once in the Supabase SQL editor to set the live deadline to
17 Nov 2026, 6:59 PM IST. (`schema.sql` is updated for fresh installs.)
