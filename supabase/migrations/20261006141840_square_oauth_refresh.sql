-- Renova o access token OAuth da Square todo dia. O segredo do header
-- fica no Vault com o nome square_refresh_secret e não entra nesta migration.
-- Sem essa linha, o trabalho chama a função e ela recusa.

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    return;
  end if;
  if not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    return;
  end if;

  create extension if not exists pg_cron;
  create extension if not exists pg_net with schema extensions;

  if exists (select 1 from cron.job where jobname = 'square-oauth-refresh') then
    perform cron.unschedule('square-oauth-refresh');
  end if;

  perform cron.schedule(
    'square-oauth-refresh',
    '20 9 * * *',
    $job$
    select net.http_post(
      url := 'https://otddminugslmacdirual.supabase.co/functions/v1/scheduling-square-refresh',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-square-refresh', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'square_refresh_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb
    );
    $job$
  );
end $$;
