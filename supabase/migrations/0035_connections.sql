-- 0035_connections.sql — Conexiones: datos del plan y resumen de dispositivos
alter table public.organizations
  add column if not exists plan_name text not null default 'Plan',
  add column if not exists max_contacts int,   -- null = sin límite
  add column if not exists max_agents int,
  add column if not exists max_devices int;

create or replace function public.connections_overview() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'plan_name', (select plan_name from public.organizations where id = public.current_org_id()),
    'max_contacts', (select max_contacts from public.organizations where id = public.current_org_id()),
    'max_agents', (select max_agents from public.organizations where id = public.current_org_id()),
    'max_devices', (select max_devices from public.organizations where id = public.current_org_id()),
    'contacts', (select count(*) from public.contacts),
    'agents', (select count(*) from public.profiles),
    'devices', (select count(*) from public.channels),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'phone_number', c.phone_number, 'provider', c.provider, 'status', c.status,
        'groups', (select count(*) from public.wa_groups g where g.channel_id = c.id)
      ) order by c.created_at) from public.channels c), '[]'::jsonb)
  )
$$;
revoke execute on function public.connections_overview() from public, anon;
grant execute on function public.connections_overview() to authenticated;
