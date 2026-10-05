-- Perfis cliente, profissional e operacao.
-- A coluna profiles.role é espelho. A policy lê public.current_app_role().

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('cliente', 'profissional', 'operacao')),
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Espelho de exibição. Autorização usa app_metadata, não esta coluna.';

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned text;
begin
  assigned := coalesce(new.raw_app_meta_data ->> 'role', 'cliente');
  if assigned not in ('cliente', 'profissional', 'operacao') then
    assigned := 'cliente';
  end if;

  if new.raw_app_meta_data ->> 'role' is distinct from assigned then
    update auth.users
    set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', assigned)
    where id = new.id;
  end if;

  insert into public.profiles (id, role)
  values (new.id, assigned)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
grant execute on function private.handle_new_user() to supabase_auth_admin, postgres, service_role;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function private.handle_new_user();

create or replace function private.protect_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and current_setting('private.allow_role_change', true) is distinct from 'on' then
    raise exception 'troca de papel só por private.set_app_role'
      using errcode = '42501';
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger profiles_protect_role
  before update on public.profiles
  for each row
  execute function private.protect_profile_role();

grant select on public.profiles to authenticated, service_role;
grant update (full_name) on public.profiles to authenticated;
grant update, insert, delete on public.profiles to service_role;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy profiles_select_operacao
  on public.profiles
  for select
  to authenticated
  using ((select public.current_app_role()) = 'operacao');

create policy profiles_update_own_name
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
