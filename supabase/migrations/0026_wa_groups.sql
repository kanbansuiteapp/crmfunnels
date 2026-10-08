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
