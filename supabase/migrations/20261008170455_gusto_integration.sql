-- Infraestrutura Gusto desligada. Não grava SSN, conta bancária nem token.
-- authorize_payout passa a registrar só a aprovação do admin.
-- payout_released continua reservado para uma confirmação real do provedor.

alter table public.attendance_confirmations
  add column response text not null default 'confirmed';

alter table public.attendance_confirmations
  drop constraint if exists attendance_confirmations_response_check;

alter table public.attendance_confirmations
  add constraint attendance_confirmations_response_check
  check (response in ('confirmed', 'issue_reported'));

comment on column public.attendance_confirmations.response is
  'confirmed ou issue_reported. Sem linha, a cliente ainda não respondeu.';

create table private.professional_gusto (
  professional_id uuid primary key references public.professionals (id) on delete cascade,
  gusto_contractor_uuid uuid,
  integration_key text not null,
  sync_status text not null default 'not_configured' check (
    sync_status in ('not_configured', 'pending', 'synced', 'failed')
  ),
  payment_ready boolean not null default false,
  bank_account_configured boolean not null default false,
  bank_account_display text,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_gusto_key_check
    check (integration_key = 'detox-contractor-' || professional_id::text),
  constraint professional_gusto_display_check
    check (bank_account_display is null or bank_account_display ~ '^•{4}[0-9]{4}$'),
  constraint professional_gusto_error_check
    check (last_error is null or (char_length(last_error) <= 240 and last_error !~ '[0-9]{8}'))
);

create unique index professional_gusto_contractor_uidx
  on private.professional_gusto (gusto_contractor_uuid)
  where gusto_contractor_uuid is not null;

create unique index professional_gusto_key_uidx
  on private.professional_gusto (integration_key);

comment on table private.professional_gusto is
  'Vínculo com o contractor. Sem SSN e sem número de conta completo.';

create table private.payout_approvals (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  approved_by uuid not null,
  approved_at timestamptz not null default now()
);

comment on table private.payout_approvals is
  'Aprovação do admin. Não significa que a profissional foi paga.';

create table private.gusto_payments (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  idempotency_key text not null,
  gusto_payment_uuid uuid,
  status text not null default 'not_created' check (
    status in ('not_created', 'pending', 'submitted', 'paid', 'failed', 'not_configured')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gusto_payments_key_check
    check (idempotency_key = 'detox-payment-' || booking_id::text)
);

create unique index gusto_payments_key_uidx
  on private.gusto_payments (idempotency_key);

create unique index gusto_payments_uuid_uidx
  on private.gusto_payments (gusto_payment_uuid)
  where gusto_payment_uuid is not null;

comment on table private.gusto_payments is
  'Um pagamento por reserva. A linha só nasce quando o provedor for chamado.';

revoke all on table private.professional_gusto from public, anon, authenticated;
revoke all on table private.payout_approvals from public, anon, authenticated;
revoke all on table private.gusto_payments from public, anon, authenticated;
grant select, insert, update, delete on table private.professional_gusto to service_role;
grant select, insert, update, delete on table private.payout_approvals to service_role;
grant select, insert, update, delete on table private.gusto_payments to service_role;

create or replace function private.answer_visit(p_booking_id uuid, p_response text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_existing text;
  v_rule uuid;
begin
  if p_response not in ('confirmed', 'issue_reported') then
    raise exception 'resposta inválida' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'reserva inexistente' using errcode = 'P0002';
  end if;

  if v_booking.client_id is distinct from auth.uid()
     or public.current_app_role() is distinct from 'cliente' then
    raise exception 'só a cliente responde o próprio atendimento' using errcode = '42501';
  end if;

  if v_booking.saga_status in ('cancelled', 'compensation_required', 'compensated') then
    raise exception 'reserva cancelada não confirma' using errcode = '22023';
  end if;

  if v_booking.saga_status not in ('paid', 'payout_released') then
    raise exception 'pagamento ainda não confirmado' using errcode = '22023';
  end if;

  select response into v_existing
  from public.attendance_confirmations
  where booking_id = p_booking_id
  for update;

  if found then
    if v_existing = p_response then
      return;
    end if;
    raise exception 'a cliente já respondeu' using errcode = '22023';
  end if;

  insert into public.attendance_confirmations (booking_id, confirmed_by, response)
  values (v_booking.id, auth.uid(), p_response);

  if p_response = 'confirmed' then
    select id into v_rule
    from public.reward_rules
    where code = 'confirmed_session' and active
    limit 1;

    if v_rule is not null then
      insert into public.reward_grants (booking_id, professional_id, rule_id)
      values (v_booking.id, v_booking.professional_id, v_rule)
      on conflict (booking_id, rule_id) do nothing;
    end if;
  end if;

  perform private.record_booking_event(
    v_booking.id,
    case when p_response = 'confirmed' then 'attendance_confirmed' else 'attendance_issue' end,
    v_booking.saga_status,
    v_booking.saga_status
  );
end;
$$;

create or replace function private.confirm_attendance(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.answer_visit(p_booking_id, 'confirmed');
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
  v_response text;
  v_inserted integer;
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

  if auth.uid() is null then
    raise exception 'aprovação exige um admin autenticado' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'reserva inexistente' using errcode = 'P0002';
  end if;

  if v_booking.saga_status = 'payout_released' then
    return;
  end if;

  if v_booking.saga_status is distinct from 'paid' then
    raise exception 'reserva não está paga' using errcode = '22023';
  end if;

  select response into v_response
  from public.attendance_confirmations
  where booking_id = p_booking_id;

  if v_response = 'issue_reported' then
    raise exception 'cliente reportou um problema' using errcode = '22023';
  end if;

  insert into private.payout_approvals (booking_id, approved_by)
  values (p_booking_id, auth.uid())
  on conflict (booking_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    perform private.record_booking_event(p_booking_id, 'payout_approved', 'paid', 'paid');
  end if;
end;
$$;

create or replace function private.can_release_professional_payment(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_response text;
  v_ready boolean;
  v_approved boolean;
  v_blockers text[] := '{}';
begin
  if not (
    private.is_service()
    or public.current_app_role() = 'operacao'
  ) then
    raise exception 'só a operação consulta a elegibilidade' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'reserva inexistente' using errcode = 'P0002';
  end if;

  if v_booking.saga_status is distinct from 'paid' then
    v_blockers := array_append(v_blockers, 'not_paid');
  end if;

  select response into v_response
  from public.attendance_confirmations
  where booking_id = p_booking_id;

  if v_response = 'issue_reported' then
    v_blockers := array_append(v_blockers, 'issue_reported');
  end if;

  select exists (
    select 1 from private.payout_approvals where booking_id = p_booking_id
  ) into v_approved;

  if not v_approved then
    v_blockers := array_append(v_blockers, 'admin_pending');
  end if;

  select payment_ready into v_ready
  from private.professional_gusto
  where professional_id = v_booking.professional_id;

  if coalesce(v_ready, false) is not true then
    v_blockers := array_append(v_blockers, 'payment_not_ready');
  end if;

  return jsonb_build_object(
    'eligible', cardinality(v_blockers) = 0,
    'blockers', to_jsonb(v_blockers),
    'customer_response', coalesce(v_response, 'pending'),
    'admin_status', case when v_approved then 'approved' else 'pending' end
  );
end;
$$;

create or replace function private.payment_setup_payload(p_professional_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_status text;
  v_ready boolean;
  v_bank boolean;
  v_display text;
  v_sync timestamptz;
  v_error text;
  v_setup text;
begin
  select display_name into v_name
  from public.professionals
  where id = p_professional_id;

  if v_name is null then
    raise exception 'profissional inexistente' using errcode = 'P0002';
  end if;

  select sync_status, payment_ready, bank_account_configured, bank_account_display, last_sync_at, last_error
  into v_status, v_ready, v_bank, v_display, v_sync, v_error
  from private.professional_gusto
  where professional_id = p_professional_id;

  v_setup := case
    when v_status = 'failed' then 'error'
    when coalesce(v_ready, false) then 'ready'
    when v_status is null or v_status = 'not_configured' then 'not_configured'
    else 'pending'
  end;

  return jsonb_build_object(
    'professional_id', p_professional_id,
    'display_name', v_name,
    'setup_status', v_setup,
    'payment_ready', coalesce(v_ready, false),
    'bank_account_configured', coalesce(v_bank, false),
    'bank_account_display', v_display,
    'last_sync_at', v_sync,
    'last_error', v_error
  );
end;
$$;

create or replace function private.my_payment_setup()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_professional uuid;
begin
  if public.current_app_role() is distinct from 'profissional' then
    raise exception 'só a profissional vê o próprio pagamento' using errcode = '42501';
  end if;

  select id into v_professional
  from public.professionals
  where profile_id = auth.uid();

  if v_professional is null then
    raise exception 'profissional inexistente' using errcode = 'P0002';
  end if;

  return private.payment_setup_payload(v_professional);
end;
$$;

create or replace function private.payment_setup_of(p_professional_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_app_role() is distinct from 'operacao' then
    raise exception 'só a operação vê o pagamento da profissional' using errcode = '42501';
  end if;

  return private.payment_setup_payload(p_professional_id);
end;
$$;

create or replace function public.answer_visit(p_booking_id uuid, p_response text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.answer_visit(p_booking_id, p_response);
end;
$$;

create or replace function public.can_release_professional_payment(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return private.can_release_professional_payment(p_booking_id);
end;
$$;

create or replace function public.my_payment_setup()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return private.my_payment_setup();
end;
$$;

create or replace function public.payment_setup_of(p_professional_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return private.payment_setup_of(p_professional_id);
end;
$$;

revoke all on function private.answer_visit(uuid, text) from public, anon;
revoke all on function private.can_release_professional_payment(uuid) from public, anon;
revoke all on function private.payment_setup_payload(uuid) from public, anon, authenticated;
revoke all on function private.my_payment_setup() from public, anon;
revoke all on function private.payment_setup_of(uuid) from public, anon;
revoke all on function public.answer_visit(uuid, text) from public, anon;
revoke all on function public.can_release_professional_payment(uuid) from public, anon;
revoke all on function public.my_payment_setup() from public, anon;
revoke all on function public.payment_setup_of(uuid) from public, anon;

grant execute on function private.answer_visit(uuid, text) to authenticated, service_role;
grant execute on function private.can_release_professional_payment(uuid) to authenticated, service_role;
grant execute on function private.payment_setup_payload(uuid) to postgres, service_role;
grant execute on function private.my_payment_setup() to authenticated, service_role;
grant execute on function private.payment_setup_of(uuid) to authenticated, service_role;
grant execute on function public.answer_visit(uuid, text) to authenticated, service_role;
grant execute on function public.can_release_professional_payment(uuid) to authenticated, service_role;
grant execute on function public.my_payment_setup() to authenticated, service_role;
grant execute on function public.payment_setup_of(uuid) to authenticated, service_role;

create or replace function private.gusto_contractor_link(p_professional_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select gusto_contractor_uuid
  from private.professional_gusto
  where professional_id = p_professional_id;
$$;

create or replace function private.record_gusto_contractor(
  p_professional_id uuid,
  p_contractor_uuid uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
begin
  if not private.is_service() then
    raise exception 'gravar contractor exige service_role' using errcode = '42501';
  end if;

  if not exists (select 1 from public.professionals where id = p_professional_id) then
    raise exception 'profissional inexistente' using errcode = 'P0002';
  end if;

  select gusto_contractor_uuid into v_existing
  from private.professional_gusto
  where professional_id = p_professional_id
  for update;

  if v_existing is not null and v_existing is distinct from p_contractor_uuid then
    raise exception 'contractor já vinculado' using errcode = '22023';
  end if;

  insert into private.professional_gusto (
    professional_id,
    gusto_contractor_uuid,
    integration_key,
    sync_status,
    last_sync_at,
    last_error,
    updated_at
  )
  values (
    p_professional_id,
    p_contractor_uuid,
    'detox-contractor-' || p_professional_id::text,
    'synced',
    pg_catalog.now(),
    null,
    pg_catalog.now()
  )
  on conflict (professional_id) do update
  set gusto_contractor_uuid = excluded.gusto_contractor_uuid,
      sync_status = 'synced',
      last_sync_at = pg_catalog.now(),
      last_error = null,
      updated_at = pg_catalog.now();
end;
$$;

create or replace function private.record_gusto_bank_display(
  p_professional_id uuid,
  p_display text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_service() then
    raise exception 'gravar conta exige service_role' using errcode = '42501';
  end if;

  if p_display is null or p_display !~ '^•{4}[0-9]{4}$' then
    raise exception 'máscara inválida' using errcode = '22023';
  end if;

  update private.professional_gusto
  set bank_account_configured = true,
      bank_account_display = p_display,
      last_sync_at = pg_catalog.now(),
      last_error = null,
      updated_at = pg_catalog.now()
  where professional_id = p_professional_id;

  if not found then
    raise exception 'profissional sem contractor' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.gusto_contractor_link(p_professional_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return private.gusto_contractor_link(p_professional_id);
end;
$$;

create or replace function public.record_gusto_contractor(
  p_professional_id uuid,
  p_contractor_uuid uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.record_gusto_contractor(p_professional_id, p_contractor_uuid);
end;
$$;

create or replace function public.record_gusto_bank_display(
  p_professional_id uuid,
  p_display text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.record_gusto_bank_display(p_professional_id, p_display);
end;
$$;

revoke all on function private.gusto_contractor_link(uuid) from public, anon, authenticated;
revoke all on function private.record_gusto_contractor(uuid, uuid) from public, anon, authenticated;
revoke all on function private.record_gusto_bank_display(uuid, text) from public, anon, authenticated;
revoke all on function public.gusto_contractor_link(uuid) from public, anon, authenticated;
revoke all on function public.record_gusto_contractor(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_gusto_bank_display(uuid, text) from public, anon, authenticated;

grant execute on function private.gusto_contractor_link(uuid) to postgres, service_role;
grant execute on function private.record_gusto_contractor(uuid, uuid) to postgres, service_role;
grant execute on function private.record_gusto_bank_display(uuid, text) to postgres, service_role;
grant execute on function public.gusto_contractor_link(uuid) to service_role;
grant execute on function public.record_gusto_contractor(uuid, uuid) to service_role;
grant execute on function public.record_gusto_bank_display(uuid, text) to service_role;

create or replace function private.record_gusto_sync_error(
  p_professional_id uuid,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_service() then
    raise exception 'gravar erro exige service_role' using errcode = '42501';
  end if;

  if p_error is null or char_length(p_error) > 240 or p_error ~ '[0-9]{8}' then
    p_error := 'Payment sync failed';
  end if;

  insert into private.professional_gusto (
    professional_id,
    integration_key,
    sync_status,
    last_error,
    updated_at
  )
  values (
    p_professional_id,
    'detox-contractor-' || p_professional_id::text,
    'failed',
    p_error,
    pg_catalog.now()
  )
  on conflict (professional_id) do update
  set sync_status = 'failed',
      last_error = excluded.last_error,
      updated_at = pg_catalog.now();
end;
$$;

create or replace function public.record_gusto_sync_error(
  p_professional_id uuid,
  p_error text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.record_gusto_sync_error(p_professional_id, p_error);
end;
$$;

revoke all on function private.record_gusto_sync_error(uuid, text) from public, anon, authenticated;
revoke all on function public.record_gusto_sync_error(uuid, text) from public, anon, authenticated;
grant execute on function private.record_gusto_sync_error(uuid, text) to postgres, service_role;
grant execute on function public.record_gusto_sync_error(uuid, text) to service_role;
