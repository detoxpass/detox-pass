-- Invariantes do backend. Roda com `supabase test db` depois do reset local.

begin;

select plan(21);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000101',
    'authenticated', 'authenticated', 'cliente@example.com',
    extensions.crypt('password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"],"role":"cliente"}'::jsonb,
    '{}'::jsonb, now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000102',
    'authenticated', 'authenticated', 'pro@example.com',
    extensions.crypt('password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"],"role":"cliente"}'::jsonb,
    '{}'::jsonb, now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000103',
    'authenticated', 'authenticated', 'ops@example.com',
    extensions.crypt('password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"],"role":"operacao"}'::jsonb,
    '{}'::jsonb, now(), now(), '', '', '', ''
  );

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select public.set_app_role(
  '00000000-0000-0000-0000-000000000102',
  'profissional'
);

insert into public.cities (id, name, slug)
values ('00000000-0000-0000-0000-000000000201', 'Austin', 'austin');
insert into public.services (id, name, slug, price_cents, currency)
values ('00000000-0000-0000-0000-000000000301', 'Detox', 'detox', 10000, 'USD');

update public.professionals
set active = true, display_name = 'Pro'
where profile_id = '00000000-0000-0000-0000-000000000102';

insert into public.professional_services (professional_id, service_id)
select id, '00000000-0000-0000-0000-000000000301'
from public.professionals
where profile_id = '00000000-0000-0000-0000-000000000102';

insert into public.professional_cities (professional_id, city_id)
select id, '00000000-0000-0000-0000-000000000201'
from public.professionals
where profile_id = '00000000-0000-0000-0000-000000000102';

insert into public.schedule_connections (professional_id, provider, status)
select id, 'acuity', 'pending'
from public.professionals
where profile_id = '00000000-0000-0000-0000-000000000102';

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-000000000101',
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'cliente')
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  $$insert into public.bookings (
      client_id, professional_id, service_id, city_id, provider, starts_at
    )
    select
      '00000000-0000-0000-0000-000000000101',
      id,
      '00000000-0000-0000-0000-000000000301',
      '00000000-0000-0000-0000-000000000201',
      'acuity',
      now()
    from public.professionals
    where profile_id = '00000000-0000-0000-0000-000000000102'$$,
  '42501',
  'permission denied for table bookings',
  'cliente não insere reserva direto'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select public.open_booking_intent(
  '00000000-0000-0000-0000-000000000101',
  (select id from public.professionals where profile_id = '00000000-0000-0000-0000-000000000102'),
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000201',
  now() + interval '1 day'
) as booking_id \gset

select public.mark_provider_confirmed(:'booking_id'::uuid, 'acuity-1');

select public.mark_rescheduled(:'booking_id'::uuid, now() + interval '2 days');

select is(
  (select count(*)::int from public.booking_events
    where booking_id = :'booking_id'::uuid
      and event_type = 'rescheduled'
      and from_starts_at is not null
      and to_starts_at is not null
      and from_starts_at <> to_starts_at
      and origin = 'platform'),
  1,
  'reagendamento guarda horário antigo e novo'
);

select is(
  (select count(*)::int from public.bookings),
  1,
  'reagendamento não cria segunda reserva'
);

select throws_ok(
  'select public.mark_charge_created(''' || :'booking_id' || '''::uuid, ''ch_bad'', 1, ''USD'')',
  '22023',
  'valor diferente do preço do serviço',
  'cobrança recusa valor diferente do catálogo'
);

select public.mark_charge_created(:'booking_id'::uuid, 'ch_1', 10000, 'USD');

select public.apply_payment_event(
  public.record_payment_event('stripe', 'evt_1', :'booking_id'::uuid, '{}'::jsonb)
);

select public.apply_payment_event(
  public.record_payment_event('stripe', 'evt_1', :'booking_id'::uuid, '{}'::jsonb)
);

select is(
  (select count(*)::int from private.ledger_entries where booking_id = :'booking_id'::uuid and kind = 'charge_confirmed'),
  1,
  'evento repetido não duplica cobrança'
);

select is(
  (select amount_cents from private.ledger_entries where booking_id = :'booking_id'::uuid and kind = 'commission'),
  2000::bigint,
  'comissão de 20% sai da configuração'
);

select is(
  (select saga_status from public.bookings where id = :'booking_id'::uuid),
  'paid',
  'webhook marca a reserva como paga'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-000000000102',
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'profissional')
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  'select public.authorize_payout(' || :'booking_id' || '::uuid)',
  '42501',
  'só a operação autoriza o repasse',
  'profissional não autoriza o próprio repasse'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-000000000101',
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'cliente')
  )::text,
  true
);
set local role authenticated;

select public.confirm_attendance(:'booking_id'::uuid);
reset role;

select is(
  (select count(*)::int from public.reward_grants where booking_id = :'booking_id'::uuid),
  1,
  'confirmação pontua reward'
);

select is(
  (select saga_status from public.bookings where id = :'booking_id'::uuid),
  'paid',
  'confirmação não libera payout'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-000000000103',
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'operacao')
  )::text,
  true
);
set local role authenticated;

select public.authorize_payout(:'booking_id'::uuid);
select public.authorize_payout(:'booking_id'::uuid);

select is(
  (select paid_cents from public.finance_report() where booking_id = :'booking_id'::uuid),
  10000::bigint,
  'operação lê o valor pago'
);

reset role;

select is(
  (select count(*)::int from private.ledger_entries where booking_id = :'booking_id'::uuid and kind = 'payout_released'),
  1,
  'autorizar duas vezes não duplica o repasse'
);

select is(
  (select saga_status from public.bookings where id = :'booking_id'::uuid),
  'payout_released',
  'operação libera o repasse depois da confirmação'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select public.open_booking_intent(
  '00000000-0000-0000-0000-000000000101',
  (select id from public.professionals where profile_id = '00000000-0000-0000-0000-000000000102'),
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000201',
  now() + interval '3 days'
) as cancelled_id \gset

select public.mark_provider_confirmed(:'cancelled_id'::uuid, 'acuity-2');
select public.mark_charge_created(:'cancelled_id'::uuid, 'ch_2', 10000, 'USD');
select public.apply_payment_event(
  public.record_payment_event('stripe', 'evt_2', :'cancelled_id'::uuid, '{}'::jsonb)
);
select public.mark_cancelled(:'cancelled_id'::uuid);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-000000000101',
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'cliente')
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  'select public.confirm_attendance(''' || :'cancelled_id' || '''::uuid)',
  '22023',
  'reserva cancelada não confirma',
  'cancelada não confirma'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-000000000103',
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'operacao')
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  'select public.authorize_payout(''' || :'cancelled_id' || '''::uuid)',
  '22023',
  'reserva não está paga',
  'cancelada não libera repasse'
);

reset role;

select is(
  (select count(*)::int from public.reward_grants where booking_id = :'cancelled_id'::uuid),
  0,
  'cancelada não pontua'
);

select is(
  (select count(*)::int from private.ledger_entries where booking_id = :'cancelled_id'::uuid and kind = 'payout_released'),
  0,
  'cancelada não tem repasse liberado'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-000000000101',
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'cliente')
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  'select public.finance_report()',
  '42501',
  'relatório financeiro é da operação',
  'cliente não lê o relatório'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select public.open_booking_intent(
  '00000000-0000-0000-0000-000000000101',
  (select id from public.professionals where profile_id = '00000000-0000-0000-0000-000000000102'),
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000201',
  timestamptz '2026-12-01 15:00:00+00'
);

select throws_ok(
  $$select public.open_booking_intent(
    '00000000-0000-0000-0000-000000000101',
    (select id from public.professionals where profile_id = '00000000-0000-0000-0000-000000000102'),
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000201',
    timestamptz '2026-12-01 15:00:00+00'
  )$$,
  '23505',
  'horário já tem reserva em andamento',
  'segundo horário igual não abre outra intenção'
);

select public.mark_connection_tested(
  (select id from public.schedule_connections where provider = 'acuity' limit 1)
);

select is(
  (select status from public.schedule_connections where provider = 'acuity' limit 1),
  'tested',
  'teste autenticado marca tested e não homologada'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-000000000101',
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'cliente')
  )::text,
  true
);
set local role authenticated;

select is(
  (
    with updated as (
      update public.services
      set name = 'bloqueado'
      where id = '00000000-0000-0000-0000-000000000301'
      returning 1
    )
    select count(*)::int from updated
  ),
  0,
  'cliente não altera serviço'
);

select * from finish();
rollback;
