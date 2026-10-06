-- Cadastro público de parceiro. A ficha nasce inativa.
-- Preço, serviço e cidade do catálogo continuam com a operação.

create table private.partner_applications (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  birth_date date not null,
  gender text,
  phone text not null,
  bio text not null,
  address_line text not null,
  postal_code text not null,
  city_name text not null,
  region text not null,
  instagram text,
  specialty_note text not null,
  coverage_note text not null,
  terms_accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint partner_applications_gender_check
    check (gender is null or gender in ('female', 'male', 'prefer_not')),
  constraint partner_applications_birth_check
    check (birth_date <= (timezone('utc', now()))::date)
);

comment on table private.partner_applications is
  'Dados do cadastro de parceiro. Não publica a profissional e não define preço.';

revoke all on table private.partner_applications from public, anon, authenticated;
grant select, insert, update, delete on table private.partner_applications to service_role;

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

  if assigned = 'profissional' then
    insert into public.professionals (profile_id, display_name, active)
    values (new.id, 'Partner', false)
    on conflict (profile_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
grant execute on function private.handle_new_user() to supabase_auth_admin, postgres, service_role;

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
begin
  if not private.is_service() then
    raise exception 'cadastro de parceiro exige service_role' using errcode = '42501';
  end if;

  if p_gender is not null and p_gender not in ('female', 'male', 'prefer_not') then
    raise exception 'gênero inválido' using errcode = '22023';
  end if;

  update public.profiles
  set full_name = p_full_name
  where id = p_profile_id
    and role = 'profissional';

  if not found then
    raise exception 'perfil profissional inexistente' using errcode = 'P0002';
  end if;

  update public.professionals
  set display_name = p_full_name,
      updated_at = now()
  where profile_id = p_profile_id
    and active = false;

  if not found then
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
    now()
  );
end;
$$;

revoke all on function private.save_partner_application(
  uuid, text, date, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function private.save_partner_application(
  uuid, text, date, text, text, text, text, text, text, text, text, text, text
) to service_role;

create or replace function public.save_partner_application(
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
security invoker
set search_path = ''
as $$
begin
  perform private.save_partner_application(
    p_profile_id,
    p_full_name,
    p_birth_date,
    p_gender,
    p_phone,
    p_bio,
    p_address_line,
    p_postal_code,
    p_city_name,
    p_region,
    p_instagram,
    p_specialty_note,
    p_coverage_note
  );
end;
$$;

revoke all on function public.save_partner_application(
  uuid, text, date, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.save_partner_application(
  uuid, text, date, text, text, text, text, text, text, text, text, text, text
) to service_role;
