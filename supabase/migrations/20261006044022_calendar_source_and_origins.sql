-- Uma profissional pode guardar mais de uma credencial.
-- Só uma delas é a agenda que a cliente usa.
-- A origem do reagendamento aceita os provedores do catálogo,
-- para a próxima agenda não precisar de outra migration só por causa do nome.

alter table public.schedule_connections
  add column is_source boolean not null default false;

comment on column public.schedule_connections.is_source is
  'Agenda que a cliente usa. No máximo uma por profissional. As outras credenciais ficam guardadas e fora da reserva.';

create unique index schedule_connections_one_source_idx
  on public.schedule_connections (professional_id)
  where is_source;

update public.schedule_connections as chosen
set is_source = true
where (
  select count(*)
  from public.schedule_connections rows
  where rows.professional_id = chosen.professional_id
) = 1;

drop function if exists public.open_booking_intent(uuid, uuid, uuid, uuid, timestamptz);
drop function if exists private.open_booking_intent(uuid, uuid, uuid, uuid, timestamptz);

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

create or replace function public.open_booking_intent(
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
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := private.open_booking_intent(
    p_client_id,
    p_professional_id,
    p_service_id,
    p_city_id,
    p_starts_at,
    p_provider,
    p_duration_minutes
  );
  return v_id;
end;
$$;

revoke all on function private.open_booking_intent(uuid, uuid, uuid, uuid, timestamptz, text, integer) from public, anon, authenticated;
revoke all on function public.open_booking_intent(uuid, uuid, uuid, uuid, timestamptz, text, integer) from public, anon, authenticated;
grant execute on function private.open_booking_intent(uuid, uuid, uuid, uuid, timestamptz, text, integer) to postgres, service_role;
grant execute on function public.open_booking_intent(uuid, uuid, uuid, uuid, timestamptz, text, integer) to service_role;

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

  if p_origin is null or p_origin not in ('platform', 'acuity', 'square', 'wix', 'zenoti', 'mindbody') then
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
