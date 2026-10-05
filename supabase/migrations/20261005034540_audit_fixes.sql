-- Auditoria: preço vem do catálogo, policies de escrita não cobrem SELECT,
-- e um evento Stripe permanente não trava a fila de reconciliação.

alter table public.services
  add column price_cents bigint,
  add column currency text;

alter table public.services
  add constraint services_price_cents_positive
    check (price_cents is null or price_cents > 0),
  add constraint services_currency_iso
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  add constraint services_price_pair
    check (
      (price_cents is null and currency is null)
      or (price_cents is not null and currency is not null)
    );

comment on column public.services.price_cents is
  'Preço cobrado no checkout. A cliente não informa o valor.';

alter table private.inbound_events
  add column last_error text;

drop index if exists private.inbound_events_unapplied_idx;

create index inbound_events_unapplied_idx
  on private.inbound_events (received_at)
  where applied_at is null and last_error is null;

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
  v_price bigint;
  v_service_currency text;
  v_settings_currency text;
begin
  if not private.is_service() then
    raise exception 'registrar cobrança exige service_role' using errcode = '42501';
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

  select price_cents, currency
    into v_price, v_service_currency
  from public.services
  where id = v_booking.service_id;

  if v_price is null or v_service_currency is null then
    raise exception 'serviço sem preço configurado pela operação' using errcode = '22023';
  end if;

  if p_amount_cents is distinct from v_price or p_currency is distinct from v_service_currency then
    raise exception 'valor diferente do preço do serviço' using errcode = '22023';
  end if;

  select currency into v_settings_currency from public.marketplace_settings where id = 1;
  if v_settings_currency is not null and v_settings_currency is distinct from p_currency then
    raise exception 'moeda diferente da configuração do marketplace' using errcode = '22023';
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

create or replace function private.mark_inbound_event_error(p_event_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_service() then
    raise exception 'marcar erro de evento exige service_role' using errcode = '42501';
  end if;

  update private.inbound_events
  set last_error = left(coalesce(p_message, 'erro'), 500)
  where id = p_event_id
    and applied_at is null;
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
      and last_error is null
      and source = 'stripe'
    order by received_at
    for update skip locked
  loop
    begin
      perform private.apply_payment_event(v_id);
      v_count := v_count + 1;
    exception
      when invalid_parameter_value or no_data_found then
        update private.inbound_events
        set last_error = left(sqlerrm, 500)
        where id = v_id;
      when others then
        raise notice 'evento % não aplicado: %', v_id, sqlerrm;
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function private.mark_inbound_event_error(uuid, text) from public, anon, authenticated;
grant execute on function private.mark_inbound_event_error(uuid, text) to postgres, service_role;

create or replace function public.mark_inbound_event_error(p_event_id uuid, p_message text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.mark_inbound_event_error(p_event_id, p_message);
end;
$$;

revoke all on function public.mark_inbound_event_error(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_inbound_event_error(uuid, text) to service_role;

drop policy profiles_select_own on public.profiles;
drop policy profiles_select_operacao on public.profiles;

create policy profiles_select_visible
  on public.profiles for select to authenticated
  using (
    (select auth.uid()) = id
    or (select public.current_app_role()) = 'operacao'
  );

drop policy catalog_write_operacao on public.cities;
create policy cities_insert_operacao
  on public.cities for insert to authenticated
  with check ((select public.current_app_role()) = 'operacao');
create policy cities_update_operacao
  on public.cities for update to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');
create policy cities_delete_operacao
  on public.cities for delete to authenticated
  using ((select public.current_app_role()) = 'operacao');

drop policy specialties_write_operacao on public.specialties;
create policy specialties_insert_operacao
  on public.specialties for insert to authenticated
  with check ((select public.current_app_role()) = 'operacao');
create policy specialties_update_operacao
  on public.specialties for update to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');
create policy specialties_delete_operacao
  on public.specialties for delete to authenticated
  using ((select public.current_app_role()) = 'operacao');

drop policy services_write_operacao on public.services;
create policy services_insert_operacao
  on public.services for insert to authenticated
  with check ((select public.current_app_role()) = 'operacao');
create policy services_update_operacao
  on public.services for update to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');
create policy services_delete_operacao
  on public.services for delete to authenticated
  using ((select public.current_app_role()) = 'operacao');

drop policy professionals_write_operacao on public.professionals;
create policy professionals_insert_operacao
  on public.professionals for insert to authenticated
  with check ((select public.current_app_role()) = 'operacao');
create policy professionals_update_operacao
  on public.professionals for update to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');
create policy professionals_delete_operacao
  on public.professionals for delete to authenticated
  using ((select public.current_app_role()) = 'operacao');

drop policy professional_specialties_write on public.professional_specialties;
create policy professional_specialties_insert_operacao
  on public.professional_specialties for insert to authenticated
  with check ((select public.current_app_role()) = 'operacao');
create policy professional_specialties_update_operacao
  on public.professional_specialties for update to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');
create policy professional_specialties_delete_operacao
  on public.professional_specialties for delete to authenticated
  using ((select public.current_app_role()) = 'operacao');

drop policy professional_services_write on public.professional_services;
create policy professional_services_insert_operacao
  on public.professional_services for insert to authenticated
  with check ((select public.current_app_role()) = 'operacao');
create policy professional_services_update_operacao
  on public.professional_services for update to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');
create policy professional_services_delete_operacao
  on public.professional_services for delete to authenticated
  using ((select public.current_app_role()) = 'operacao');

drop policy professional_cities_write on public.professional_cities;
create policy professional_cities_insert_operacao
  on public.professional_cities for insert to authenticated
  with check ((select public.current_app_role()) = 'operacao');
create policy professional_cities_update_operacao
  on public.professional_cities for update to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');
create policy professional_cities_delete_operacao
  on public.professional_cities for delete to authenticated
  using ((select public.current_app_role()) = 'operacao');

drop policy schedule_connections_write on public.schedule_connections;
create policy schedule_connections_insert_operacao
  on public.schedule_connections for insert to authenticated
  with check ((select public.current_app_role()) = 'operacao');
create policy schedule_connections_update_operacao
  on public.schedule_connections for update to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');
create policy schedule_connections_delete_operacao
  on public.schedule_connections for delete to authenticated
  using ((select public.current_app_role()) = 'operacao');

drop policy reward_rules_write_operacao on public.reward_rules;
create policy reward_rules_insert_operacao
  on public.reward_rules for insert to authenticated
  with check ((select public.current_app_role()) = 'operacao');
create policy reward_rules_update_operacao
  on public.reward_rules for update to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');
create policy reward_rules_delete_operacao
  on public.reward_rules for delete to authenticated
  using ((select public.current_app_role()) = 'operacao');
