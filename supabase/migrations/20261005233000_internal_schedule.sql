-- Agenda interna por profissional. Externa continua com o token daquela ficha.
-- Profissional sem modo definido não oferece horário, salvo ficha antiga que
-- já tem conexão: essa segue o provedor da conexão.

alter table public.professionals
  add column schedule_mode text,
  add column schedule_prompt_dismissed boolean not null default false,
  add column schedule_timezone text not null default 'America/New_York',
  add column slot_minutes smallint not null default 60;

alter table public.professionals
  add constraint professionals_schedule_mode_check
    check (schedule_mode is null or schedule_mode in ('internal', 'external')),
  add constraint professionals_schedule_timezone_check
    check (schedule_timezone in (
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Sao_Paulo'
    )),
  add constraint professionals_slot_minutes_check
    check (slot_minutes in (30, 45, 60, 90, 120));

create table public.professional_hours (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 1 and 1440),
  check (end_minute > start_minute)
);

create index professional_hours_professional_idx
  on public.professional_hours (professional_id, weekday);

create table public.professional_blocks (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);

create index professional_blocks_professional_idx
  on public.professional_blocks (professional_id, starts_at);

alter table public.bookings
  add column ends_at timestamptz;

update public.bookings
set ends_at = starts_at + interval '60 minutes'
where ends_at is null;

alter table public.bookings
  alter column ends_at set not null;

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'bookings'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%provider%'
  loop
    execute format('alter table public.bookings drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.bookings
  add constraint bookings_provider_check
    check (provider in ('internal', 'acuity', 'square', 'wix', 'zenoti', 'mindbody'));

create extension if not exists btree_gist with schema extensions;

alter table public.bookings
  add constraint bookings_internal_overlap_excl
  exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (
    provider = 'internal'
    and saga_status in (
      'intent',
      'provider_confirmed',
      'charge_created',
      'paid',
      'compensation_required',
      'payout_released'
    )
  );

create or replace function private.reject_block_over_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.bookings k
    where k.professional_id = new.professional_id
      and k.saga_status in (
        'intent',
        'provider_confirmed',
        'charge_created',
        'paid',
        'compensation_required',
        'payout_released'
      )
      and tstzrange(k.starts_at, k.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'há reserva nesse intervalo' using errcode = '23505';
  end if;
  return new;
end;
$$;

create trigger professional_blocks_no_booking
  before insert or update on public.professional_blocks
  for each row execute function private.reject_block_over_booking();

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
begin
  select schedule_mode, schedule_timezone, slot_minutes
    into v_mode, v_tz, v_slot
  from public.professionals
  where id = p_professional_id;

  if v_mode is distinct from 'internal' or v_slot is null or v_tz is null then
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
        'intent',
        'provider_confirmed',
        'charge_created',
        'paid',
        'compensation_required',
        'payout_released'
      )
      and (p_ignore is null or k.id <> p_ignore)
      and tstzrange(k.starts_at, k.ends_at, '[)') && tstzrange(p_starts_at, v_end, '[)')
  ) then
    return false;
  end if;

  return true;
end;
$$;

create or replace function private.open_booking_intent(
  p_client_id uuid,
  p_professional_id uuid,
  p_service_id uuid,
  p_city_id uuid,
  p_starts_at timestamptz
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

  if v_mode = 'internal' then
    if not private.internal_slot_open(p_professional_id, p_starts_at, null) then
      raise exception 'horário não está aberto na agenda interna' using errcode = '22023';
    end if;
    v_provider := 'internal';
    v_ends := p_starts_at + make_interval(mins => v_slot);
  else
    select provider into v_provider
    from public.schedule_connections
    where professional_id = p_professional_id
    order by created_at
    limit 1;

    if v_mode = 'external' and v_provider is null then
      raise exception 'profissional sem agenda de origem' using errcode = '22023';
    end if;

    if v_mode is null and v_provider is null then
      raise exception 'profissional sem agenda definida' using errcode = '22023';
    end if;

    if v_provider is null then
      raise exception 'profissional sem agenda de origem' using errcode = '22023';
    end if;

    v_ends := p_starts_at + interval '60 minutes';
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

create or replace function private.mark_rescheduled(
  p_booking_id uuid,
  p_starts_at timestamptz,
  p_origin text default 'platform'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_previous timestamptz;
  v_provider text;
  v_professional uuid;
  v_span interval;
begin
  if not private.is_service() then
    raise exception 'reagendar exige service_role' using errcode = '42501';
  end if;

  if p_starts_at is null then
    raise exception 'horário novo obrigatório' using errcode = '22023';
  end if;

  if p_origin is null or p_origin not in ('platform', 'acuity') then
    raise exception 'origem inválida' using errcode = '22023';
  end if;

  select saga_status, starts_at, provider, professional_id, ends_at - starts_at
    into v_status, v_previous, v_provider, v_professional, v_span
  from public.bookings
  where id = p_booking_id
  for update;

  if v_status is null then
    raise exception 'reserva inexistente' using errcode = 'P0002';
  end if;

  if v_status in ('cancelled', 'compensated', 'compensation_required') then
    raise exception 'reserva encerrada não reagenda' using errcode = '22023';
  end if;

  if v_previous = p_starts_at then
    return;
  end if;

  if v_provider = 'internal' and not private.internal_slot_open(v_professional, p_starts_at, p_booking_id) then
    raise exception 'horário não está aberto na agenda interna' using errcode = '22023';
  end if;

  begin
    update public.bookings
    set starts_at = p_starts_at,
        ends_at = p_starts_at + v_span,
        updated_at = pg_catalog.now()
    where id = p_booking_id;
  exception
    when unique_violation or exclusion_violation then
      raise exception 'horário já tem reserva em andamento' using errcode = '23505';
  end;

  insert into public.booking_events (
    booking_id, event_type, from_status, to_status, from_starts_at, to_starts_at, origin
  ) values (
    p_booking_id, 'rescheduled', v_status, v_status, v_previous, p_starts_at, p_origin
  );
end;
$$;

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
end;
$$;

create or replace function private.set_my_schedule_grid(
  p_timezone text,
  p_slot_minutes int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'sessão obrigatória' using errcode = '42501';
  end if;

  if p_timezone not in (
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Sao_Paulo'
  ) then
    raise exception 'fuso inválido' using errcode = '22023';
  end if;

  if p_slot_minutes not in (30, 45, 60, 90, 120) then
    raise exception 'duração inválida' using errcode = '22023';
  end if;

  update public.professionals
  set schedule_timezone = p_timezone,
      slot_minutes = p_slot_minutes,
      updated_at = pg_catalog.now()
  where profile_id = (select auth.uid());

  if not found then
    raise exception 'só a profissional define a própria agenda' using errcode = '42501';
  end if;
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
begin
  select schedule_mode, schedule_timezone, slot_minutes, active
    into v_mode, v_tz, v_slot, v_active
  from public.professionals
  where id = p_professional_id;

  if v_mode is distinct from 'internal' or not coalesce(v_active, false) then
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

create or replace function private.internal_dates(
  p_professional_id uuid,
  p_month text
)
returns setof date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start date;
  v_cursor date;
  v_end date;
begin
  if p_month !~ '^\d{4}-\d{2}$' then
    raise exception 'mês YYYY-MM obrigatório' using errcode = '22023';
  end if;

  v_start := (p_month || '-01')::date;
  v_end := (v_start + interval '1 month' - interval '1 day')::date;
  v_cursor := v_start;

  while v_cursor <= v_end loop
    if exists (
      select 1 from private.internal_openings(p_professional_id, v_cursor)
    ) then
      return next v_cursor;
    end if;
    v_cursor := v_cursor + 1;
  end loop;
end;
$$;

create or replace function public.set_my_schedule_choice(p_mode text, p_dismiss boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.set_my_schedule_choice(p_mode, p_dismiss);
end;
$$;

create or replace function public.set_my_schedule_grid(p_timezone text, p_slot_minutes int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.set_my_schedule_grid(p_timezone, p_slot_minutes);
end;
$$;

create or replace function public.internal_openings(p_professional_id uuid, p_day date)
returns table (starts_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query select o.starts_at from private.internal_openings(p_professional_id, p_day) o;
end;
$$;

create or replace function public.internal_dates(p_professional_id uuid, p_month text)
returns setof date
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query select * from private.internal_dates(p_professional_id, p_month);
end;
$$;

alter table public.professional_hours enable row level security;
alter table public.professional_hours force row level security;
alter table public.professional_blocks enable row level security;
alter table public.professional_blocks force row level security;

grant select, insert, update, delete on public.professional_hours to authenticated;
grant select, insert, update, delete on public.professional_blocks to authenticated;
grant select, insert, update, delete on public.professional_hours to service_role;
grant select, insert, update, delete on public.professional_blocks to service_role;

create policy professional_hours_write_own
  on public.professional_hours for all to authenticated
  using (
    exists (
      select 1 from public.professionals p
      where p.id = professional_id
        and (
          p.profile_id = (select auth.uid())
          or (select public.current_app_role()) = 'operacao'
        )
    )
  )
  with check (
    exists (
      select 1 from public.professionals p
      where p.id = professional_id
        and (
          p.profile_id = (select auth.uid())
          or (select public.current_app_role()) = 'operacao'
        )
    )
  );

create policy professional_blocks_write_own
  on public.professional_blocks for all to authenticated
  using (
    exists (
      select 1 from public.professionals p
      where p.id = professional_id
        and (
          p.profile_id = (select auth.uid())
          or (select public.current_app_role()) = 'operacao'
        )
    )
  )
  with check (
    exists (
      select 1 from public.professionals p
      where p.id = professional_id
        and (
          p.profile_id = (select auth.uid())
          or (select public.current_app_role()) = 'operacao'
        )
    )
  );

revoke all on function private.internal_slot_open(uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function private.internal_openings(uuid, date) from public, anon, authenticated;
revoke all on function private.internal_dates(uuid, text) from public, anon, authenticated;
revoke all on function private.set_my_schedule_choice(text, boolean) from public, anon, authenticated;
revoke all on function private.set_my_schedule_grid(text, int) from public, anon, authenticated;
revoke all on function private.reject_block_over_booking() from public, anon, authenticated;

grant execute on function private.internal_slot_open(uuid, timestamptz, uuid) to postgres, service_role;
grant execute on function private.internal_openings(uuid, date) to postgres, service_role;
grant execute on function private.internal_dates(uuid, text) to postgres, service_role;
grant execute on function private.set_my_schedule_choice(text, boolean) to postgres, service_role;
grant execute on function private.set_my_schedule_grid(text, int) to postgres, service_role;

revoke all on function public.set_my_schedule_choice(text, boolean) from public, anon;
revoke all on function public.set_my_schedule_grid(text, int) from public, anon;
revoke all on function public.internal_openings(uuid, date) from public, anon, authenticated;
revoke all on function public.internal_dates(uuid, text) from public, anon, authenticated;

grant execute on function public.set_my_schedule_choice(text, boolean) to authenticated, service_role;
grant execute on function public.set_my_schedule_grid(text, int) to authenticated, service_role;
grant execute on function public.internal_openings(uuid, date) to service_role;
grant execute on function public.internal_dates(uuid, text) to service_role;
