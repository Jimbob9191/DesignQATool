-- Custom SQL migration file, put your code below! --

-- Private bucket for design uploads and captures. Object paths are
-- `${teamId}/${assetId}.${ext}`, so RLS can scope by the leading path
-- segment via storage.foldername(). Our Server Actions actually create/read
-- objects with the service_role client (bypasses RLS, authorized in app
-- code — same pattern as every other table), but these policies are the
-- real boundary for anything hitting Storage directly as "authenticated".
insert into storage.buckets (id, name, public, file_size_limit)
values ('assets', 'assets', false, 26214400)
on conflict (id) do nothing;

create policy "assets_bucket_select_team_member"
on storage.objects for select
to authenticated
using (
  bucket_id = 'assets'
  and public.current_team_role((storage.foldername(name))[1]::uuid) is not null
);

create policy "assets_bucket_insert_non_viewer"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'assets'
  and public.current_team_role((storage.foldername(name))[1]::uuid) in ('owner', 'admin', 'member')
);

create policy "assets_bucket_update_non_viewer"
on storage.objects for update
to authenticated
using (
  bucket_id = 'assets'
  and public.current_team_role((storage.foldername(name))[1]::uuid) in ('owner', 'admin', 'member')
);

create policy "assets_bucket_delete_non_viewer"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'assets'
  and public.current_team_role((storage.foldername(name))[1]::uuid) in ('owner', 'admin', 'member')
);
