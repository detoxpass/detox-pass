-- O gatilho de novo usuário pode gravar cliente antes do app_metadata.
-- Este comando, só com service_role, completa a ficha do parceiro.

create or replace function private.save_partner_application(
  p_profile_id uuid,
  p_full_name text,
  p_birth_date date,
  p_gender text,
  p_phone text,
  p_bio text,
  p_address_line text,
  p_postal_code text,
  p_city_name text,
  p_region text,
  p_instagram text,
  p_specialty_note text,
  p_coverage_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if not private.is_service() then
    raise exception 'cadastro de parceiro exige service_role' using errcode = '42501';
  end if;

  if p_gender is not null and p_gender not in ('female', 'male', 'prefer_not') then
    raise exception 'gênero inválido' using errcode = '22023';
  end if;

  select role into v_role
  from public.profiles
  where id = p_profile_id;

  if v_role is null then
    raise exception 'perfil profissional inexistente' using errcode = 'P0002';
  end if;

  if v_role = 'operacao' then
    raise exception 'operação não vira parceiro por este cadastro' using errcode = '42501';
  end if;

  if v_role is distinct from 'profissional' then
    update auth.users
    set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'profissional')
    where id = p_profile_id;

    perform set_config('private.allow_role_change', 'on', true);

    update public.profiles
    set role = 'profissional',
        full_name = p_full_name
    where id = p_profile_id;
  else
    update public.profiles
    set full_name = p_full_name
    where id = p_profile_id;
  end if;

  insert into public.professionals (profile_id, display_name, active)
  values (p_profile_id, p_full_name, false)
  on conflict (profile_id) do update
    set display_name = excluded.display_name,
        updated_at = pg_catalog.now()
    where public.professionals.active = false;

  if not exists (
    select 1
    from public.professionals
    where profile_id = p_profile_id
      and active = false
      and display_name = p_full_name
  ) then
    raise exception 'ficha profissional indisponível' using errcode = 'P0002';
  end if;

  insert into private.partner_applications (
    profile_id,
    birth_date,
    gender,
    phone,
    bio,
    address_line,
    postal_code,
    city_name,
    region,
    instagram,
    specialty_note,
    coverage_note,
    terms_accepted_at
  ) values (
    p_profile_id,
    p_birth_date,
    p_gender,
    p_phone,
    p_bio,
    p_address_line,
    p_postal_code,
    p_city_name,
    p_region,
    nullif(p_instagram, ''),
    p_specialty_note,
    p_coverage_note,
    pg_catalog.now()
  );
end;
$$;
