-- A operação lê a ficha que o cadastro já gravou.
-- Rebaixar a última conta de operação fica recusado na função.

create or replace function private.set_app_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_operators integer;
begin
  if p_role not in ('cliente', 'profissional', 'operacao') then
    raise exception 'papel inválido' using errcode = '22023';
  end if;

  if not (
    private.is_service()
    or public.current_app_role() = 'operacao'
  ) then
    raise exception 'só operação troca papel' using errcode = '42501';
  end if;

  if p_user_id = auth.uid() and p_role is distinct from 'operacao' then
    raise exception 'operação não remove o próprio papel por este comando' using errcode = '42501';
  end if;

  if p_role is distinct from 'operacao'
     and exists (
       select 1 from public.profiles
       where id = p_user_id and role = 'operacao'
     )
  then
    select count(*) into v_operators
    from public.profiles
    where role = 'operacao';
    if v_operators <= 1 then
      raise exception 'At least one operations account has to remain.' using errcode = '42501';
    end if;
  end if;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p_role)
  where id = p_user_id;

  if not found then
    raise exception 'usuário inexistente' using errcode = 'P0002';
  end if;

  perform set_config('private.allow_role_change', 'on', true);

  update public.profiles
  set role = p_role
  where id = p_user_id;

  if p_role = 'profissional' then
    select full_name into v_name from public.profiles where id = p_user_id;
    insert into public.professionals (profile_id, display_name, active)
    values (p_user_id, coalesce(v_name, 'Profissional'), false)
    on conflict (profile_id) do nothing;
  end if;
end;
$$;

create or replace function private.list_partner_applications()
returns table (
  profile_id uuid,
  email text,
  full_name text,
  professional_id uuid,
  birth_date date,
  gender text,
  phone text,
  bio text,
  address_line text,
  postal_code text,
  city_name text,
  region text,
  instagram text,
  specialty_note text,
  coverage_note text,
  terms_accepted_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_app_role() is distinct from 'operacao' and not private.is_service() then
    raise exception 'Only operations can read partner applications.' using errcode = '42501';
  end if;

  return query
  select
    application.profile_id,
    users.email::text,
    profile.full_name,
    person.id,
    application.birth_date,
    application.gender,
    application.phone,
    application.bio,
    application.address_line,
    application.postal_code,
    application.city_name,
    application.region,
    application.instagram,
    application.specialty_note,
    application.coverage_note,
    application.terms_accepted_at,
    application.created_at
  from private.partner_applications application
  join public.profiles profile on profile.id = application.profile_id
  join auth.users users on users.id = application.profile_id
  left join public.professionals person on person.profile_id = application.profile_id
  order by application.created_at desc;
end;
$$;

create or replace function public.list_partner_applications()
returns table (
  profile_id uuid,
  email text,
  full_name text,
  professional_id uuid,
  birth_date date,
  gender text,
  phone text,
  bio text,
  address_line text,
  postal_code text,
  city_name text,
  region text,
  instagram text,
  specialty_note text,
  coverage_note text,
  terms_accepted_at timestamptz,
  created_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query select * from private.list_partner_applications();
end;
$$;

revoke all on function public.list_partner_applications() from public, anon;
revoke all on function private.list_partner_applications() from public, anon, authenticated;
grant execute on function private.list_partner_applications() to authenticated, service_role;
grant execute on function public.list_partner_applications() to authenticated, service_role;
