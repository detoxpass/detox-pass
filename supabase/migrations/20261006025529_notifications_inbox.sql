-- Caixa individual. Uma linha por destinatário. O cliente não insere.
-- intent_opened não vira aviso. Valor só entra se a reserva já tiver amount_cents.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  audience text not null check (audience in ('cliente', 'profissional', 'operacao')),
  kind text not null check (kind in (
    'reservation_reserved',
    'reservation_received',
    'reservation_moved',
    'reservation_cancelled',
    'reservation_needs_review',
    'reservation_compensated',
    'visit_confirmed',
    'charge_started',
    'payment_confirmed',
    'payment_recorded',
    'payout_released',
    'application_received',
    'partner_applied',
    'profile_visible',
    'calendar_chosen'
  )),
  title text not null,
  body text not null,
  href text,
  source_table text not null,
  source_id uuid not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index notifications_once
  on public.notifications (recipient_id, kind, source_id);

create index notifications_inbox_idx
  on public.notifications (recipient_id, created_at desc);

comment on table public.notifications is
  'Aviso in-app de uma pessoa. Ler não altera a linha de outra pessoa.';

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

revoke all on table public.notifications from public, anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
grant select, insert, update, delete on table public.notifications to service_role;

create policy notifications_select_own
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

create policy notifications_update_own
  on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create or replace function private.protect_notice()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.recipient_id is distinct from old.recipient_id
     or new.audience is distinct from old.audience
     or new.kind is distinct from old.kind
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.href is distinct from old.href
     or new.source_table is distinct from old.source_table
     or new.source_id is distinct from old.source_id
     or new.created_at is distinct from old.created_at
     or new.id is distinct from old.id
  then
    raise exception 'só read_at muda no aviso' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger notifications_protect
  before update on public.notifications
  for each row execute function private.protect_notice();

create or replace function private.deliver_notice(
  p_recipient uuid,
  p_audience text,
  p_kind text,
  p_title text,
  p_body text,
  p_href text,
  p_source_table text,
  p_source_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if p_recipient is null or p_source_id is null then
    return;
  end if;

  select role into v_role
  from public.profiles
  where id = p_recipient;

  if v_role is distinct from p_audience then
    return;
  end if;

  insert into public.notifications (
    recipient_id, audience, kind, title, body, href, source_table, source_id
  ) values (
    p_recipient, p_audience, p_kind, p_title, p_body, p_href, p_source_table, p_source_id
  )
  on conflict (recipient_id, kind, source_id) do nothing;
end;
$$;

create or replace function private.notify_booking_event(p_event public.booking_events)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_professional uuid;
  v_amount bigint;
  v_currency text;
  v_service text;
  v_city text;
  v_place text;
  v_money text;
  v_client_href text;
  v_pro_href text;
  v_op_href text;
  v_operator uuid;
  v_client_kind text;
  v_client_title text;
  v_client_body text;
  v_pro_kind text;
  v_pro_title text;
  v_pro_body text;
  v_op_kind text;
  v_op_title text;
  v_op_body text;
  v_notify_client boolean := false;
  v_notify_pro boolean := false;
  v_notify_op boolean := false;
begin
  if p_event.event_type = 'intent_opened' then
    return;
  end if;

  select b.client_id, pr.profile_id, b.amount_cents, b.currency,
         coalesce(sv.name, 'This session'), ci.name
    into v_client, v_professional, v_amount, v_currency, v_service, v_city
  from public.bookings b
  left join public.professionals pr on pr.id = b.professional_id
  left join public.services sv on sv.id = b.service_id
  left join public.cities ci on ci.id = b.city_id
  where b.id = p_event.booking_id;

  if not found then
    return;
  end if;

  v_place := v_service;
  if v_city is not null and length(btrim(v_city)) > 0 then
    v_place := v_place || ' in ' || v_city;
  end if;

  if v_amount is not null and v_currency is not null then
    v_money := v_currency || ' ' || btrim(to_char(v_amount / 100.0, 'FM999999990.00'));
  end if;

  v_client_href := '/sessions/' || p_event.booking_id::text;
  v_pro_href := '/agenda/' || p_event.booking_id::text;
  v_op_href := '/admin/booking/' || p_event.booking_id::text;

  if p_event.event_type = 'provider_confirmed' then
    v_notify_client := true;
    v_client_kind := 'reservation_reserved';
    v_client_title := 'Session reserved';
    v_client_body := v_place || ' is reserved.';
    v_notify_pro := true;
    v_pro_kind := 'reservation_received';
    v_pro_title := 'New reservation';
    v_pro_body := v_place || ' was reserved on your calendar.';
  elsif p_event.event_type = 'cancelled' then
    v_notify_client := true;
    v_client_kind := 'reservation_cancelled';
    v_client_title := 'Session cancelled';
    v_client_body := v_place || ' was cancelled.';
    v_notify_pro := true;
    v_pro_kind := 'reservation_cancelled';
    v_pro_title := 'Reservation cancelled';
    v_pro_body := v_place || ' was cancelled.';
    v_notify_op := true;
    v_op_kind := 'reservation_cancelled';
    v_op_title := 'Reservation cancelled';
    v_op_body := v_place || ' was cancelled.';
  elsif p_event.event_type = 'rescheduled' then
    v_notify_client := true;
    v_client_kind := 'reservation_moved';
    v_client_title := 'Session moved';
    v_client_body := v_place || ' was moved to another time.';
    v_notify_pro := true;
    v_pro_kind := 'reservation_moved';
    v_pro_title := 'Reservation moved';
    v_pro_body := v_place || ' was moved to another time.';
    v_notify_op := true;
    v_op_kind := 'reservation_moved';
    v_op_title := 'Reservation moved';
    v_op_body := v_place || ' was moved to another time.';
  elsif p_event.event_type = 'charge_created' then
    v_notify_client := true;
    v_client_kind := 'charge_started';
    v_client_title := 'Charge started';
    v_client_body := case
      when v_money is null then 'A charge was started for ' || v_place || '.'
      else 'A charge of ' || v_money || ' was started for ' || v_place || '.'
    end;
    v_notify_op := true;
    v_op_kind := 'charge_started';
    v_op_title := 'Charge started';
    v_op_body := v_client_body;
  elsif p_event.event_type = 'paid' then
    v_notify_client := true;
    v_client_kind := 'payment_confirmed';
    v_client_title := 'Payment recorded';
    v_client_body := case
      when v_money is null then 'Payment was recorded for ' || v_place || '.'
      else 'Payment of ' || v_money || ' was recorded for ' || v_place || '.'
    end;
    v_notify_pro := true;
    v_pro_kind := 'payment_recorded';
    v_pro_title := 'Payment recorded';
    v_pro_body := v_client_body;
    v_notify_op := true;
    v_op_kind := 'payment_confirmed';
    v_op_title := 'Payment recorded';
    v_op_body := v_client_body;
  elsif p_event.event_type = 'compensation_required' then
    v_notify_client := true;
    v_client_kind := 'reservation_needs_review';
    v_client_title := 'Reservation needs review';
    v_client_body := v_place || ' needs a review from the team.';
    v_notify_pro := true;
    v_pro_kind := 'reservation_needs_review';
    v_pro_title := 'Reservation needs review';
    v_pro_body := v_place || ' needs a review from the team.';
    v_notify_op := true;
    v_op_kind := 'reservation_needs_review';
    v_op_title := 'Reservation needs review';
    v_op_body := v_place || ' needs a review from the team.';
  elsif p_event.event_type = 'compensated' then
    v_notify_client := true;
    v_client_kind := 'reservation_compensated';
    v_client_title := 'Reservation compensated';
    v_client_body := v_place || ' was marked compensated.';
    v_notify_pro := true;
    v_pro_kind := 'reservation_compensated';
    v_pro_title := 'Reservation compensated';
    v_pro_body := v_place || ' was marked compensated.';
    v_notify_op := true;
    v_op_kind := 'reservation_compensated';
    v_op_title := 'Reservation compensated';
    v_op_body := v_place || ' was marked compensated.';
  elsif p_event.event_type = 'payout_released' then
    v_notify_pro := true;
    v_pro_kind := 'payout_released';
    v_pro_title := 'Payout released';
    v_pro_body := case
      when v_money is null then 'The payout for ' || v_place || ' was released.'
      else 'The payout of ' || v_money || ' for ' || v_place || ' was released.'
    end;
    v_notify_op := true;
    v_op_kind := 'payout_released';
    v_op_title := 'Payout released';
    v_op_body := v_pro_body;
  elsif p_event.event_type = 'attendance_confirmed' then
    v_notify_client := true;
    v_client_kind := 'visit_confirmed';
    v_client_title := 'Visit confirmed';
    v_client_body := 'You confirmed the visit for ' || v_place || '.';
    v_notify_pro := true;
    v_pro_kind := 'visit_confirmed';
    v_pro_title := 'Visit confirmed';
    v_pro_body := 'The client confirmed the visit for ' || v_place || '.';
    v_notify_op := true;
    v_op_kind := 'visit_confirmed';
    v_op_title := 'Visit confirmed';
    v_op_body := 'The client confirmed the visit for ' || v_place || '.';
  else
    return;
  end if;

  if v_notify_client then
    perform private.deliver_notice(
      v_client, 'cliente', v_client_kind, v_client_title, v_client_body,
      v_client_href, 'booking_events', p_event.id
    );
  end if;

  if v_notify_pro then
    perform private.deliver_notice(
      v_professional, 'profissional', v_pro_kind, v_pro_title, v_pro_body,
      v_pro_href, 'booking_events', p_event.id
    );
  end if;

  if v_notify_op then
    for v_operator in
      select id from public.profiles where role = 'operacao'
    loop
      perform private.deliver_notice(
        v_operator, 'operacao', v_op_kind, v_op_title, v_op_body,
        v_op_href, 'booking_events', p_event.id
      );
    end loop;
  end if;
end;
$$;

create or replace function private.fanout_booking_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_booking_event(new);
  return new;
end;
$$;

create trigger booking_events_notify
  after insert on public.booking_events
  for each row execute function private.fanout_booking_event();

create or replace function private.notify_partner_application(p_app private.partner_applications)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_professional uuid;
  v_operator uuid;
begin
  select id into v_professional
  from public.professionals
  where profile_id = p_app.profile_id;

  perform private.deliver_notice(
    p_app.profile_id,
    'profissional',
    'application_received',
    'Application received',
    'Your partner application is under review. Clients will not see this profile until the team approves it.',
    '/dashboard',
    'partner_applications',
    p_app.profile_id
  );

  if v_professional is null then
    return;
  end if;

  for v_operator in
    select id from public.profiles where role = 'operacao'
  loop
    perform private.deliver_notice(
      v_operator,
      'operacao',
      'partner_applied',
      'Partner application',
      'A new partner application is waiting for review.',
      '/admin/therapists/' || v_professional::text,
      'partner_applications',
      p_app.profile_id
    );
  end loop;
end;
$$;

create or replace function private.fanout_partner_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_partner_application(new);
  return new;
end;
$$;

create trigger partner_applications_notify
  after insert on private.partner_applications
  for each row execute function private.fanout_partner_application();

create or replace function private.notify_profile_visible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.active = false and new.active = true then
    perform private.deliver_notice(
      new.profile_id,
      'profissional',
      'profile_visible',
      'Profile visible',
      'Clients can find this profile in search.',
      '/dashboard',
      'professionals',
      new.id
    );
  end if;
  return new;
end;
$$;

create trigger professionals_visible_notify
  after update of active on public.professionals
  for each row execute function private.notify_profile_visible();

create or replace function private.notify_calendar_chosen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text;
begin
  if tg_op = 'UPDATE'
     and old.schedule_mode is null
     and new.schedule_mode is not null then
    v_body := case new.schedule_mode
      when 'internal' then 'This profile uses the Detox Pass calendar.'
      when 'external' then 'This profile uses an external calendar.'
      else 'A calendar choice was saved.'
    end;
    perform private.deliver_notice(
      new.profile_id,
      'profissional',
      'calendar_chosen',
      'Calendar chosen',
      v_body,
      '/agenda',
      'professionals',
      new.id
    );
  end if;
  return new;
end;
$$;

create trigger professionals_calendar_notify
  after update of schedule_mode on public.professionals
  for each row execute function private.notify_calendar_chosen();

revoke all on function private.protect_notice() from public, anon, authenticated;
revoke all on function private.deliver_notice(uuid, text, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function private.notify_booking_event(public.booking_events) from public, anon, authenticated;
revoke all on function private.fanout_booking_event() from public, anon, authenticated;
revoke all on function private.notify_partner_application(private.partner_applications) from public, anon, authenticated;
revoke all on function private.fanout_partner_application() from public, anon, authenticated;
revoke all on function private.notify_profile_visible() from public, anon, authenticated;
revoke all on function private.notify_calendar_chosen() from public, anon, authenticated;

do $$
declare
  v_event public.booking_events;
  v_app private.partner_applications;
  v_pro public.professionals;
  v_body text;
begin
  for v_event in select * from public.booking_events loop
    perform private.notify_booking_event(v_event);
  end loop;

  for v_app in select * from private.partner_applications loop
    perform private.notify_partner_application(v_app);
  end loop;

  for v_pro in
    select * from public.professionals where schedule_mode is not null
  loop
    v_body := case v_pro.schedule_mode
      when 'internal' then 'This profile uses the Detox Pass calendar.'
      when 'external' then 'This profile uses an external calendar.'
      else 'A calendar choice was saved.'
    end;
    perform private.deliver_notice(
      v_pro.profile_id,
      'profissional',
      'calendar_chosen',
      'Calendar chosen',
      v_body,
      '/agenda',
      'professionals',
      v_pro.id
    );
  end loop;
end;
$$;
