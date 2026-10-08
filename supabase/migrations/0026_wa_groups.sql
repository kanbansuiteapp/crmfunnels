-- 0026_wa_groups.sql — grupos, comunidades y canales de WhatsApp de cada dispositivo
create table public.wa_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  jid text not null,                       -- identificador del grupo en WhatsApp
  name text not null,
  origin text not null default 'import',   -- 'import' | 'created'
  type text not null default 'group' check (type in ('group', 'community', 'channel')),
  clicks int not null default 0,
  admins int not null default 0,
  participants int not null default 0,
  scheduled_messages int not null default 0,
  capacity int,                            -- máximo de participantes (null = sin dato)
  auto_capacity boolean not null default false,  -- interruptor de la columna Capacidad
  invite_link text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, jid)
);
create index on public.wa_groups (organization_id, created_at desc);
alter table public.wa_groups enable row level security;
revoke all on public.wa_groups from anon;
revoke insert, update, delete on public.wa_groups from authenticated;
create policy "wa_groups_read" on public.wa_groups for select to authenticated
  using (organization_id = (select public.current_org_id()));

-- interruptor "Capacidad" de la tabla (solo administradores)
create or replace function public.set_group_capacity(p_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  update public.wa_groups set auto_capacity = coalesce(p_on, false), updated_at = now()
   where id = p_id and organization_id = public.current_org_id();
  if not found then raise exception 'Grupo no encontrado'; end if;
end $$;
revoke execute on function public.set_group_capacity(uuid, boolean) from public, anon;
grant execute on function public.set_group_capacity(uuid, boolean) to authenticated;
