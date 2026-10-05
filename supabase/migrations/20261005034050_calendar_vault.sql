-- Token de agenda no Vault. A função de leitura não vai para a Data API do app.
-- O retry de pagamento só reprocessa evento da Stripe, para não tratar resposta
-- de agenda como cobrança.

create or replace function private.store_calendar_secret(
  p_connection_id uuid,
  p_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_created uuid;
begin
  if not private.is_service() then
    raise exception 'gravar token de agenda exige service_role' using errcode = '42501';
  end if;

  if p_token is null or length(btrim(p_token)) = 0 then
    raise exception 'token vazio' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.schedule_connections where id = p_connection_id
  ) then
    raise exception 'conexão de agenda inexistente' using errcode = 'P0002';
  end if;

  select vault_secret_id into v_existing
  from private.calendar_secrets
  where connection_id = p_connection_id;

  if v_existing is not null then
    perform vault.update_secret(v_existing, p_token);
    return;
  end if;

  v_created := vault.create_secret(
    p_token,
    'calendar-' || p_connection_id::text,
    'token da agenda da profissional'
  );

  insert into private.calendar_secrets (connection_id, vault_secret_id)
  values (p_connection_id, v_created);
end;
$$;

create or replace function private.read_calendar_secret(p_connection_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not private.is_service() then
    raise exception 'ler token de agenda exige service_role' using errcode = '42501';
  end if;

  select s.decrypted_secret into v_token
  from private.calendar_secrets c
  join vault.decrypted_secrets s on s.id = c.vault_secret_id
  where c.connection_id = p_connection_id;

  return v_token;
end;
$$;

create or replace function private.retry_unapplied_payment_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if not private.is_service() then
    raise exception 'reconciliação exige service_role' using errcode = '42501';
  end if;

  for v_id in
    select id
    from private.inbound_events
    where applied_at is null
      and source = 'stripe'
    order by received_at
    for update skip locked
  loop
    perform private.apply_payment_event(v_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function private.store_calendar_secret(uuid, text) from public, anon, authenticated;
revoke all on function private.read_calendar_secret(uuid) from public, anon, authenticated;
grant execute on function private.store_calendar_secret(uuid, text) to postgres, service_role;
grant execute on function private.read_calendar_secret(uuid) to postgres, service_role;

create or replace function public.store_calendar_secret(p_connection_id uuid, p_token text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.store_calendar_secret(p_connection_id, p_token);
end;
$$;

create or replace function public.read_calendar_secret(p_connection_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_token text;
begin
  v_token := private.read_calendar_secret(p_connection_id);
  return v_token;
end;
$$;

revoke all on function public.store_calendar_secret(uuid, text) from public, anon, authenticated;
revoke all on function public.read_calendar_secret(uuid) from public, anon, authenticated;
grant execute on function public.store_calendar_secret(uuid, text) to service_role;
grant execute on function public.read_calendar_secret(uuid) to service_role;
