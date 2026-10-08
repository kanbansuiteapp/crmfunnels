-- 0001_core.sql — esquema núcleo del CRM multi-empresa
create extension if not exists vector;
create extension if not exists pgcrypto;

-- ───────────── utilidades ─────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ───────────── organizaciones y perfiles ─────────────
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Lima',
  max_pipelines int not null default 10,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null default '',
  email text,
  role text not null default 'agent' check (role in ('admin','agent')),
  assigned_phone_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.profiles (organization_id);

create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select organization_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_org_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- ───────────── canales (líneas) ─────────────
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone_number text,
  provider text not null default 'evolution' check (provider in ('evolution','meta')),
  status text not null default 'disconnected',
  created_at timestamptz not null default now()
);
create index on public.channels (organization_id);

-- ───────────── contactos ─────────────
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone_number text not null,
  name text,
  country_code text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, phone_number)
);
create trigger contacts_updated before update on public.contacts
  for each row execute function public.set_updated_at();

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text not null default '#64748b',
  unique (organization_id, name)
);

create table public.contact_tags (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contact_id, tag_id)
);
create index on public.contact_tags (organization_id);

create table public.custom_field_defs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text not null check (type in ('text','number','url','date')),
  unique (organization_id, name)
);

create table public.custom_field_values (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  field_id uuid not null references public.custom_field_defs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  value text,
  primary key (contact_id, field_id)
);
create index on public.custom_field_values (organization_id);

create table public.contact_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  type text not null,            -- link_click, tag_added, stage_changed, ...
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.contact_events (organization_id, contact_id, created_at desc);

-- Trazabilidad: registrar cuando se añade una etiqueta
create or replace function public.log_tag_added() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.contact_events (organization_id, contact_id, type, payload)
  values (new.organization_id, new.contact_id, 'tag_added', jsonb_build_object('tag_id', new.tag_id));
  return new;
end $$;
create trigger contact_tags_log after insert on public.contact_tags
  for each row execute function public.log_tag_added();

-- ───────────── pipelines / kanban ─────────────
create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index on public.pipelines (organization_id);

create or replace function public.enforce_pipeline_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lim int; cnt int;
begin
  select max_pipelines into lim from public.organizations where id = new.organization_id;
  select count(*) into cnt from public.pipelines where organization_id = new.organization_id;
  if cnt >= coalesce(lim, 10) then
    raise exception 'Límite de % pipelines alcanzado', coalesce(lim, 10);
  end if;
  return new;
end $$;
create trigger pipelines_limit before insert on public.pipelines
  for each row execute function public.enforce_pipeline_limit();

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  order_position int not null default 0,
  associated_tag_id uuid references public.tags(id) on delete set null
);
create index on public.stages (pipeline_id, order_position);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  stage_id uuid not null references public.stages(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  assignee_id uuid references public.profiles(id) on delete set null,
  title text not null,
  value numeric(12,2) not null default 0,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.deals (pipeline_id, stage_id, position);
create index on public.deals (assignee_id);
create trigger deals_updated before update on public.deals
  for each row execute function public.set_updated_at();

-- Mueve un deal, reordena ambas columnas y aplica la etiqueta de la etapa destino
create or replace function public.move_deal(p_deal_id uuid, p_stage_id uuid, p_position int)
returns void language plpgsql security invoker set search_path = '' as $$
declare d public.deals; tag uuid;
begin
  select * into d from public.deals where id = p_deal_id for update;
  if not found then raise exception 'Deal no encontrado'; end if;
  if not exists (select 1 from public.stages where id = p_stage_id and pipeline_id = d.pipeline_id) then
    raise exception 'Etapa inválida para este pipeline';
  end if;

  -- cerrar hueco en la etapa origen
  update public.deals set position = position - 1
   where stage_id = d.stage_id and position > d.position and id <> d.id;
  -- abrir hueco en destino
  update public.deals set position = position + 1
   where stage_id = p_stage_id and position >= p_position and id <> d.id;
  update public.deals set stage_id = p_stage_id, position = p_position where id = d.id;

  if d.stage_id <> p_stage_id then
    select associated_tag_id into tag from public.stages where id = p_stage_id;
    if tag is not null then
      insert into public.contact_tags (contact_id, tag_id, organization_id)
      values (d.contact_id, tag, d.organization_id) on conflict do nothing;
    end if;
    insert into public.contact_events (organization_id, contact_id, type, payload)
    values (d.organization_id, d.contact_id, 'stage_changed',
            jsonb_build_object('from', d.stage_id, 'to', p_stage_id, 'deal_id', d.id));
  end if;
end $$;

-- ───────────── conversaciones y mensajes ─────────────
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  assignee_id uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open','closed')),
  ai_enabled boolean not null default false,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (channel_id, contact_id)
);
create index on public.conversations (organization_id, assignee_id, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  direction text not null check (direction in ('in','out')),
  by_ai boolean not null default false,
  content text,
  media_url text,
  status text not null default 'sent',
  timestamp timestamptz not null default now()
);
create index on public.messages (conversation_id, timestamp);

-- ───────────── automatizaciones y webhooks ─────────────
create table public.automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  trigger_type text not null check (trigger_type in ('incoming_message','tag_added','inactivity','webhook')),
  conditions jsonb not null default '{}',
  actions_tree_json jsonb not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.automations (organization_id, trigger_type);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  status text not null default 'pending',
  log jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table public.webhooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  name text not null,
  url text,
  secret text,                  -- solo service_role
  created_at timestamptz not null default now()
);

-- ───────────── agentes IA y conocimiento ─────────────
create table public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  system_prompt text not null default '',
  model text,
  api_key text,                 -- solo service_role
  ai_key_set boolean generated always as (api_key is not null) stored,
  created_at timestamptz not null default now()
);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  kind text not null check (kind in ('pdf','text','url','faq')),
  title text,
  created_at timestamptz not null default now()
);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  content text not null,
  embedding vector(1536)
);
create index on public.knowledge_chunks using hnsw (embedding vector_cosine_ops);

-- ───────────── RLS ─────────────
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','profiles','channels','contacts','tags','contact_tags','custom_field_defs',
    'custom_field_values','contact_events','pipelines','stages','deals','conversations','messages',
    'automations','automation_runs','webhooks','ai_agents','knowledge_sources','knowledge_chunks'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;

  -- tablas con CRUD completo para miembros de la org
  foreach t in array array[
    'channels','contacts','tags','contact_tags','custom_field_defs','custom_field_values',
    'contact_events','pipelines','stages','deals','conversations','automations'
  ] loop
    execute format($f$create policy "org_all" on public.%I for all to authenticated
      using (organization_id = (select public.current_org_id()))
      with check (organization_id = (select public.current_org_id()))$f$, t);
  end loop;

  -- solo lectura para el cliente (escritura vía service_role)
  foreach t in array array['messages','automation_runs','knowledge_sources','knowledge_chunks'] loop
    execute format($f$create policy "org_read" on public.%I for select to authenticated
      using (organization_id = (select public.current_org_id()))$f$, t);
  end loop;
end $$;

create policy "own_org" on public.organizations for select to authenticated
  using (id = (select public.current_org_id()));
create policy "org_profiles" on public.profiles for select to authenticated
  using (organization_id = (select public.current_org_id()));

-- tablas con secretos: lectura solo de columnas seguras, solo admin
revoke select on public.webhooks, public.ai_agents from authenticated;
grant select (id, organization_id, direction, name, url, created_at) on public.webhooks to authenticated;
grant select (id, organization_id, name, system_prompt, model, ai_key_set, created_at) on public.ai_agents to authenticated;
create policy "admin_read" on public.webhooks for select to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));
create policy "admin_read" on public.ai_agents for select to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

-- ───────────── Realtime ─────────────
alter publication supabase_realtime add table public.messages, public.conversations, public.deals;
