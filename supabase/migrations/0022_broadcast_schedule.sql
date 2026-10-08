-- 0022_broadcast_schedule.sql — envío masivo programable (fecha y hora) desde el asistente de 3 pasos
alter table public.broadcasts add column scheduled_at timestamptz;

-- p_scheduled_at null = enviar ya; con fecha futura, el worker no toca la campaña hasta esa hora
create or replace function public.create_broadcast(
  p_name text, p_channel uuid, p_message text, p_tag uuid, p_per_minute int, p_scheduled_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare bid uuid;
begin
  bid := public.create_broadcast(p_name, p_channel, p_message, p_tag, p_per_minute);
  update public.broadcasts
     set status = 'sending', started_at = now(),
         scheduled_at = case when p_scheduled_at > now() then p_scheduled_at end
   where id = bid;
  return bid;
end $$;

revoke execute on function public.create_broadcast(text, uuid, text, uuid, int, timestamptz) from public, anon;
grant execute on function public.create_broadcast(text, uuid, text, uuid, int, timestamptz) to authenticated;
