-- Phase 4 — evidence upload pipeline. Creates a private Storage bucket for
-- PR evidence (photos/videos) and locks it down so each signed-in user can
-- only read/write/delete objects under their own `${user_id}/...` folder —
-- the same per-user isolation pattern auth_migration.sql already applies to
-- tile_data/tiles. The service-role client (already used by app/p/[userId]
-- for the public profile) bypasses these policies on purpose, the same way
-- it already bypasses tile_data's RLS, so a public/shared profile can still
-- show someone else's evidence once Phase 4's visibility check has already
-- authorized the visitor.
--
-- Safe to run once; every statement is idempotent (on conflict / if not
-- exists), same as auth_migration.sql.

insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

drop policy if exists "evidence insert own" on storage.objects;
create policy "evidence insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "evidence select own" on storage.objects;
create policy "evidence select own" on storage.objects
  for select to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "evidence delete own" on storage.objects;
create policy "evidence delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
