-- Fundação portátil. Sem segredo, sem project ref, sem usuário fixo.
-- O schema private não entra em [api].schemas. Função privilegiada mora aqui.
-- public.current_app_role() só lê app_metadata. user_metadata não autoriza.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

grant usage on schema private to postgres, service_role;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema private
  revoke all on tables from public, anon, authenticated;

create or replace function public.current_app_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
$$;

comment on function public.current_app_role() is
  'Papel do JWT (app_metadata.role). Não lê user_metadata.';

revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to anon, authenticated, service_role;

create or replace function private.is_break_glass()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('request.jwt.claims', true), '') = ''
     and session_user in ('postgres', 'supabase_admin');
$$;

create or replace function private.is_service()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or private.is_break_glass();
$$;

revoke all on function private.is_break_glass() from public, anon, authenticated;
revoke all on function private.is_service() from public, anon, authenticated;
grant execute on function private.is_break_glass() to postgres, service_role;
grant execute on function private.is_service() to postgres, service_role;
