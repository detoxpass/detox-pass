-- Promove o primeiro usuário de operação DESTA conta.
-- Não é migration. Rode no SQL editor do projeto, trocando o e-mail.
-- Não versiona senha, token nem project ref.

update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'operacao')
where email = 'trocar-este-email@example.com';

select set_config('private.allow_role_change', 'on', true);

update public.profiles
set role = 'operacao'
where id = (
  select id from auth.users where email = 'trocar-este-email@example.com'
);
