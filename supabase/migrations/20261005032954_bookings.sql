-- Reserva é a saga. authenticated não recebe insert/update/delete.
-- Dinheiro não mora aqui. external_charge_ref é opaco de propósito:
-- o modelo de objetos do Stripe continua em aberto.

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id),
  professional_id uuid not null references public.professionals (id),
  service_id uuid not null references public.services (id),
  city_id uuid not null references public.cities (id),
  provider text not null check (provider in ('acuity', 'square', 'wix', 'zenoti', 'mindbody')),
  saga_status text not null default 'intent' check (saga_status in (
    'intent',
    'provider_confirmed',
    'charge_created',
    'paid',
    'cancelled',
    'compensation_required',
    'compensated',
    'payout_released'
  )),
  starts_at timestamptz not null,
  external_booking_id text,
  external_charge_ref text,
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index bookings_provider_external_uidx
  on public.bookings (provider, external_booking_id)
  where external_booking_id is not null;

create index bookings_client_idx on public.bookings (client_id);
create index bookings_professional_idx on public.bookings (professional_id);
create index bookings_saga_status_idx on public.bookings (saga_status);

create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  created_at timestamptz not null default now()
);

create index booking_events_booking_idx on public.booking_events (booking_id, created_at);

create table public.attendance_confirmations (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  confirmed_by uuid not null references public.profiles (id),
  confirmed_at timestamptz not null default now()
);

comment on table public.attendance_confirmations is
  'Confirmação da cliente. Não libera payout.';

alter table public.bookings enable row level security;
alter table public.bookings force row level security;
alter table public.booking_events enable row level security;
alter table public.booking_events force row level security;
alter table public.attendance_confirmations enable row level security;
alter table public.attendance_confirmations force row level security;

grant select on public.bookings to authenticated;
grant select, insert, update, delete on public.bookings to service_role;
grant select on public.booking_events to authenticated;
grant select, insert, update, delete on public.booking_events to service_role;
grant select on public.attendance_confirmations to authenticated;
grant select, insert, update, delete on public.attendance_confirmations to service_role;

create policy bookings_select_parties
  on public.bookings for select to authenticated
  using (
    client_id = (select auth.uid())
    or (select public.current_app_role()) = 'operacao'
    or exists (
      select 1
      from public.professionals p
      where p.id = professional_id
        and p.profile_id = (select auth.uid())
    )
  );

create policy booking_events_select_parties
  on public.booking_events for select to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and (
          b.client_id = (select auth.uid())
          or (select public.current_app_role()) = 'operacao'
          or exists (
            select 1
            from public.professionals p
            where p.id = b.professional_id
              and p.profile_id = (select auth.uid())
          )
        )
    )
  );

create policy confirmations_select_parties
  on public.attendance_confirmations for select to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and (
          b.client_id = (select auth.uid())
          or (select public.current_app_role()) = 'operacao'
          or exists (
            select 1
            from public.professionals p
            where p.id = b.professional_id
              and p.profile_id = (select auth.uid())
          )
        )
    )
  );
