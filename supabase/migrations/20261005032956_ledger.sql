-- Ledger append-only e caixa de webhooks. Schema private.
-- Comissão inicial: 2000 bps = 20%, linha de configuração, não constante no código.
-- Moeda fica nula até a operação definir. A função de cobrança exige moeda na reserva.

create table public.marketplace_settings (
  id integer primary key default 1 check (id = 1),
  commission_bps integer not null default 2000 check (commission_bps >= 0 and commission_bps <= 10000),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  updated_at timestamptz not null default now()
);

insert into public.marketplace_settings (id, commission_bps)
values (1, 2000);

alter table public.marketplace_settings enable row level security;
alter table public.marketplace_settings force row level security;

grant select on public.marketplace_settings to authenticated, service_role;
grant update (commission_bps, currency, updated_at) on public.marketplace_settings to authenticated;
grant update, insert, delete on public.marketplace_settings to service_role;

create policy marketplace_settings_select_operacao
  on public.marketplace_settings for select to authenticated
  using ((select public.current_app_role()) = 'operacao');

create policy marketplace_settings_update_operacao
  on public.marketplace_settings for update to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');

create table private.inbound_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  booking_id uuid references public.bookings (id),
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (source, external_id)
);

create index inbound_events_unapplied_idx
  on private.inbound_events (received_at)
  where applied_at is null;

create table private.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  kind text not null check (kind in (
    'charge_confirmed',
    'commission',
    'payout_pending',
    'payout_released',
    'compensation'
  )),
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  inbound_event_id uuid references private.inbound_events (id),
  created_at timestamptz not null default now()
);

create unique index ledger_one_charge_uidx
  on private.ledger_entries (booking_id)
  where kind = 'charge_confirmed';

create unique index ledger_one_commission_uidx
  on private.ledger_entries (booking_id)
  where kind = 'commission';

create unique index ledger_one_pending_uidx
  on private.ledger_entries (booking_id)
  where kind = 'payout_pending';

create unique index ledger_one_released_uidx
  on private.ledger_entries (booking_id)
  where kind = 'payout_released';

create index ledger_entries_booking_idx on private.ledger_entries (booking_id);

comment on table private.ledger_entries is
  'Lançamentos. Pago, pendente e liberado são leitura, não booleano de tela.';

create or replace function private.ledger_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ledger é append-only' using errcode = '42501';
  end if;
  if new.booking_id is distinct from old.booking_id
     or new.kind is distinct from old.kind
     or new.amount_cents is distinct from old.amount_cents
     or new.currency is distinct from old.currency
     or new.inbound_event_id is distinct from old.inbound_event_id then
    raise exception 'ledger é append-only' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger ledger_entries_append_only
  before update or delete on private.ledger_entries
  for each row
  execute function private.ledger_append_only();

grant select, insert, update, delete on private.inbound_events to service_role;
grant select, insert, update, delete on private.ledger_entries to service_role;
