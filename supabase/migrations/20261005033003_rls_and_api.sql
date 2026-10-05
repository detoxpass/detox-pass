-- Wrappers em public são security invoker. A regra fica em private.
-- Comando de dinheiro e agenda: só service_role.
-- Confirmar e autorizar repasse: authenticated, com a checagem dentro da função.
-- Cron de reconciliação: evento já gravado e ainda não aplicado. Sem HTTP.

create or replace function public.confirm_attendance(p_booking_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.confirm_attendance(p_booking_id);
end;
$$;

create or replace function public.authorize_payout(p_booking_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.authorize_payout(p_booking_id);
end;
$$;

create or replace function public.set_app_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.set_app_role(p_user_id, p_role);
end;
$$;

create or replace function public.finance_report()
returns table (
  booking_id uuid,
  currency text,
  paid_cents bigint,
  commission_cents bigint,
  pending_cents bigint,
  released_cents bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query select * from private.finance_report();
end;
$$;

create or replace function public.open_booking_intent(
  p_client_id uuid,
  p_professional_id uuid,
  p_service_id uuid,
  p_city_id uuid,
  p_starts_at timestamptz
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
    p_client_id, p_professional_id, p_service_id, p_city_id, p_starts_at
  );
  return v_id;
end;
$$;

create or replace function public.mark_provider_confirmed(
  p_booking_id uuid,
  p_external_booking_id text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.mark_provider_confirmed(p_booking_id, p_external_booking_id);
end;
$$;

create or replace function public.mark_charge_created(
  p_booking_id uuid,
  p_external_charge_ref text,
  p_amount_cents bigint,
  p_currency text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.mark_charge_created(
    p_booking_id, p_external_charge_ref, p_amount_cents, p_currency
  );
end;
$$;

create or replace function public.record_payment_event(
  p_source text,
  p_external_id text,
  p_booking_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := private.record_payment_event(p_source, p_external_id, p_booking_id, p_payload);
  return v_id;
end;
$$;

create or replace function public.apply_payment_event(p_event_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.apply_payment_event(p_event_id);
end;
$$;

create or replace function public.retry_unapplied_payment_events()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  v_count := private.retry_unapplied_payment_events();
  return v_count;
end;
$$;

create or replace function public.mark_cancelled(p_booking_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.mark_cancelled(p_booking_id);
end;
$$;

create or replace function public.mark_rescheduled(p_booking_id uuid, p_starts_at timestamptz)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.mark_rescheduled(p_booking_id, p_starts_at);
end;
$$;

create or replace function public.record_compensation(
  p_booking_id uuid,
  p_amount_cents bigint,
  p_source text,
  p_external_id text,
  p_payload jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.record_compensation(
    p_booking_id, p_amount_cents, p_source, p_external_id, p_payload
  );
end;
$$;

-- Wrappers security invoker resolvem private.* como o usuário da chamada.
-- USAGE não abre tabela: authenticated não tem grant nas tabelas de private.
grant usage on schema private to authenticated;

grant execute on function private.confirm_attendance(uuid) to authenticated;
grant execute on function private.authorize_payout(uuid) to authenticated;
grant execute on function private.set_app_role(uuid, text) to authenticated;
grant execute on function private.finance_report() to authenticated;

-- Comandos de saga continuam só com service_role (já concedido na migration anterior).
grant execute on function private.open_booking_intent(uuid, uuid, uuid, uuid, timestamptz) to service_role;
grant execute on function private.mark_provider_confirmed(uuid, text) to service_role;
grant execute on function private.mark_charge_created(uuid, text, bigint, text) to service_role;
grant execute on function private.record_payment_event(text, text, uuid, jsonb) to service_role;
grant execute on function private.apply_payment_event(uuid) to service_role;
grant execute on function private.retry_unapplied_payment_events() to service_role;
grant execute on function private.mark_cancelled(uuid) to service_role;
grant execute on function private.mark_rescheduled(uuid, timestamptz) to service_role;
grant execute on function private.record_compensation(uuid, bigint, text, text, jsonb) to service_role;

revoke all on function public.confirm_attendance(uuid) from public, anon;
revoke all on function public.authorize_payout(uuid) from public, anon;
revoke all on function public.set_app_role(uuid, text) from public, anon;
revoke all on function public.finance_report() from public, anon;
revoke all on function public.open_booking_intent(uuid, uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_provider_confirmed(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_charge_created(uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.record_payment_event(text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.apply_payment_event(uuid) from public, anon, authenticated;
revoke all on function public.retry_unapplied_payment_events() from public, anon, authenticated;
revoke all on function public.mark_cancelled(uuid) from public, anon, authenticated;
revoke all on function public.mark_rescheduled(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.record_compensation(uuid, bigint, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.confirm_attendance(uuid) to authenticated, service_role;
grant execute on function public.authorize_payout(uuid) to authenticated, service_role;
grant execute on function public.set_app_role(uuid, text) to authenticated, service_role;
grant execute on function public.finance_report() to authenticated, service_role;

grant execute on function public.open_booking_intent(uuid, uuid, uuid, uuid, timestamptz) to service_role;
grant execute on function public.mark_provider_confirmed(uuid, text) to service_role;
grant execute on function public.mark_charge_created(uuid, text, bigint, text) to service_role;
grant execute on function public.record_payment_event(text, text, uuid, jsonb) to service_role;
grant execute on function public.apply_payment_event(uuid) to service_role;
grant execute on function public.retry_unapplied_payment_events() to service_role;
grant execute on function public.mark_cancelled(uuid) to service_role;
grant execute on function public.mark_rescheduled(uuid, timestamptz) to service_role;
grant execute on function public.record_compensation(uuid, bigint, text, text, jsonb) to service_role;

-- pg_cron reaplica evento gravado e não lançado. Se a extensão não existir
-- nesta conta, a função continua chamável por um agendador externo.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'retry-unapplied-payment-events',
    '*/5 * * * *',
    $job$select private.retry_unapplied_payment_events();$job$
  );
exception
  when duplicate_object then
    null;
  when undefined_table then
    raise notice 'pg_cron indisponível; agende private.retry_unapplied_payment_events() fora do banco';
  when insufficient_privilege then
    raise notice 'sem permissão para pg_cron; agende a função fora do banco';
  when others then
    raise notice 'pg_cron não agendado: %', sqlerrm;
end;
$$;
