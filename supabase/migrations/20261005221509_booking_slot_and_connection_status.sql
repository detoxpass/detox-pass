-- Trava um horário enquanto a reserva ainda o segura.
-- A operação não promove a conexão para homologada por esta função.

create unique index bookings_slot_hold_uidx
  on public.bookings (professional_id, starts_at)
  where saga_status in (
    'intent',
    'provider_confirmed',
    'charge_created',
    'paid',
    'compensation_required',
    'payout_released'
  );

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

  select provider into v_provider
  from public.schedule_connections
  where professional_id = p_professional_id
  order by created_at
  limit 1;

  if v_provider is null then
    raise exception 'profissional sem agenda de origem' using errcode = '22023';
  end if;

  begin
    insert into public.bookings (
      client_id, professional_id, service_id, city_id, provider, saga_status, starts_at
    ) values (
      p_client_id, p_professional_id, p_service_id, p_city_id, v_provider, 'intent', p_starts_at
    )
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'horário já tem reserva em andamento' using errcode = '23505';
  end;

  perform private.record_booking_event(v_id, 'intent_opened', null, 'intent');
  return v_id;
end;
$$;

create or replace function private.mark_compensation_required(
  p_booking_id uuid,
  p_detail text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not private.is_service() then
    raise exception 'compensação exige service_role' using errcode = '42501';
  end if;

  select saga_status into v_status
  from public.bookings
  where id = p_booking_id
  for update;

  if v_status is null then
    raise exception 'reserva inexistente' using errcode = 'P0002';
  end if;

  if v_status = 'compensation_required' then
    return;
  end if;

  if v_status in ('cancelled', 'compensated', 'payout_released') then
    raise exception 'reserva encerrada não entra em compensação' using errcode = '22023';
  end if;

  update public.bookings
  set saga_status = 'compensation_required',
      updated_at = pg_catalog.now()
  where id = p_booking_id;

  insert into public.booking_events (booking_id, event_type, from_status, to_status, origin)
  values (p_booking_id, 'compensation_required', v_status, 'compensation_required', 'platform');
end;
$$;

drop function if exists private.mark_rescheduled(uuid, timestamptz);

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

  select saga_status, starts_at
    into v_status, v_previous
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

  update public.bookings
  set starts_at = p_starts_at,
      updated_at = pg_catalog.now()
  where id = p_booking_id;

  insert into public.booking_events (
    booking_id, event_type, from_status, to_status, from_starts_at, to_starts_at, origin
  ) values (
    p_booking_id, 'rescheduled', v_status, v_status, v_previous, p_starts_at, p_origin
  );
end;
$$;

create or replace function private.mark_connection_tested(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_service() then
    raise exception 'marcar teste exige service_role' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.schedule_connections where id = p_connection_id
  ) then
    raise exception 'conexão inexistente' using errcode = 'P0002';
  end if;

  update public.schedule_connections
  set status = 'tested'
  where id = p_connection_id
    and status is distinct from 'homologated';
end;
$$;

create or replace function private.list_accounts()
returns table (
  id uuid,
  email text,
  full_name text,
  role text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_app_role() is distinct from 'operacao' and not private.is_service() then
    raise exception 'só a operação lista contas' using errcode = '42501';
  end if;

  return query
  select u.id, u.email::text, p.full_name, p.role
  from auth.users u
  join public.profiles p on p.id = u.id
  order by u.email;
end;
$$;

create or replace function public.mark_compensation_required(p_booking_id uuid, p_detail text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.mark_compensation_required(p_booking_id, p_detail);
end;
$$;

drop function if exists public.mark_rescheduled(uuid, timestamptz);

create or replace function public.mark_rescheduled(
  p_booking_id uuid,
  p_starts_at timestamptz,
  p_origin text default 'platform'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.mark_rescheduled(p_booking_id, p_starts_at, p_origin);
end;
$$;

create or replace function public.mark_connection_tested(p_connection_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.mark_connection_tested(p_connection_id);
end;
$$;

create or replace function public.list_accounts()
returns table (
  id uuid,
  email text,
  full_name text,
  role text
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query select * from private.list_accounts();
end;
$$;

revoke all on function private.mark_compensation_required(uuid, text) from public, anon, authenticated;
revoke all on function private.mark_rescheduled(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function private.mark_connection_tested(uuid) from public, anon, authenticated;
revoke all on function private.list_accounts() from public, anon, authenticated;

grant execute on function private.mark_compensation_required(uuid, text) to postgres, service_role;
grant execute on function private.mark_rescheduled(uuid, timestamptz, text) to postgres, service_role;
grant execute on function private.mark_connection_tested(uuid) to postgres, service_role;
grant execute on function private.list_accounts() to postgres, service_role;

revoke all on function public.mark_compensation_required(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_rescheduled(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.mark_connection_tested(uuid) from public, anon, authenticated;
revoke all on function public.list_accounts() from public, anon;

grant execute on function public.mark_compensation_required(uuid, text) to service_role;
grant execute on function public.mark_rescheduled(uuid, timestamptz, text) to service_role;
grant execute on function public.mark_connection_tested(uuid) to service_role;
grant execute on function public.list_accounts() to authenticated, service_role;
