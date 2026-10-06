-- O wrapper público é security invoker. Sem execute em private,
-- a operação recebe permission denied antes da checagem de papel.
-- A função continua recusando quem não é operação.

grant execute on function private.list_accounts() to authenticated;
