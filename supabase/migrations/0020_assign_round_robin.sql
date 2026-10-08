-- 0020_assign_round_robin.sql — reparto rotativo para el paso "Rotador" de las automatizaciones
-- Asigna la conversación al agente con menos chats abiertos (respeta las líneas asignadas a cada agente).
create or replace function public.assign_round_robin(p_conversation uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid; ch uuid; pick uuid;
begin
  select organization_id, channel_id into org, ch from public.conversations where id = p_conversation;
  if org is null then raise exception 'Conversación no encontrada'; end if;
  select p.id into pick
    from public.profiles p
   where p.organization_id = org and (p.assigned_phone_ids = '{}' or ch = any (p.assigned_phone_ids))
   order by (select count(*) from public.conversations c where c.assignee_id = p.id and c.status = 'open'), p.created_at
   limit 1;
  if pick is null then raise exception 'No hay agentes disponibles'; end if;
  update public.conversations set assignee_id = pick where id = p_conversation;
  return pick;
end $$;
revoke execute on function public.assign_round_robin(uuid) from public, anon, authenticated;
grant execute on function public.assign_round_robin(uuid) to service_role;
