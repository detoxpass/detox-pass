-- Catálogo. Escrita só da operação, via RLS.
-- Profissional inativa não aparece para cliente.
-- Segredo de agenda não fica nestas tabelas.

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.specialties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  display_name text not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.professional_specialties (
  professional_id uuid not null references public.professionals (id) on delete cascade,
  specialty_id uuid not null references public.specialties (id) on delete cascade,
  primary key (professional_id, specialty_id)
);

create table public.professional_services (
  professional_id uuid not null references public.professionals (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  primary key (professional_id, service_id)
);

create table public.professional_cities (
  professional_id uuid not null references public.professionals (id) on delete cascade,
  city_id uuid not null references public.cities (id) on delete cascade,
  primary key (professional_id, city_id)
);

create table public.schedule_connections (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  provider text not null check (provider in ('acuity', 'square', 'wix', 'zenoti', 'mindbody')),
  external_resource_id text,
  status text not null default 'pending' check (
    status in ('pending', 'tested', 'unsupported', 'homologated')
  ),
  created_at timestamptz not null default now(),
  unique (professional_id, provider)
);

comment on column public.schedule_connections.status is
  'Homologada só depois de teste autenticado. A migration não promove status.';

create table private.calendar_secrets (
  connection_id uuid primary key references public.schedule_connections (id) on delete cascade,
  vault_secret_id uuid not null,
  created_at timestamptz not null default now()
);

comment on table private.calendar_secrets is
  'Aponta para o Vault. O token em si não fica em public.';

create index professionals_active_idx on public.professionals (active);
create index schedule_connections_professional_idx
  on public.schedule_connections (professional_id);

alter table public.cities enable row level security;
alter table public.cities force row level security;
alter table public.specialties enable row level security;
alter table public.specialties force row level security;
alter table public.services enable row level security;
alter table public.services force row level security;
alter table public.professionals enable row level security;
alter table public.professionals force row level security;
alter table public.professional_specialties enable row level security;
alter table public.professional_specialties force row level security;
alter table public.professional_services enable row level security;
alter table public.professional_services force row level security;
alter table public.professional_cities enable row level security;
alter table public.professional_cities force row level security;
alter table public.schedule_connections enable row level security;
alter table public.schedule_connections force row level security;

grant select, insert, update, delete on public.cities, public.specialties, public.services
  to authenticated, service_role;

grant select, insert, update, delete on public.professionals to authenticated, service_role;

grant select, insert, update, delete on
  public.professional_specialties,
  public.professional_services,
  public.professional_cities,
  public.schedule_connections
  to authenticated, service_role;

grant select, insert, update, delete on private.calendar_secrets to service_role;

create policy catalog_select_authenticated
  on public.cities for select to authenticated
  using (true);

create policy catalog_write_operacao
  on public.cities for all to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');

create policy specialties_select_authenticated
  on public.specialties for select to authenticated
  using (true);

create policy specialties_write_operacao
  on public.specialties for all to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');

create policy services_select_authenticated
  on public.services for select to authenticated
  using (true);

create policy services_write_operacao
  on public.services for all to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');

create policy professionals_select_visible
  on public.professionals for select to authenticated
  using (
    active
    or profile_id = (select auth.uid())
    or (select public.current_app_role()) = 'operacao'
  );

create policy professionals_write_operacao
  on public.professionals for all to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');

create policy professional_specialties_select
  on public.professional_specialties for select to authenticated
  using (
    exists (
      select 1
      from public.professionals p
      where p.id = professional_id
        and (
          p.active
          or p.profile_id = (select auth.uid())
          or (select public.current_app_role()) = 'operacao'
        )
    )
  );

create policy professional_specialties_write
  on public.professional_specialties for all to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');

create policy professional_services_select
  on public.professional_services for select to authenticated
  using (
    exists (
      select 1
      from public.professionals p
      where p.id = professional_id
        and (
          p.active
          or p.profile_id = (select auth.uid())
          or (select public.current_app_role()) = 'operacao'
        )
    )
  );

create policy professional_services_write
  on public.professional_services for all to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');

create policy professional_cities_select
  on public.professional_cities for select to authenticated
  using (
    exists (
      select 1
      from public.professionals p
      where p.id = professional_id
        and (
          p.active
          or p.profile_id = (select auth.uid())
          or (select public.current_app_role()) = 'operacao'
        )
    )
  );

create policy professional_cities_write
  on public.professional_cities for all to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');

create policy schedule_connections_select
  on public.schedule_connections for select to authenticated
  using (
    exists (
      select 1
      from public.professionals p
      where p.id = professional_id
        and (
          p.profile_id = (select auth.uid())
          or (select public.current_app_role()) = 'operacao'
          or p.active
        )
    )
  );

create policy schedule_connections_write
  on public.schedule_connections for all to authenticated
  using ((select public.current_app_role()) = 'operacao')
  with check ((select public.current_app_role()) = 'operacao');
