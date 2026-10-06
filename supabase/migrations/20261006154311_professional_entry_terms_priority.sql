-- Entrada da profissional por passos com data, termos versionados
-- e ordem de prioridade das agendas. A conta não ganha status onboarding.

alter table public.professionals
  add column bio text;

comment on column public.professionals.bio is
  'Texto da ficha escrito pela profissional. O preço do serviço não mora aqui.';

update public.professionals as person
set bio = application.bio
from private.partner_applications as application
where application.profile_id = person.profile_id
  and person.bio is null;

create table public.terms_versions (
  id uuid primary key default gen_random_uuid(),
  version_number integer,
  title text not null,
  body text not null,
  content_sha256 text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint terms_versions_published_check check (
    status = 'draft'
    or (
      version_number is not null
      and content_sha256 is not null
      and published_at is not null
      and published_by is not null
    )
  )
);

create unique index terms_versions_number_idx
  on public.terms_versions (version_number)
  where version_number is not null;

create unique index terms_versions_one_draft_idx
  on public.terms_versions (status)
  where status = 'draft';

comment on table public.terms_versions is
  'Versão publicada é imutável. Correção é outra versão. O hash é SHA-256 do título, uma quebra de linha e o corpo, em UTF-8.';

create table public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  terms_version_id uuid not null references public.terms_versions (id),
  version_number integer not null,
  content_sha256 text not null,
  accepted_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id),
  professional_id uuid not null references public.professionals (id),
  email text not null,
  display_name text not null,
  surface text not null check (surface in ('partner_signup', 'onboarding', 'reacceptance')),
  ip inet not null,
  user_agent text not null,
  locale text not null,
  scrolled_to_end boolean not null,
  checkbox_confirmed boolean not null,
  unique (user_id, terms_version_id),
  constraint terms_acceptances_scrolled_check check (scrolled_to_end),
  constraint terms_acceptances_checkbox_check check (checkbox_confirmed)
);

create index terms_acceptances_version_idx
  on public.terms_acceptances (terms_version_id, accepted_at desc);

comment on table public.terms_acceptances is
  'Uma linha por usuária e versão. A data é a do servidor. Não guarda localização nem impressão do aparelho.';

create table public.professional_steps (
  professional_id uuid not null references public.professionals (id) on delete cascade,
  step text not null check (step in ('profile', 'calendar')),
  completed_at timestamptz not null default now(),
  primary key (professional_id, step)
);

comment on table public.professional_steps is
  'Perfil e agenda. O aceite dos termos não mora aqui: ele é a versão vigente em terms_acceptances.';

create table public.calendar_order (
  professional_id uuid not null references public.professionals (id) on delete cascade,
  calendar_key text not null check (calendar_key in ('internal', 'acuity', 'square', 'wix', 'zenoti', 'mindbody')),
  position integer not null check (position >= 1),
  primary key (professional_id, calendar_key),
  unique (professional_id, position)
);

comment on table public.calendar_order is
  'Prioridade da reserva. A posição 1 ganha quando o mesmo horário está livre em mais de uma agenda.';

insert into public.calendar_order (professional_id, calendar_key, position)
select id, 'internal', 1
from public.professionals
where schedule_mode = 'internal'
on conflict do nothing;

insert into public.calendar_order (professional_id, calendar_key, position)
select connection.professional_id,
       connection.provider,
       case
         when exists (
           select 1
           from public.calendar_order existing
           where existing.professional_id = connection.professional_id
         ) then 2
         else 1
       end
from public.schedule_connections as connection
where connection.is_source
on conflict do nothing;

alter table public.terms_versions enable row level security;
alter table public.terms_versions force row level security;
alter table public.terms_acceptances enable row level security;
alter table public.terms_acceptances force row level security;
alter table public.professional_steps enable row level security;
alter table public.professional_steps force row level security;
alter table public.calendar_order enable row level security;
alter table public.calendar_order force row level security;

grant select on public.terms_versions to anon, authenticated, service_role;
grant select on public.terms_acceptances to authenticated, service_role;
grant select on public.professional_steps to authenticated, service_role;
grant select on public.calendar_order to authenticated, service_role;
grant insert, update, delete on public.terms_versions to service_role;
grant insert, update, delete on public.terms_acceptances to service_role;
grant insert, update, delete on public.professional_steps to service_role;
grant insert, update, delete on public.calendar_order to service_role;

create policy terms_versions_read
  on public.terms_versions
  for select
  to anon, authenticated
  using (
    status = 'published'
    or (select public.current_app_role()) = 'operacao'
  );

create policy terms_acceptances_read
  on public.terms_acceptances
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.current_app_role()) = 'operacao'
  );

create policy professional_steps_read
  on public.professional_steps
  for select
  to authenticated
  using (
    (select public.current_app_role()) = 'operacao'
    or exists (
      select 1
      from public.professionals person
      where person.id = professional_id
        and person.profile_id = (select auth.uid())
    )
  );

create policy calendar_order_read
  on public.calendar_order
  for select
  to authenticated
  using (
    (select public.current_app_role()) = 'operacao'
    or exists (
      select 1
      from public.professionals person
      where person.id = professional_id
        and (
          person.profile_id = (select auth.uid())
          or person.active
        )
    )
  );

create extension if not exists pgcrypto with schema extensions;

create or replace function private.terms_hash(p_title text, p_body text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(
    extensions.digest(convert_to(p_title || chr(10) || p_body, 'UTF8'), 'sha256'),
    'hex'
  )
$$;

revoke all on function private.terms_hash(text, text) from public, anon, authenticated;
grant execute on function private.terms_hash(text, text) to postgres, service_role;

create or replace function private.note_calendar(p_professional_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next integer;
begin
  if p_key not in ('internal', 'acuity', 'square', 'wix', 'zenoti', 'mindbody') then
    return;
  end if;
  if exists (
    select 1 from public.calendar_order
    where professional_id = p_professional_id and calendar_key = p_key
  ) then
    return;
  end if;
  select coalesce(max(position), 0) + 1
    into v_next
  from public.calendar_order
  where professional_id = p_professional_id;
  insert into public.calendar_order (professional_id, calendar_key, position)
  values (p_professional_id, p_key, v_next);
end;
$$;

revoke all on function private.note_calendar(uuid, text) from public, anon, authenticated;
grant execute on function private.note_calendar(uuid, text) to postgres, service_role;

create or replace function private.note_internal_calendar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.note_calendar(new.professional_id, 'internal');
  return new;
end;
$$;

create trigger professional_hours_note_calendar
  after insert on public.professional_hours
  for each row execute function private.note_internal_calendar();

create or replace function private.note_external_calendar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('tested', 'homologated') and new.external_resource_id is not null then
    perform private.note_calendar(new.professional_id, new.provider);
  end if;
  return new;
end;
$$;

create trigger schedule_connections_note_calendar
  after insert or update of status, external_resource_id on public.schedule_connections
  for each row execute function private.note_external_calendar();

create or replace function private.set_my_schedule_choice(
  p_mode text,
  p_dismiss boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'sessão obrigatória' using errcode = '42501';
  end if;

  if p_mode is not null and p_mode not in ('internal', 'external') then
    raise exception 'modo de agenda inválido' using errcode = '22023';
  end if;

  if p_mode is null and coalesce(p_dismiss, false) = false then
    raise exception 'escolha uma agenda ou peça para não mostrar de novo' using errcode = '22023';
  end if;

  select id into v_id
  from public.professionals
  where profile_id = (select auth.uid());

  if v_id is null then
    raise exception 'só a profissional define a própria agenda' using errcode = '42501';
  end if;

  update public.professionals
  set schedule_mode = coalesce(p_mode, schedule_mode),
      schedule_prompt_dismissed = (p_mode is not null) or coalesce(p_dismiss, false) or schedule_prompt_dismissed,
      updated_at = pg_catalog.now()
  where id = v_id;

  if p_mode = 'internal' then
    perform private.note_calendar(v_id, 'internal');
  end if;
end;
$$;

create or replace function public.entry_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_person public.professionals;
  v_avatar text;
  v_profile_at timestamptz;
  v_calendar_at timestamptz;
  v_version_id uuid;
  v_accepted boolean;
  v_step text;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if (select public.current_app_role()) is distinct from 'profissional' then
    return jsonb_build_object('applies', false);
  end if;

  select * into v_person
  from public.professionals
  where profile_id = (select auth.uid());

  if not found then
    return jsonb_build_object('applies', true, 'step', 'profile');
  end if;

  select avatar_path into v_avatar
  from public.profiles
  where id = (select auth.uid());

  select completed_at into v_profile_at
  from public.professional_steps
  where professional_id = v_person.id and step = 'profile';

  select completed_at into v_calendar_at
  from public.professional_steps
  where professional_id = v_person.id and step = 'calendar';

  select id into v_version_id
  from public.terms_versions
  where status = 'published'
  order by version_number desc
  limit 1;

  v_accepted := v_version_id is not null and exists (
    select 1 from public.terms_acceptances
    where user_id = (select auth.uid())
      and terms_version_id = v_version_id
  );

  if v_profile_at is null then
    v_step := 'profile';
  elsif v_calendar_at is null then
    v_step := 'calendar';
  elsif not v_accepted then
    v_step := 'terms';
  else
    v_step := null;
  end if;

  return jsonb_build_object(
    'applies', true,
    'step', v_step,
    'professional_id', v_person.id,
    'display_name', v_person.display_name,
    'bio', v_person.bio,
    'portrait_path', v_person.portrait_path,
    'avatar_path', v_avatar,
    'service_ids', coalesce((
      select jsonb_agg(service_id)
      from public.professional_services
      where professional_id = v_person.id
    ), '[]'::jsonb),
    'city_ids', coalesce((
      select jsonb_agg(city_id)
      from public.professional_cities
      where professional_id = v_person.id
    ), '[]'::jsonb),
    'calendars', coalesce((
      select jsonb_agg(jsonb_build_object('key', calendar_key, 'position', position) order by position)
      from public.calendar_order
      where professional_id = v_person.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.entry_state() from public, anon;
grant execute on function public.entry_state() to authenticated, service_role;

create or replace function public.save_entry_profile(
  p_display_name text,
  p_bio text,
  p_portrait_path text,
  p_service_ids uuid[],
  p_city_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text;
  v_bio text;
  v_photo text;
begin
  if (select public.current_app_role()) is distinct from 'profissional' then
    raise exception 'Only a professional can save this profile.' using errcode = '42501';
  end if;

  select id into v_id
  from public.professionals
  where profile_id = (select auth.uid());
  if v_id is null then
    raise exception 'This account has no professional profile yet.' using errcode = '42501';
  end if;

  v_name := nullif(btrim(coalesce(p_display_name, '')), '');
  v_bio := nullif(btrim(coalesce(p_bio, '')), '');
  v_photo := nullif(btrim(coalesce(p_portrait_path, '')), '');

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Enter a display name.' using errcode = '22023';
  end if;
  if v_bio is null or char_length(v_bio) < 12 or char_length(v_bio) > 600 then
    raise exception 'Enter a bio of at least 12 characters.' using errcode = '22023';
  end if;
  if v_photo is null then
    raise exception 'Add a photo.' using errcode = '22023';
  end if;
  if p_service_ids is null or cardinality(p_service_ids) < 1 then
    raise exception 'Choose at least one service.' using errcode = '22023';
  end if;
  if p_city_ids is null or cardinality(p_city_ids) < 1 then
    raise exception 'Choose at least one city.' using errcode = '22023';
  end if;
  if (
    select count(*) from public.services where id = any(p_service_ids)
  ) <> cardinality(p_service_ids) then
    raise exception 'Choose a service from the catalog.' using errcode = '22023';
  end if;
  if (
    select count(*) from public.cities where id = any(p_city_ids)
  ) <> cardinality(p_city_ids) then
    raise exception 'Choose a city from the catalog.' using errcode = '22023';
  end if;

  update public.professionals
  set display_name = v_name,
      bio = v_bio,
      portrait_path = v_photo,
      updated_at = pg_catalog.now()
  where id = v_id;

  delete from public.professional_services where professional_id = v_id;
  insert into public.professional_services (professional_id, service_id)
  select v_id, service_id from unnest(p_service_ids) as service_id;

  delete from public.professional_cities where professional_id = v_id;
  insert into public.professional_cities (professional_id, city_id)
  select v_id, city_id from unnest(p_city_ids) as city_id;

  insert into public.professional_steps (professional_id, step)
  values (v_id, 'profile')
  on conflict (professional_id, step) do nothing;
end;
$$;

revoke all on function public.save_entry_profile(text, text, text, uuid[], uuid[]) from public, anon;
grant execute on function public.save_entry_profile(text, text, text, uuid[], uuid[]) to authenticated, service_role;

create or replace function public.complete_entry_calendar()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select public.current_app_role()) is distinct from 'profissional' then
    raise exception 'Only a professional can finish this step.' using errcode = '42501';
  end if;
  select id into v_id
  from public.professionals
  where profile_id = (select auth.uid());
  if v_id is null then
    raise exception 'This account has no professional profile yet.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.professional_hours where professional_id = v_id
  ) and not exists (
    select 1
    from public.schedule_connections
    where professional_id = v_id
      and status in ('tested', 'homologated')
      and external_resource_id is not null
  ) then
    raise exception 'Publish Detox Pass hours or finish connecting a calendar.' using errcode = '22023';
  end if;

  insert into public.professional_steps (professional_id, step)
  values (v_id, 'calendar')
  on conflict (professional_id, step) do nothing;
end;
$$;

revoke all on function public.complete_entry_calendar() from public, anon;
grant execute on function public.complete_entry_calendar() to authenticated, service_role;

create or replace function public.reorder_my_calendars(p_keys text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_current text[];
begin
  if (select public.current_app_role()) is distinct from 'profissional' then
    raise exception 'Only a professional can set calendar priority.' using errcode = '42501';
  end if;
  select id into v_id
  from public.professionals
  where profile_id = (select auth.uid());
  if v_id is null then
    raise exception 'This account has no professional profile yet.' using errcode = '42501';
  end if;

  select coalesce(array_agg(calendar_key order by calendar_key), '{}')
    into v_current
  from public.calendar_order
  where professional_id = v_id;

  if v_current <> coalesce((
    select array_agg(item order by item) from unnest(p_keys) as item
  ), '{}') or cardinality(p_keys) <> cardinality(v_current) then
    raise exception 'Set the priority using the calendars already connected.' using errcode = '22023';
  end if;

  update public.calendar_order
  set position = position + 1000
  where professional_id = v_id;

  update public.calendar_order as row
  set position = listed.ordinality::integer
  from unnest(p_keys) with ordinality as listed(calendar_key, ordinality)
  where row.professional_id = v_id
    and row.calendar_key = listed.calendar_key;
end;
$$;

revoke all on function public.reorder_my_calendars(text[]) from public, anon;
grant execute on function public.reorder_my_calendars(text[]) to authenticated, service_role;

create or replace function public.save_terms_draft(p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_title text;
  v_body text;
begin
  if (select public.current_app_role()) is distinct from 'operacao' then
    raise exception 'Only the operation can edit terms.' using errcode = '42501';
  end if;
  v_title := nullif(btrim(coalesce(p_title, '')), '');
  v_body := nullif(btrim(coalesce(p_body, '')), '');
  if v_title is null or char_length(v_title) > 120 then
    raise exception 'Enter a title.' using errcode = '22023';
  end if;
  if v_body is null or char_length(v_body) < 20 then
    raise exception 'Enter the terms text.' using errcode = '22023';
  end if;

  select id into v_id from public.terms_versions where status = 'draft';
  if v_id is null then
    insert into public.terms_versions (title, body, status)
    values (v_title, v_body, 'draft')
    returning id into v_id;
  else
    update public.terms_versions
    set title = v_title, body = v_body, updated_at = pg_catalog.now()
    where id = v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_terms_draft(text, text) from public, anon;
grant execute on function public.save_terms_draft(text, text) to authenticated, service_role;

create or replace function public.publish_terms()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.terms_versions;
  v_number integer;
begin
  if (select public.current_app_role()) is distinct from 'operacao' then
    raise exception 'Only the operation can publish terms.' using errcode = '42501';
  end if;
  select * into v_draft from public.terms_versions where status = 'draft';
  if not found then
    raise exception 'Save a draft before publishing.' using errcode = '22023';
  end if;
  select coalesce(max(version_number), 0) + 1 into v_number
  from public.terms_versions
  where status = 'published';

  update public.terms_versions
  set status = 'published',
      version_number = v_number,
      content_sha256 = private.terms_hash(title, body),
      published_at = pg_catalog.now(),
      published_by = (select auth.uid()),
      updated_at = pg_catalog.now()
  where id = v_draft.id;
  return v_draft.id;
end;
$$;

revoke all on function public.publish_terms() from public, anon;
grant execute on function public.publish_terms() to authenticated, service_role;

create or replace function private.protect_published_terms()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'published' then
    raise exception 'Published terms stay as published. A correction is a new version.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger terms_versions_protect
  before update on public.terms_versions
  for each row execute function private.protect_published_terms();

create or replace function public.record_terms_acceptance(
  p_user_id uuid,
  p_email text,
  p_content_sha256 text,
  p_ip text,
  p_user_agent text,
  p_locale text,
  p_scrolled_to_end boolean,
  p_checkbox_confirmed boolean,
  p_surface text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.terms_versions;
  v_person public.professionals;
  v_surface text;
  v_ip inet;
  v_id uuid;
begin
  if not private.is_service() then
    raise exception 'acceptance is recorded by the server' using errcode = '42501';
  end if;
  if p_scrolled_to_end is distinct from true or p_checkbox_confirmed is distinct from true then
    raise exception 'Scroll to the end and check the box.' using errcode = '22023';
  end if;
  if p_locale is distinct from 'en' then
    raise exception 'This terms screen is in English.' using errcode = '22023';
  end if;
  if p_content_sha256 is null or p_user_agent is null or btrim(p_user_agent) = '' or p_email is null then
    raise exception 'The acceptance is incomplete.' using errcode = '22023';
  end if;
  begin
    v_ip := btrim(p_ip)::inet;
  exception when others then
    raise exception 'The acceptance is missing a network address.' using errcode = '22023';
  end;

  select * into v_version
  from public.terms_versions
  where status = 'published'
  order by version_number desc
  limit 1;
  if not found then
    raise exception 'Terms are not published yet.' using errcode = '22023';
  end if;
  if v_version.content_sha256 is distinct from p_content_sha256 then
    raise exception 'The terms on screen are not the published version.' using errcode = '22023';
  end if;

  select * into v_person
  from public.professionals
  where profile_id = p_user_id;
  if not found then
    raise exception 'This account has no professional profile yet.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_user_id and role = 'profissional'
  ) then
    raise exception 'Only a professional accepts these terms.' using errcode = '42501';
  end if;

  if p_surface = 'partner_signup' then
    v_surface := 'partner_signup';
  elsif exists (
    select 1 from public.terms_acceptances
    where user_id = p_user_id and terms_version_id <> v_version.id
  ) then
    v_surface := 'reacceptance';
  else
    v_surface := 'onboarding';
  end if;

  insert into public.terms_acceptances (
    terms_version_id, version_number, content_sha256, user_id, professional_id,
    email, display_name, surface, ip, user_agent, locale, scrolled_to_end, checkbox_confirmed
  ) values (
    v_version.id, v_version.version_number, v_version.content_sha256, p_user_id, v_person.id,
    p_email, v_person.display_name, v_surface, v_ip, left(p_user_agent, 500), p_locale, true, true
  )
  on conflict (user_id, terms_version_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.terms_acceptances
    where user_id = p_user_id and terms_version_id = v_version.id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.record_terms_acceptance(uuid, text, text, text, text, text, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.record_terms_acceptance(uuid, text, text, text, text, text, boolean, boolean, text) to service_role;

create or replace function private.internal_slot_open(
  p_professional_id uuid,
  p_starts_at timestamptz,
  p_ignore uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_tz text;
  v_slot int;
  v_local timestamp;
  v_day date;
  v_minute int;
  v_end timestamptz;
  v_internal boolean;
begin
  select schedule_mode, schedule_timezone, slot_minutes
    into v_mode, v_tz, v_slot
  from public.professionals
  where id = p_professional_id;

  select exists (
    select 1 from public.calendar_order
    where professional_id = p_professional_id and calendar_key = 'internal'
  ) into v_internal;

  if (v_mode is distinct from 'internal' and not v_internal) or v_slot is null or v_tz is null then
    return false;
  end if;

  v_local := p_starts_at at time zone v_tz;
  v_day := v_local::date;
  v_minute := (extract(hour from v_local) * 60 + extract(minute from v_local))::int;

  if extract(second from v_local) <> 0 or v_minute % v_slot <> 0 then
    return false;
  end if;

  v_end := p_starts_at + make_interval(mins => v_slot);

  if not exists (
    select 1
    from public.professional_hours h
    where h.professional_id = p_professional_id
      and h.weekday = extract(isodow from v_day)::int
      and h.start_minute <= v_minute
      and h.end_minute >= v_minute + v_slot
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.professional_blocks b
    where b.professional_id = p_professional_id
      and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, v_end, '[)')
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.bookings k
    where k.professional_id = p_professional_id
      and k.saga_status in (
        'intent', 'provider_confirmed', 'charge_created', 'paid', 'compensation_required', 'payout_released'
      )
      and (p_ignore is null or k.id <> p_ignore)
      and tstzrange(k.starts_at, k.ends_at, '[)') && tstzrange(p_starts_at, v_end, '[)')
  ) then
    return false;
  end if;

  return true;
end;
$$;

create or replace function private.internal_openings(
  p_professional_id uuid,
  p_day date
)
returns table (starts_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_slot int;
  v_mode text;
  v_active boolean;
  v_today date;
  v_internal boolean;
begin
  select schedule_mode, schedule_timezone, slot_minutes, active
    into v_mode, v_tz, v_slot, v_active
  from public.professionals
  where id = p_professional_id;

  select exists (
    select 1 from public.calendar_order
    where professional_id = p_professional_id and calendar_key = 'internal'
  ) into v_internal;

  if not coalesce(v_active, false) then
    return;
  end if;
  if v_mode is distinct from 'internal' and not v_internal then
    return;
  end if;

  v_today := (pg_catalog.now() at time zone v_tz)::date;
  if p_day < v_today or p_day > v_today + 60 then
    return;
  end if;

  return query
  select slot.starts_at
  from public.professional_hours h
  cross join lateral generate_series(
    ((p_day::timestamp + make_interval(mins => h.start_minute)) at time zone v_tz),
    ((p_day::timestamp + make_interval(mins => h.end_minute - v_slot)) at time zone v_tz),
    make_interval(mins => v_slot)
  ) as slot(starts_at)
  where h.professional_id = p_professional_id
    and h.weekday = extract(isodow from p_day)::int
    and h.end_minute - h.start_minute >= v_slot
    and private.internal_slot_open(p_professional_id, slot.starts_at, null)
  order by slot.starts_at;
end;
$$;

create or replace function private.open_booking_intent(
  p_client_id uuid,
  p_professional_id uuid,
  p_service_id uuid,
  p_city_id uuid,
  p_starts_at timestamptz,
  p_provider text default null,
  p_duration_minutes integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_provider text;
  v_mode text;
  v_slot int;
  v_ends timestamptz;
  v_minutes integer;
  v_choice text;
begin
  if not private.is_service() then
    raise exception 'abrir reserva exige service_role' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_client_id and role = 'cliente'
  ) then
    raise exception 'cliente inválida' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.professionals p
    join public.professional_services ps on ps.professional_id = p.id
    join public.professional_cities pc on pc.professional_id = p.id
    where p.id = p_professional_id
      and p.active
      and ps.service_id = p_service_id
      and pc.city_id = p_city_id
  ) then
    raise exception 'profissional ativa não oferece este serviço nesta cidade' using errcode = '22023';
  end if;

  select schedule_mode, slot_minutes
    into v_mode, v_slot
  from public.professionals
  where id = p_professional_id;

  v_choice := coalesce(p_provider, case when v_mode = 'internal' then 'internal' else null end);

  if v_choice = 'internal' then
    if not private.internal_slot_open(p_professional_id, p_starts_at, null) then
      raise exception 'horário não está aberto na agenda interna' using errcode = '22023';
    end if;
    v_provider := 'internal';
    v_ends := p_starts_at + make_interval(mins => v_slot);
  else
    if p_provider is not null then
      select provider into v_provider
      from public.schedule_connections
      where professional_id = p_professional_id
        and provider = p_provider;
    elsif exists (
      select 1 from public.schedule_connections
      where professional_id = p_professional_id and is_source
    ) then
      select provider into v_provider
      from public.schedule_connections
      where professional_id = p_professional_id and is_source;
    else
      select provider into v_provider
      from public.schedule_connections
      where professional_id = p_professional_id
      order by created_at
      limit 1;
    end if;

    if v_provider is null then
      raise exception 'profissional sem agenda de origem' using errcode = '22023';
    end if;

    v_minutes := p_duration_minutes;
    if v_minutes is null then
      v_ends := p_starts_at + interval '60 minutes';
    elsif v_minutes < 5 or v_minutes > 480 then
      raise exception 'duração da reserva externa inválida' using errcode = '22023';
    else
      v_ends := p_starts_at + make_interval(mins => v_minutes);
    end if;
  end if;

  begin
    insert into public.bookings (
      client_id, professional_id, service_id, city_id, provider, saga_status, starts_at, ends_at
    ) values (
      p_client_id, p_professional_id, p_service_id, p_city_id, v_provider, 'intent', p_starts_at, v_ends
    )
    returning id into v_id;
  exception
    when unique_violation or exclusion_violation then
      raise exception 'horário já tem reserva em andamento' using errcode = '23505';
  end;

  perform private.record_booking_event(v_id, 'intent_opened', null, 'intent');
  return v_id;
end;
$$;
