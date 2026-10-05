-- Comandos. Funções security definer ficam em private.
-- Wrappers públicos (sem security definer) estão na migration seguinte.
-- Agenda e Stripe não compartilham transação: cada passo é uma função.

create or replace function private.record_booking_event(
  p_booking_id uuid,
  p_event_type text,
  p_from_status text,
  p_to_status text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.booking_events (booking_id, event_type, from_status, to_status)
  values (p_booking_id, p_event_type, p_from_status, p_to_status);
$$;

create or replace function private.set_app_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
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

  insert into public.bookings (
    client_id, professional_id, service_id, city_id, provider, saga_status, starts_at
  ) values (
    p_client_id, p_professional_id, p_service_id, p_city_id, v_provider, 'intent', p_starts_at
  )
  returning id into v_id;

  perform private.record_booking_event(v_id, 'intent_opened', null, 'intent');
  return v_id;
end;
$$;

create or replace function private.mark_provider_confirmed(
  p_booking_id uuid,
  p_external_booking_id text
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
    raise exception 'confirmar horário no provedor exige service_role' using errcode = '42501';
  end if;

  if p_external_booking_id is null or length(btrim(p_external_booking_id)) = 0 then
    raise exception 'id externo obrigatório' using errcode = '22023';
  end if;

  select saga_status into v_status
  from public.bookings
  where id = p_booking_id
  for update;

  if v_status is null then
    raise exception 'reserva inexistente' using errcode = 'P0002';
  end if;

  if v_status = 'provider_confirmed' then
    return;
  end if;

  if v_status is distinct from 'intent' then
    raise exception 'reserva não está em intenção' using errcode = '22023';
  end if;

  update public.bookings
  set saga_status = 'provider_confirmed',
      external_booking_id = p_external_booking_id,
      updated_at = pg_catalog.now()
  where id = p_booking_id;

  perform private.record_booking_event(
    p_booking_id, 'provider_confirmed', 'intent', 'provider_confirmed'
  );
end;
$$;

create or replace function private.mark_charge_created(
  p_booking_id uuid,
  p_external_charge_ref text,
  p_amount_cents bigint,
  p_currency text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_settings_currency text;
begin
  if not private.is_service() then
    raise exception 'registrar cobrança exige service_role' using errcode = '42501';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'valor inválido' using errcode = '22023';
  end if;

  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'moeda inválida' using errcode = '22023';
  end if;

  select currency into v_settings_currency from public.marketplace_settings where id = 1;
  if v_settings_currency is not null and v_settings_currency is distinct from p_currency then
    raise exception 'moeda diferente da configuração do marketplace' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'reserva inexistente' using errcode = 'P0002';
  end if;

  if v_booking.saga_status = 'charge_created' then
    return;
  end if;

  if v_booking.saga_status is distinct from 'provider_confirmed' then
    raise exception 'horário ainda não confirmado no provedor' using errcode = '22023';
  end if;

  update public.bookings
  set saga_status = 'charge_created',
      external_charge_ref = p_external_charge_ref,
      amount_cents = p_amount_cents,
      currency = p_currency,
      updated_at = pg_catalog.now()
  where id = p_booking_id;

  perform private.record_booking_event(
    p_booking_id, 'charge_created', 'provider_confirmed', 'charge_created'
  );
end;
$$;

create or replace function private.record_payment_event(
  p_source text,
  p_external_id text,
  p_booking_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_service() then
    raise exception 'registrar evento exige service_role' using errcode = '42501';
  end if;

  insert into private.inbound_events (source, external_id, booking_id, payload)
  values (p_source, p_external_id, p_booking_id, coalesce(p_payload, '{}'::jsonb))
  on conflict (source, external_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from private.inbound_events
    where source = p_source and external_id = p_external_id;
  end if;

  return v_id;
end;
$$;

create or replace function private.apply_payment_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event private.inbound_events%rowtype;
  v_booking public.bookings%rowtype;
  v_bps integer;
  v_commission bigint;
  v_payout bigint;
begin
  if not private.is_service() then
    raise exception 'aplicar pagamento exige service_role' using errcode = '42501';
  end if;

  select * into v_event
  from private.inbound_events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'evento inexistente' using errcode = 'P0002';
  end if;

  if v_event.applied_at is not null then
    return;
  end if;

  if v_event.booking_id is null then
    raise exception 'evento sem reserva' using errcode = '22023';
  end if;

  select * into v_booking
  from public.bookings
  where id = v_event.booking_id
  for update;

  if v_booking.saga_status = 'paid'
     or v_booking.saga_status = 'payout_released' then
    update private.inbound_events
    set applied_at = pg_catalog.now()
    where id = v_event.id and applied_at is null;
    return;
  end if;

  if v_booking.saga_status is distinct from 'charge_created' then
    raise exception 'reserva não está aguardando pagamento' using errcode = '22023';
  end if;

  if v_booking.amount_cents is null or v_booking.currency is null then
    raise exception 'reserva sem valor' using errcode = '22023';
  end if;

  select commission_bps into v_bps
  from public.marketplace_settings
  where id = 1;

  v_commission := round(v_booking.amount_cents * v_bps / 10000.0)::bigint;
  v_payout := v_booking.amount_cents - v_commission;

  insert into private.ledger_entries (booking_id, kind, amount_cents, currency, inbound_event_id)
  values
    (v_booking.id, 'charge_confirmed', v_booking.amount_cents, v_booking.currency, v_event.id),
    (v_booking.id, 'commission', v_commission, v_booking.currency, v_event.id),
    (v_booking.id, 'payout_pending', v_payout, v_booking.currency, v_event.id);

  update public.bookings
  set saga_status = 'paid',
      updated_at = pg_catalog.now()
  where id = v_booking.id;

  update private.inbound_events
  set applied_at = pg_catalog.now()
  where id = v_event.id;

  perform private.record_booking_event(v_booking.id, 'paid', 'charge_created', 'paid');
end;
$$;

create or replace function private.retry_unapplied_payment_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if not private.is_service() then
    raise exception 'reconciliação exige service_role' using errcode = '42501';
  end if;

  for v_id in
    select id
    from private.inbound_events
    where applied_at is null
    order by received_at
    for update skip locked
  loop
    perform private.apply_payment_event(v_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function private.confirm_attendance(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_rule uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'reserva inexistente' using errcode = 'P0002';
  end if;

  if v_booking.client_id is distinct from auth.uid()
     or public.current_app_role() is distinct from 'cliente' then
    raise exception 'só a cliente confirma o próprio atendimento' using errcode = '42501';
  end if;

  if v_booking.saga_status in ('cancelled', 'compensation_required', 'compensated') then
    raise exception 'reserva cancelada não confirma' using errcode = '22023';
  end if;

  if v_booking.saga_status not in ('paid', 'payout_released') then
    raise exception 'pagamento ainda não confirmado' using errcode = '22023';
  end if;

  insert into public.attendance_confirmations (booking_id, confirmed_by)
  values (v_booking.id, auth.uid())
  on conflict (booking_id) do nothing;

  select id into v_rule
  from public.reward_rules
  where code = 'confirmed_session' and active
  limit 1;

  if v_rule is not null then
    insert into public.reward_grants (booking_id, professional_id, rule_id)
    values (v_booking.id, v_booking.professional_id, v_rule)
    on conflict (booking_id, rule_id) do nothing;
  end if;

  perform private.record_booking_event(
    v_booking.id, 'attendance_confirmed', v_booking.saga_status, v_booking.saga_status
  );
end;
$$;

create or replace function private.authorize_payout(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_amount bigint;
  v_currency text;
begin
  if not (
    private.is_service()
    or public.current_app_role() = 'operacao'
  ) then
    raise exception 'só a operação autoriza o repasse' using errcode = '42501';
  end if;

  if public.current_app_role() = 'profissional' then
    raise exception 'profissional não libera o próprio repasse' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'reserva inexistente' using errcode = 'P0002';
  end if;

  if v_booking.saga_status = 'payout_released' then
    return;
  end if;

  if not exists (
    select 1 from public.attendance_confirmations where booking_id = p_booking_id
  ) then
    raise exception 'atendimento ainda não confirmado pela cliente' using errcode = '22023';
  end if;

  if v_booking.saga_status is distinct from 'paid' then
    raise exception 'reserva não está paga' using errcode = '22023';
  end if;

  select amount_cents, currency into v_amount, v_currency
  from private.ledger_entries
  where booking_id = p_booking_id and kind = 'payout_pending';

  if v_amount is null then
    raise exception 'não há repasse pendente' using errcode = '22023';
  end if;

  insert into private.ledger_entries (booking_id, kind, amount_cents, currency)
  values (p_booking_id, 'payout_released', v_amount, v_currency);

  update public.bookings
  set saga_status = 'payout_released',
      updated_at = pg_catalog.now()
  where id = p_booking_id;

  perform private.record_booking_event(
    p_booking_id, 'payout_released', 'paid', 'payout_released'
  );
end;
$$;

create or replace function private.mark_cancelled(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not private.is_service() then
    raise exception 'cancelar exige service_role' using errcode = '42501';
  end if;

  select saga_status into v_status
  from public.bookings
  where id = p_booking_id
  for update;

  if v_status is null then
    raise exception 'reserva inexistente' using errcode = 'P0002';
  end if;

  if v_status = 'cancelled' then
    return;
  end if;

  if v_status = 'payout_released' then
    raise exception 'repasse já liberado' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.attendance_confirmations where booking_id = p_booking_id
  ) then
    raise exception 'atendimento já confirmado' using errcode = '22023';
  end if;

  update public.bookings
  set saga_status = 'cancelled',
      updated_at = pg_catalog.now()
  where id = p_booking_id;

  perform private.record_booking_event(p_booking_id, 'cancelled', v_status, 'cancelled');
end;
$$;

create or replace function private.mark_rescheduled(
  p_booking_id uuid,
  p_starts_at timestamptz
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
    raise exception 'reagendar exige service_role' using errcode = '42501';
  end if;

  select saga_status into v_status
  from public.bookings
  where id = p_booking_id
  for update;

  if v_status is null then
    raise exception 'reserva inexistente' using errcode = 'P0002';
  end if;

  if v_status in ('cancelled', 'compensated', 'compensation_required') then
    raise exception 'reserva encerrada não reagenda' using errcode = '22023';
  end if;

  update public.bookings
  set starts_at = p_starts_at,
      updated_at = pg_catalog.now()
  where id = p_booking_id;

  perform private.record_booking_event(p_booking_id, 'rescheduled', v_status, v_status);
end;
$$;

create or replace function private.record_compensation(
  p_booking_id uuid,
  p_amount_cents bigint,
  p_source text,
  p_external_id text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_event_id uuid;
begin
  if not private.is_service() then
    raise exception 'compensação exige service_role' using errcode = '42501';
  end if;

  if p_amount_cents is null or p_amount_cents < 0 then
    raise exception 'valor de compensação inválido' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'reserva inexistente' using errcode = 'P0002';
  end if;

  if v_booking.currency is null then
    raise exception 'reserva sem moeda' using errcode = '22023';
  end if;

  if v_booking.saga_status = 'payout_released' then
    raise exception 'repasse já liberado' using errcode = '22023';
  end if;

  insert into private.inbound_events (source, external_id, booking_id, payload, applied_at)
  values (
    p_source,
    p_external_id,
    p_booking_id,
    coalesce(p_payload, '{}'::jsonb),
    pg_catalog.now()
  )
  on conflict (source, external_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return;
  end if;

  insert into private.ledger_entries (booking_id, kind, amount_cents, currency, inbound_event_id)
  values (p_booking_id, 'compensation', p_amount_cents, v_booking.currency, v_event_id);

  update public.bookings
  set saga_status = 'compensated',
      updated_at = pg_catalog.now()
  where id = p_booking_id;

  perform private.record_booking_event(
    p_booking_id, 'compensated', v_booking.saga_status, 'compensated'
  );
end;
$$;

create or replace function private.finance_report()
returns table (
  booking_id uuid,
  currency text,
  paid_cents bigint,
  commission_cents bigint,
  pending_cents bigint,
  released_cents bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_app_role() is distinct from 'operacao' and not private.is_service() then
    raise exception 'relatório financeiro é da operação' using errcode = '42501';
  end if;

  return query
  select
    b.id,
    b.currency,
    coalesce(sum(e.amount_cents) filter (where e.kind = 'charge_confirmed'), 0)::bigint,
    coalesce(sum(e.amount_cents) filter (where e.kind = 'commission'), 0)::bigint,
    case
      when bool_or(e.kind = 'payout_released') then 0::bigint
      else coalesce(sum(e.amount_cents) filter (where e.kind = 'payout_pending'), 0)::bigint
    end,
    coalesce(sum(e.amount_cents) filter (where e.kind = 'payout_released'), 0)::bigint
  from public.bookings b
  left join private.ledger_entries e on e.booking_id = b.id
  where b.currency is not null
  group by b.id, b.currency;
end;
$$;

revoke all on function private.record_booking_event(uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.set_app_role(uuid, text) from public, anon, authenticated;
revoke all on function private.open_booking_intent(uuid, uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.mark_provider_confirmed(uuid, text) from public, anon, authenticated;
revoke all on function private.mark_charge_created(uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function private.record_payment_event(text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.apply_payment_event(uuid) from public, anon, authenticated;
revoke all on function private.retry_unapplied_payment_events() from public, anon, authenticated;
revoke all on function private.confirm_attendance(uuid) from public, anon, authenticated;
revoke all on function private.authorize_payout(uuid) from public, anon, authenticated;
revoke all on function private.mark_cancelled(uuid) from public, anon, authenticated;
revoke all on function private.mark_rescheduled(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.record_compensation(uuid, bigint, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.finance_report() from public, anon, authenticated;

grant execute on function private.record_booking_event(uuid, text, text, text) to postgres, service_role;
grant execute on function private.set_app_role(uuid, text) to postgres, service_role;
grant execute on function private.open_booking_intent(uuid, uuid, uuid, uuid, timestamptz) to postgres, service_role;
grant execute on function private.mark_provider_confirmed(uuid, text) to postgres, service_role;
grant execute on function private.mark_charge_created(uuid, text, bigint, text) to postgres, service_role;
grant execute on function private.record_payment_event(text, text, uuid, jsonb) to postgres, service_role;
grant execute on function private.apply_payment_event(uuid) to postgres, service_role;
grant execute on function private.retry_unapplied_payment_events() to postgres, service_role;
grant execute on function private.confirm_attendance(uuid) to postgres, service_role;
grant execute on function private.authorize_payout(uuid) to postgres, service_role;
grant execute on function private.mark_cancelled(uuid) to postgres, service_role;
grant execute on function private.mark_rescheduled(uuid, timestamptz) to postgres, service_role;
grant execute on function private.record_compensation(uuid, bigint, text, text, jsonb) to postgres, service_role;
grant execute on function private.finance_report() to postgres, service_role;
