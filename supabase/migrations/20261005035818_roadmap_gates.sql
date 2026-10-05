-- Histórico do reagendamento guarda os dois horários.
-- O cron da reconciliação fica garantido quando pg_cron existe.

alter table public.booking_events
  add column from_starts_at timestamptz,
  add column to_starts_at timestamptz,
  add column origin text;

comment on column public.booking_events.from_starts_at is
  'Horário anterior, quando o evento é um reagendamento.';

comment on column public.booking_events.to_starts_at is
  'Horário novo, quando o evento é um reagendamento.';

comment on column public.booking_events.origin is
  'Origem da mudança. platform quando a plataforma reagenda.';

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
  v_previous timestamptz;
begin
  if not private.is_service() then
    raise exception 'reagendar exige service_role' using errcode = '42501';
  end if;

  if p_starts_at is null then
    raise exception 'horário novo obrigatório' using errcode = '22023';
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

  update public.bookings
  set starts_at = p_starts_at,
      updated_at = pg_catalog.now()
  where id = p_booking_id;

  insert into public.booking_events (
    booking_id,
    event_type,
    from_status,
    to_status,
    from_starts_at,
    to_starts_at,
    origin
  ) values (
    p_booking_id,
    'rescheduled',
    v_status,
    v_status,
    v_previous,
    p_starts_at,
    'platform'
  );
end;
$$;

do $cron$
begin
  create extension if not exists pg_cron;
  if not exists (
    select 1
    from cron.job
    where jobname = 'retry-unapplied-payment-events'
  ) then
    perform cron.schedule(
      'retry-unapplied-payment-events',
      '*/5 * * * *',
      $job$select private.retry_unapplied_payment_events();$job$
    );
  end if;
exception
  when undefined_table or insufficient_privilege then
    raise notice 'pg_cron indisponível neste ambiente: %', sqlerrm;
  when others then
    raise notice 'pg_cron não agendado: %', sqlerrm;
end;
$cron$;
