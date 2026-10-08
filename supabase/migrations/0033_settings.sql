-- 0033_settings.sql — Configuración: tags (descripción y fecha), campos alfanuméricos, agentes (visibilidad) y plantillas de mensaje

-- Tags
alter table public.tags
  add column if not exists description text,
  add column if not exists created_at timestamptz not null default now();
alter table public.tags add constraint tags_name_len check (char_length(name) between 1 and 100) not valid;
alter table public.tags add constraint tags_description_len check (description is null or char_length(description) <= 500) not valid;

-- Campos personalizados: tipo alfanumérico y nombre de hasta 50 caracteres
alter table public.custom_field_defs drop constraint if exists custom_field_defs_type_check;
alter table public.custom_field_defs add constraint custom_field_defs_type_check
  check (type in ('text','number','url','date','alphanumeric'));
alter table public.custom_field_defs add constraint custom_field_defs_name_len check (char_length(name) between 1 and 50) not valid;

-- Agentes: mostrar nombre al cliente y qué chats ve cada uno
alter table public.profiles
  add column if not exists show_name boolean not null default false,
  add column if not exists chat_visibility text not null default 'assigned' check (chat_visibility in ('assigned','unassigned','all'));

create or replace function public.my_chat_visibility() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select chat_visibility from public.profiles where id = auth.uid()), 'assigned')
$$;
revoke execute on function public.my_chat_visibility() from public, anon;
grant execute on function public.my_chat_visibility() to authenticated;

-- 'assigned' (por defecto) = comportamiento anterior: solo sus chats. 'unassigned' = también los sin asignar. 'all' = todos.
drop policy "conv_select" on public.conversations;
create policy "conv_select" on public.conversations for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.is_org_admin()) or assignee_id = (select auth.uid())
         or (select public.my_chat_visibility()) = 'all'
         or ((select public.my_chat_visibility()) = 'unassigned' and assignee_id is null))
  );
drop policy "conv_update" on public.conversations;
create policy "conv_update" on public.conversations for update to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.is_org_admin()) or assignee_id = (select auth.uid())
         or (select public.my_chat_visibility()) = 'all'
         or ((select public.my_chat_visibility()) = 'unassigned' and assignee_id is null))
  )
  with check (organization_id = (select public.current_org_id()));

-- Plantillas de mensaje (borradores locales; la sincronización con Meta llega después)
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  name text not null check (char_length(name) between 1 and 512),
  category text not null default 'marketing' check (category in ('marketing','utility','authentication')),
  header_type text not null default 'none' check (header_type in ('none','text','image','video','document')),
  header_text text,
  body text not null check (char_length(body) between 1 and 1024),
  footer text check (footer is null or char_length(footer) <= 60),
  variables jsonb not null default '[]',   -- [{ n: 1, field: 'name', example: 'Gabriel' }]
  status text not null default 'draft' check (status in ('draft','pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create index on public.message_templates (organization_id, created_at desc);
alter table public.message_templates enable row level security;
revoke all on public.message_templates from anon;
create policy "org_all" on public.message_templates for all to authenticated
  using (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));
