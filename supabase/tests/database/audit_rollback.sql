-- Prova da saga no projeto ligado. A exceção final desfaz usuários, reservas e ledger.
do $audit$
declare
  v_client uuid := '00000000-0000-0000-0000-000000000101';
  v_pro uuid := '00000000-0000-0000-0000-000000000102';
  v_ops uuid := '00000000-0000-0000-0000-000000000103';
  v_city uuid := '00000000-0000-0000-0000-000000000201';
  v_service uuid := '00000000-0000-0000-0000-000000000301';
  v_professional uuid;
  v_booking uuid;
  v_stuck uuid;
  v_cancel uuid;
  v_closed uuid;
  v_previous timestamptz;
  v_next timestamptz;
  v_event uuid;
  v_retried integer;
  v_commission bigint;
  v_charges integer;
  v_released integer;
  v_rewards integer;
  v_status text;
  v_paid bigint;
  v_select_policies integer;
begin
  if exists (
    select 1
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and pol.polcmd = '*'
  ) then
    raise exception 'AUDIT_FAIL ainda existe policy FOR ALL';
  end if;

  select count(*) into v_select_policies
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'profiles'
    and pol.polcmd = 'r';

  if v_select_policies <> 1 then
    raise exception 'AUDIT_FAIL profiles deveria ter uma policy de select, tem %', v_select_policies;
  end if;

  begin
    insert into public.services (name, slug, price_cents)
    values ('auditoria-preco', 'auditoria-preco', 10);
    raise exception 'AUDIT_FAIL preço sem moeda foi aceito';
  exception
    when check_violation then
      null;
  end;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) values
    (
      '00000000-0000-0000-0000-000000000000', v_client,
      'authenticated', 'authenticated', 'audit-cliente@example.com',
      extensions.crypt('password', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"],"role":"cliente"}'::jsonb,
      '{}'::jsonb, now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_pro,
      'authenticated', 'authenticated', 'audit-pro@example.com',
      extensions.crypt('password', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"],"role":"cliente"}'::jsonb,
      '{}'::jsonb, now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_ops,
      'authenticated', 'authenticated', 'audit-ops@example.com',
      extensions.crypt('password', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"],"role":"operacao"}'::jsonb,
      '{}'::jsonb, now(), now(), '', '', '', ''
    );

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.set_app_role(v_pro, 'profissional');

  insert into public.cities (id, name, slug) values (v_city, 'Austin', 'austin-audit');
  insert into public.services (id, name, slug, price_cents, currency)
  values (v_service, 'Detox', 'detox-audit', 10000, 'USD');

  update public.professionals
  set active = true, display_name = 'Pro'
  where profile_id = v_pro
  returning id into v_professional;

  insert into public.professional_services (professional_id, service_id)
  values (v_professional, v_service);
  insert into public.professional_cities (professional_id, city_id)
  values (v_professional, v_city);
  insert into public.schedule_connections (professional_id, provider, status)
  values (v_professional, 'acuity', 'pending');

  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_client,
      'role', 'authenticated',
      'app_metadata', json_build_object('role', 'cliente')
    )::text,
    true
  );
  execute 'set local role authenticated';

  begin
    insert into public.bookings (
      client_id, professional_id, service_id, city_id, provider, starts_at
    ) values (
      v_client, v_professional, v_service, v_city, 'acuity', now()
    );
    raise exception 'AUDIT_FAIL cliente inseriu reserva direto';
  exception
    when insufficient_privilege then
      null;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_booking := public.open_booking_intent(
    v_client, v_professional, v_service, v_city, now() + interval '2 days'
  );
  v_stuck := public.open_booking_intent(
    v_client, v_professional, v_service, v_city, now() + interval '3 days'
  );

  perform public.mark_provider_confirmed(v_booking, 'acuity-audit-1');

  select starts_at into v_previous from public.bookings where id = v_booking;
  v_next := v_previous + interval '1 day';
  perform public.mark_rescheduled(v_booking, v_next);
  if not exists (
    select 1
    from public.booking_events
    where booking_id = v_booking
      and event_type = 'rescheduled'
      and from_starts_at = v_previous
      and to_starts_at = v_next
      and origin = 'platform'
  ) then
    raise exception 'AUDIT_FAIL histórico de reagendamento incompleto';
  end if;
  if (select count(*) from public.bookings where client_id = v_client) <> 2 then
    raise exception 'AUDIT_FAIL reagendamento criou reserva extra';
  end if;

  v_closed := public.open_booking_intent(
    v_client, v_professional, v_service, v_city, now() + interval '5 days'
  );
  perform public.mark_cancelled(v_closed);
  begin
    perform public.mark_charge_created(v_closed, 'ch_closed', 10000, 'USD');
    raise exception 'AUDIT_FAIL horário não confirmado abriu cobrança';
  exception
    when invalid_parameter_value then
      null;
  end;

  begin
    perform public.mark_charge_created(v_booking, 'ch_bad', 1, 'USD');
    raise exception 'AUDIT_FAIL aceitou valor diferente do catálogo';
  exception
    when invalid_parameter_value then
      null;
  end;

  perform public.mark_charge_created(v_booking, 'ch_audit_1', 10000, 'USD');

  v_event := public.record_payment_event('stripe', 'evt_audit_stuck', v_stuck, '{}'::jsonb);
  perform public.record_payment_event('stripe', 'evt_audit_1', v_booking, '{}'::jsonb);
  v_retried := public.retry_unapplied_payment_events();
  if v_retried <> 1 then
    raise exception 'AUDIT_FAIL retry aplicou % eventos, esperado 1', v_retried;
  end if;

  if not exists (
    select 1 from private.inbound_events
    where id = v_event and last_error is not null and applied_at is null
  ) then
    raise exception 'AUDIT_FAIL evento permanente não foi isolado';
  end if;

  perform public.apply_payment_event(
    public.record_payment_event('stripe', 'evt_audit_1', v_booking, '{}'::jsonb)
  );

  select count(*) into v_charges
  from private.ledger_entries
  where booking_id = v_booking and kind = 'charge_confirmed';
  if v_charges <> 1 then
    raise exception 'AUDIT_FAIL cobrança duplicada: %', v_charges;
  end if;

  select amount_cents into v_commission
  from private.ledger_entries
  where booking_id = v_booking and kind = 'commission';
  if v_commission <> 2000 then
    raise exception 'AUDIT_FAIL comissão % em vez de 2000', v_commission;
  end if;

  select saga_status into v_status from public.bookings where id = v_booking;
  if v_status <> 'paid' then
    raise exception 'AUDIT_FAIL status depois do pagamento: %', v_status;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_pro,
      'role', 'authenticated',
      'app_metadata', json_build_object('role', 'profissional')
    )::text,
    true
  );
  execute 'set local role authenticated';

  begin
    perform public.authorize_payout(v_booking);
    raise exception 'AUDIT_FAIL profissional autorizou repasse';
  exception
    when insufficient_privilege then
      null;
  end;

  execute 'reset role';
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_client,
      'role', 'authenticated',
      'app_metadata', json_build_object('role', 'cliente')
    )::text,
    true
  );
  execute 'set local role authenticated';
  perform public.confirm_attendance(v_booking);
  execute 'reset role';

  select count(*) into v_rewards from public.reward_grants where booking_id = v_booking;
  if v_rewards <> 1 then
    raise exception 'AUDIT_FAIL rewards: %', v_rewards;
  end if;

  select saga_status into v_status from public.bookings where id = v_booking;
  if v_status <> 'paid' then
    raise exception 'AUDIT_FAIL confirmação mudou o status para %', v_status;
  end if;

  execute 'reset role';
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_ops,
      'role', 'authenticated',
      'app_metadata', json_build_object('role', 'operacao')
    )::text,
    true
  );
  execute 'set local role authenticated';
  perform public.authorize_payout(v_booking);
  perform public.authorize_payout(v_booking);

  select paid_cents into v_paid
  from public.finance_report()
  where booking_id = v_booking;
  if v_paid <> 10000 then
    raise exception 'AUDIT_FAIL relatório paid_cents %', v_paid;
  end if;

  execute 'reset role';

  select count(*) into v_released
  from private.ledger_entries
  where booking_id = v_booking and kind = 'payout_released';
  if v_released <> 0 then
    raise exception 'AUDIT_FAIL repasse marcado como pago sem provedor: %', v_released;
  end if;

  execute 'reset role';
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_client,
      'role', 'authenticated',
      'app_metadata', json_build_object('role', 'cliente')
    )::text,
    true
  );
  execute 'set local role authenticated';

  begin
    perform public.finance_report();
    raise exception 'AUDIT_FAIL cliente leu o relatório';
  exception
    when insufficient_privilege then
      null;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_cancel := public.open_booking_intent(
    v_client, v_professional, v_service, v_city, now() + interval '4 days'
  );
  perform public.mark_provider_confirmed(v_cancel, 'acuity-audit-cancel');
  perform public.mark_charge_created(v_cancel, 'ch_audit_cancel', 10000, 'USD');
  perform public.apply_payment_event(
    public.record_payment_event('stripe', 'evt_audit_cancel', v_cancel, '{}'::jsonb)
  );
  perform public.mark_cancelled(v_cancel);

  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_client,
      'role', 'authenticated',
      'app_metadata', json_build_object('role', 'cliente')
    )::text,
    true
  );
  execute 'set local role authenticated';
  begin
    perform public.confirm_attendance(v_cancel);
    raise exception 'AUDIT_FAIL cancelada confirmou';
  exception
    when invalid_parameter_value then
      null;
  end;

  execute 'reset role';
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_ops,
      'role', 'authenticated',
      'app_metadata', json_build_object('role', 'operacao')
    )::text,
    true
  );
  execute 'set local role authenticated';
  begin
    perform public.authorize_payout(v_cancel);
    raise exception 'AUDIT_FAIL cancelada liberou repasse';
  exception
    when invalid_parameter_value then
      null;
  end;

  execute 'reset role';
  select count(*) into v_rewards from public.reward_grants where booking_id = v_cancel;
  if v_rewards <> 0 then
    raise exception 'AUDIT_FAIL cancelada pontuou %', v_rewards;
  end if;
  select count(*) into v_released
  from private.ledger_entries
  where booking_id = v_cancel and kind = 'payout_released';
  if v_released <> 0 then
    raise exception 'AUDIT_FAIL cancelada tem repasse liberado';
  end if;

  raise exception 'AUDIT_OK';
end;
$audit$;
