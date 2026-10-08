-- 0039_reconnect_alerts.sql — avisos cuando un número se desconecta y necesita volver a vincularse
alter table public.channels
  add column if not exists needs_reconnect boolean not null default false,
  add column if not exists disconnected_at timestamptz;
grant select (needs_reconnect, disconnected_at) on public.channels to authenticated;

create or replace function public.connections_overview() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'plan_name', (select plan_name from public.organizations where id = public.current_org_id()),
    'max_contacts', (select max_contacts from public.organizations where id = public.current_org_id()),
    'max_agents', (select max_agents from public.organizations where id = public.current_org_id()),
    'max_devices', (select max_devices from public.organizations where id = public.current_org_id()),
    'contact_limit_hits', (select contact_limit_hits from public.organizations where id = public.current_org_id()),
    'contacts', (select count(*) from public.contacts),
    'agents', (select count(*) from public.profiles where role = 'agent'),
    'devices', (select count(*) from public.channels),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'phone_number', c.phone_number, 'provider', c.provider, 'status', c.status, 'wa_type', c.wa_type,
        'needs_reconnect', c.needs_reconnect,
        'groups', (select count(*) from public.wa_groups g where g.channel_id = c.id)
      ) order by c.created_at) from public.channels c), '[]'::jsonb)
  )
$$;
