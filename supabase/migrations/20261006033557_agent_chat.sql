-- Busca do agente e a conversa da própria cliente.
-- A função é security invoker: a RLS de profissional ativa continua valendo.

create extension if not exists pg_trgm with schema extensions;

create index if not exists professionals_display_name_trgm
  on public.professionals using gin (display_name extensions.gin_trgm_ops);

create index if not exists services_name_trgm
  on public.services using gin (name extensions.gin_trgm_ops);

create index if not exists cities_name_trgm
  on public.cities using gin (name extensions.gin_trgm_ops);

create index if not exists specialties_name_trgm
  on public.specialties using gin (name extensions.gin_trgm_ops);

create or replace function public.search_professionals(
  p_query text,
  p_service_ids uuid[],
  p_city_ids uuid[],
  p_specialty_ids uuid[],
  p_limit integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_query text := left(btrim(coalesce(p_query, '')), 80);
  v_like text;
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 8);
  v_services uuid[] := coalesce(p_service_ids, '{}'::uuid[]);
  v_cities uuid[] := coalesce(p_city_ids, '{}'::uuid[]);
  v_specialties uuid[] := coalesce(p_specialty_ids, '{}'::uuid[]);
  v_known_services uuid[];
  v_known_cities uuid[];
  v_known_specialties uuid[];
  v_unknown uuid[];
  v_matches jsonb;
begin
  v_like := replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_');

  select coalesce(array_agg(id), '{}'::uuid[]) into v_known_services
  from public.services
  where id = any(v_services);

  select coalesce(array_agg(id), '{}'::uuid[]) into v_known_cities
  from public.cities
  where id = any(v_cities);

  select coalesce(array_agg(id), '{}'::uuid[]) into v_known_specialties
  from public.specialties
  where id = any(v_specialties);

  select coalesce(array_agg(id), '{}'::uuid[]) into v_unknown
  from (
    select unnest(v_services || v_cities || v_specialties) as id
  ) ids
  where id is not null
    and id <> all(v_known_services)
    and id <> all(v_known_cities)
    and id <> all(v_known_specialties);

  with people as (
    select
      p.id,
      p.display_name,
      p.portrait_path,
      p.schedule_mode,
      exists (
        select 1 from public.professional_services ps
        where ps.professional_id = p.id and ps.service_id = any(v_known_services)
      ) as has_service,
      exists (
        select 1 from public.professional_cities pc
        where pc.professional_id = p.id and pc.city_id = any(v_known_cities)
      ) as has_city,
      exists (
        select 1 from public.professional_specialties psp
        where psp.professional_id = p.id and psp.specialty_id = any(v_known_specialties)
      ) as has_specialty,
      (
        v_query = ''
        or lower(p.display_name) = lower(v_query)
        or p.display_name ilike '%' || v_like || '%' escape '\'
        or extensions.similarity(p.display_name, v_query) > 0.35
        or exists (
          select 1
          from public.professional_services ps
          join public.services s on s.id = ps.service_id
          where ps.professional_id = p.id
            and (
              s.name ilike '%' || v_like || '%' escape '\'
              or extensions.similarity(s.name, v_query) > 0.35
            )
        )
        or exists (
          select 1
          from public.professional_cities pc
          join public.cities c on c.id = pc.city_id
          where pc.professional_id = p.id
            and (
              c.name ilike '%' || v_like || '%' escape '\'
              or extensions.similarity(c.name, v_query) > 0.35
            )
        )
        or exists (
          select 1
          from public.professional_specialties psp
          join public.specialties sp on sp.id = psp.specialty_id
          where psp.professional_id = p.id
            and (
              sp.name ilike '%' || v_like || '%' escape '\'
              or extensions.similarity(sp.name, v_query) > 0.35
            )
        )
      ) as text_hit
    from public.professionals p
    where p.active
  )
  select coalesce(jsonb_agg(row_to_json(picked)::jsonb), '[]'::jsonb)
    into v_matches
  from (
    select
      people.id,
      people.display_name,
      people.portrait_path,
      people.schedule_mode,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id, 'name', s.name, 'price_cents', s.price_cents, 'currency', s.currency
        ) order by s.name)
        from public.professional_services ps
        join public.services s on s.id = ps.service_id
        where ps.professional_id = people.id
      ), '[]'::jsonb) as services,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
        from public.professional_cities pc
        join public.cities c on c.id = pc.city_id
        where pc.professional_id = people.id
      ), '[]'::jsonb) as cities,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', sp.id, 'name', sp.name) order by sp.name)
        from public.professional_specialties psp
        join public.specialties sp on sp.id = psp.specialty_id
        where psp.professional_id = people.id
      ), '[]'::jsonb) as specialties
    from people
    where (cardinality(v_known_services) = 0 or people.has_service)
      and (cardinality(v_known_cities) = 0 or people.has_city)
      and (cardinality(v_known_specialties) = 0 or people.has_specialty)
      and people.text_hit
    order by
      case
        when v_query <> '' and lower(people.display_name) = lower(v_query) then 0
        when v_query <> '' and people.display_name ilike '%' || v_like || '%' escape '\' then 1
        when cardinality(v_known_services) > 0 and cardinality(v_known_cities) > 0 and people.has_service and people.has_city then 2
        when cardinality(v_known_services) > 0 and people.has_service then 3
        when cardinality(v_known_cities) > 0 and people.has_city then 4
        when cardinality(v_known_specialties) > 0 and people.has_specialty then 5
        else 6
      end,
      people.display_name
    limit v_limit
  ) picked;

  return jsonb_build_object(
    'matches', v_matches,
    'unknown_ids', to_jsonb(v_unknown)
  );
end;
$$;

revoke all on function public.search_professionals(text, uuid[], uuid[], uuid[], integer) from public, anon;
grant execute on function public.search_professionals(text, uuid[], uuid[], uuid[], integer) to authenticated, service_role;

comment on function public.search_professionals(text, uuid[], uuid[], uuid[], integer) is
  'Busca profissionais ativas. Não alarga o recorte. O alargamento fica na função chat.';

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  body text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  from_audio boolean not null default false,
  created_at timestamptz not null default now()
);

create index chat_messages_thread_idx
  on public.chat_messages (thread_id, created_at);

comment on table public.chat_messages is
  'Mensagem da conversa. Não guarda áudio nem token de horário.';

alter table public.chat_threads enable row level security;
alter table public.chat_threads force row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_messages force row level security;

revoke all on table public.chat_threads from public, anon, authenticated;
revoke all on table public.chat_messages from public, anon, authenticated;
grant select, insert on table public.chat_threads to authenticated;
grant select, insert on table public.chat_messages to authenticated;
grant select, insert, update, delete on table public.chat_threads to service_role;
grant select, insert, update, delete on table public.chat_messages to service_role;

create policy chat_threads_select_own
  on public.chat_threads for select to authenticated
  using (profile_id = (select auth.uid()));

create policy chat_threads_insert_own
  on public.chat_threads for insert to authenticated
  with check (profile_id = (select auth.uid()));

create policy chat_messages_select_own
  on public.chat_messages for select to authenticated
  using (
    profile_id = (select auth.uid())
    and exists (
      select 1 from public.chat_threads t
      where t.id = thread_id and t.profile_id = (select auth.uid())
    )
  );

create policy chat_messages_insert_own
  on public.chat_messages for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and exists (
      select 1 from public.chat_threads t
      where t.id = thread_id and t.profile_id = (select auth.uid())
    )
  );
