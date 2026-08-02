# Phase 1 — manual two-account verification

The automated tests in `test/` prove every code path stamps/filters the real
`user_id` it was given (no path silently falls back to a shared or blank
key). They run against a fake in-memory client — they can't prove Postgres
itself refuses a cross-account read, because that enforcement lives in RLS
policies on your live Supabase project, not in this repo's code. This
checklist is the real proof; do it once after Stage B of
`supabase/auth_migration.sql`.

## Setup

1. Run Stage A + the backfill in `supabase/auth_migration.sql`, sign up as
   yourself, confirm the app works normally.
2. Run Stage B (drops the old open policies, converts the primary keys).
3. Create a **second** account — a throwaway email works (`+test` alias, or
   a free temp-mail address). This is "User B".

## Checklist

Do each of these as **User B**, signed in normally through the app (not via
SQL) unless noted:

- [ ] Board loads with **zero data** — no PRs, no workouts, no profile. Seeing
      any of the founder's real data here is the isolation test failing.
- [ ] Log a workout in Train, refresh — it saves and reloads for User B only.
- [ ] Open `/profile` — starts blank, edits save, and don't leak to User A's
      profile on next load.
- [ ] Open `/mentor` — "noticed" feed and goals are B's own, not shared.
- [ ] If Spotify is connected: User B's "Connect Spotify" must NOT show the
      founder's account as already connected.
- [ ] Sign out, sign back in as the **founder** — all original data is
      intact, unaffected by User B's session.

Then, as a direct API/SQL check (not through the app UI):

- [ ] In the Supabase SQL editor, `select * from tile_data;` as the
      **service role** shows rows for both users, each correctly tagged with
      its own `user_id` — no row has a null or shared `user_id`.
- [ ] Using User B's own anon-key session (e.g. via `supabase.auth.signInWithPassword`
      in a scratch script, then querying `tile_data`), confirm the query
      returns **only** User B's rows — the founder's rows are invisible, not
      just hidden by the UI.
- [ ] Attempt to fetch a known founder tile_id directly as User B (e.g.
      `.eq('tile_id', '<founder-uuid>:train')` with User B's session) —
      expect an empty result, not an error and not the data.

If any box fails, treat it as a Stage B blocker: don't consider Phase 1 done
until every one of these passes for real, on your actual Supabase project.
