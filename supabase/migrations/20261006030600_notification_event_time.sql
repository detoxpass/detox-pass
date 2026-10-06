-- A data do aviso de reserva e de cadastro é a data do fato.
-- calendar_chosen e profile_visible nascem na hora em que a caixa grava a linha.

create or replace function private.stamp_notice_time()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if new.source_table = 'booking_events' then
    select created_at into v_at
    from public.booking_events
    where id = new.source_id;
  elsif new.source_table = 'partner_applications' then
    select created_at into v_at
    from private.partner_applications
    where profile_id = new.source_id;
  end if;

  if v_at is not null then
    new.created_at := v_at;
  end if;

  return new;
end;
$$;

drop trigger if exists notifications_stamp_time on public.notifications;

create trigger notifications_stamp_time
  before insert on public.notifications
  for each row execute function private.stamp_notice_time();

revoke all on function private.stamp_notice_time() from public, anon, authenticated;

alter table public.notifications disable trigger notifications_protect;

update public.notifications as notice
set created_at = event.created_at
from public.booking_events as event
where notice.source_table = 'booking_events'
  and notice.source_id = event.id
  and notice.created_at is distinct from event.created_at;

update public.notifications as notice
set created_at = application.created_at
from private.partner_applications as application
where notice.source_table = 'partner_applications'
  and notice.source_id = application.profile_id
  and notice.created_at is distinct from application.created_at;

alter table public.notifications enable trigger notifications_protect;
