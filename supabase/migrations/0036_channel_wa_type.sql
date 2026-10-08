-- 0036_channel_wa_type.sql — tipo de cuenta de WhatsApp de cada dispositivo
-- messenger = WhatsApp normal (grupos, comunidades y canales); business = app WhatsApp Business (solo grupos, sin comunidades ni canales)
alter table public.channels
  add column if not exists wa_type text not null default 'messenger' check (wa_type in ('messenger','business'));
grant select (wa_type) on public.channels to authenticated;

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
        'id', c.id, 'name', c.name, 'phone_number', c.phone_number, 'provider', c.provider, 'status', c.status, 'wa_type', c.wa_type,
        'groups', (select count(*) from public.wa_groups g where g.channel_id = c.id)
      ) order by c.created_at) from public.channels c), '[]'::jsonb)
  )
$$;
