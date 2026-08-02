-- PR Portfolio — Phase 1 auth migration
--
-- Turns tile_data/tiles from "one open table, no login" into real per-user
-- data. Run each stage in order, in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → paste → Run). Do NOT run Stage B until you've
-- confirmed Stage A + the backfill worked and the app works signed in —
-- Stage B is the point where the old open access actually goes away.
--
-- Why a composite primary key: both tables are currently keyed by a single
-- text column (tile_id / slot) with no user column at all — several write
-- paths (the profile sync, Spotify token storage, the MCP connector's tile
-- store) use a single fixed key string like 'profile' or 'spotify_auth',
-- assuming there's only ever one row. Two different users signing up would
-- collide on that same string. Changing the primary key to (user_id, tile_id)
-- / (user_id, slot) lets the same key string exist once per user, safely.


-- ══════════════════════════════════════════════════════════════════════════
-- STAGE A — additive, safe to run any time. Adds the column and NEW
-- auth-scoped policies alongside the existing open ones. Nothing is locked
-- down yet: your app keeps working exactly as it does today.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.tile_data add column if not exists user_id uuid references auth.users(id);
alter table public.tiles     add column if not exists user_id uuid references auth.users(id);

create index if not exists tile_data_user_id_idx on public.tile_data (user_id);
create index if not exists tiles_user_id_idx     on public.tiles (user_id);

drop policy if exists "tile_data owner" on public.tile_data;
create policy "tile_data owner" on public.tile_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "tiles owner" on public.tiles;
create policy "tiles owner" on public.tiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Postgres RLS policies are OR'd together (permissive by default), so the
-- pre-existing "... open" policies (using (true)) still let anyone through
-- right now. That's intentional until Stage B — it means today's app keeps
-- working unmodified while you sign up and backfill below.


-- ══════════════════════════════════════════════════════════════════════════
-- SIGN UP, THEN FIND YOUR ACCOUNT ID
-- ══════════════════════════════════════════════════════════════════════════
-- 1. Deploy the code from this phase, open /login, create your account.
-- 2. Run this to find your new user id:
--
--      select id, email from auth.users order by created_at desc limit 5;
--
-- 3. Copy that id — you'll paste it into the backfill below AND set it as
--    the OWNER_USER_ID environment variable (Vercel + .env.local), so the
--    vitals-ingest and MCP-connector routes know which account is "you".


-- ══════════════════════════════════════════════════════════════════════════
-- BACKFILL — run the dry-run SELECTs first. They cost nothing and change
-- nothing. Only run the UPDATEs once the counts look right (they should
-- equal "every row in the table" on a single-owner project — you're the
-- only user who has ever written to it).
-- ══════════════════════════════════════════════════════════════════════════

-- Dry run — replace 'YOUR-UUID-HERE' with the id from step 2 above, then run
-- just these two SELECTs to see how many rows are about to change:

-- select count(*) from public.tile_data where user_id is null;
-- select count(*) from public.tiles     where user_id is null;

-- Once those counts look right, run the actual backfill (again, replace
-- 'YOUR-UUID-HERE'):

-- update public.tile_data set user_id = 'YOUR-UUID-HERE' where user_id is null;
-- update public.tiles     set user_id = 'YOUR-UUID-HERE' where user_id is null;

-- Verify nothing was missed (should return 0 for both):

-- select count(*) from public.tile_data where user_id is null;
-- select count(*) from public.tiles     where user_id is null;


-- ══════════════════════════════════════════════════════════════════════════
-- STAGE B — DO NOT RUN until: Stage A is done, you've signed up, the
-- backfill above shows 0 remaining null user_id rows on both tables, AND
-- you've confirmed the app works normally signed in (Train/Velocity/Profile/
-- Mentor, Spotify if connected). This is the enforcement step — the open
-- "anyone" policies go away, and the primary key changes shape, for real.
-- ══════════════════════════════════════════════════════════════════════════

-- begin;
--
-- alter table public.tile_data alter column user_id set not null;
-- alter table public.tiles     alter column user_id set not null;
--
-- drop policy if exists "tile_data open" on public.tile_data;
-- drop policy if exists "tiles open"     on public.tiles;
--
-- alter table public.tile_data drop constraint if exists tile_data_pkey;
-- alter table public.tiles     drop constraint if exists tiles_pkey;
--
-- alter table public.tile_data add primary key (user_id, tile_id);
-- alter table public.tiles     add primary key (user_id, slot);
--
-- commit;

-- After Stage B: tile_data/tiles are real multi-tenant tables. A second
-- signup gets their own empty rows — no collision, no cross-account access
-- (RLS now only has the "owner" policy left on each table).
