-- 0037_saas.sql — SaaS: el dueño de la plataforma crea empresas con límites; los vendedores entran con número y contraseña

-- Empresas: se pueden suspender
alter table public.organizations add column if not exists active boolean not null default true;

-- Vendedores: su número de WhatsApp es su usuario (único en toda la plataforma)
alter table public.profiles add column if not exists phone text;
create unique index if not exists profiles_phone_key on public.profiles (phone) where phone is not null;

-- Dueños de la plataforma (sin acceso directo desde el cliente)
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- Una empresa suspendida no ve nada: toda la RLS depende de esta función
create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.organization_id from public.profiles p
  join public.organizations o on o.id = p.organization_id
  where p.id = auth.uid() and o.active
$$;

-- Ya no hay registro libre: las empresas las crea la plataforma
revoke execute on function public.bootstrap_organization(text, text) from public, anon, authenticated;

-- Datos iniciales de una empresa nueva (solo service_role)
create or replace function public.seed_organization(p_org uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pipe uuid; won_tag uuid;
  stage_names text[] := array['Nuevo','Contactado','Propuesta','Ganado','Perdido'];
  i int;
begin
  insert into public.tags (organization_id, name, color) values (p_org, 'Ganado', '#16a34a') returning id into won_tag;
  insert into public.pipelines (organization_id, name) values (p_org, 'Ventas') returning id into pipe;
  for i in 1..array_length(stage_names, 1) loop
    insert into public.stages (organization_id, pipeline_id, name, order_position, associated_tag_id)
    values (p_org, pipe, stage_names[i], i - 1, case when stage_names[i] = 'Ganado' then won_tag end);
  end loop;
  return pipe;
end $$;
revoke execute on function public.seed_organization(uuid) from public, anon, authenticated;
grant execute on function public.seed_organization(uuid) to service_role;

-- "Total de agentes" cuenta solo vendedores (es lo que limita el plan)
create or replace function public.connections_overview() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'plan_name', (select plan_name from public.organizations where id = public.current_org_id()),
    'max_contacts', (select max_contacts from public.organizations where id = public.current_org_id()),
    'max_agents', (select max_agents from public.organizations where id = public.current_org_id()),
    'max_devices', (select max_devices from public.organizations where id = public.current_org_id()),
    'contacts', (select count(*) from public.contacts),
    'agents', (select count(*) from public.profiles where role = 'agent'),
    'devices', (select count(*) from public.channels),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'phone_number', c.phone_number, 'provider', c.provider, 'status', c.status, 'wa_type', c.wa_type,
        'groups', (select count(*) from public.wa_groups g where g.channel_id = c.id)
      ) order by c.created_at) from public.channels c), '[]'::jsonb)
  )
$$;

-- El dueño actual de la plataforma es la cuenta que ya usa el sistema
insert into public.platform_admins (user_id)
select id from auth.users where email = 'moicoguaman@gmail.com'
on conflict do nothing;
