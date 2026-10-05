-- Reward só marca sessão confirmada. Não escreve no ledger e não libera payout.
-- A regra confirmed_session nasce ativa porque a elegibilidade já é norma.
-- Fórmula de bônus, selo e destaque continua fora desta migration.

create table public.reward_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.reward_grants (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  professional_id uuid not null references public.professionals (id),
  rule_id uuid not null references public.reward_rules (id),
  created_at timestamptz not null default now(),
  unique (booking_id, rule_id)
);

insert into public.reward_rules (code, active)
values ('confirmed_session', true);

alter table public.reward_rules enable row level security;
alter table public.reward_rules force row level security;
alter table public.reward_grants enable row level security;
alter table public.reward_grants force row level security;

grant select on public.reward_rules to authenticated, service_role;
grant insert, update, delete on public.reward_rules to authenticated, service_role;
grant select on public.reward_grants to authenticated, service_role;
grant insert, update, delete on public.reward_grants to service_role;

create policy reward_rules_select_operacao
  on public.reward_rules for select to authenticated
  using ((select public.current_app_role()) = 'operacao');

create policy reward_rules_write_operacao
  on public.reward_rules for all to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');

create policy reward_grants_select
  on public.reward_grants for select to authenticated
  using (
    (select public.current_app_role()) = 'operacao'
    or exists (
      select 1
      from public.professionals p
      where p.id = professional_id
        and p.profile_id = (select auth.uid())
    )
  );
