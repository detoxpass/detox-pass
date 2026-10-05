-- Foto da conta e exclusão pelo próprio usuário.
-- A foto fica no bucket público avatars, numa pasta com o id da pessoa.
-- A exclusão apaga o login. O perfil sai em cascata.

alter table public.profiles
  add column avatar_path text;

comment on column public.profiles.avatar_path is
  'Caminho no bucket avatars. Não guarda segredo.';

grant update (avatar_path) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_public_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'avatars');

create policy avatars_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create or replace function private.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;

  delete from storage.objects
  where bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text;

  delete from auth.users
  where id = (select auth.uid());
end;
$$;

revoke all on function private.delete_own_account() from public, anon, authenticated;
grant execute on function private.delete_own_account() to authenticated, service_role;

create or replace function public.delete_own_account()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.delete_own_account();
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated, service_role;
