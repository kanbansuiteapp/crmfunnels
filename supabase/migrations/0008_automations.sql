-- 0008_automations.sql — cola de eventos, runs con espera, disparadores y cron

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ───────────── cola de eventos (solo service_role) ─────────────
create table public.automation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type text not null check (type in ('incoming_message','tag_added','inactivity','webhook')),
  contact_id uuid references public.contacts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  locked_at timestamptz,
  attempts int not null default 0,
  processed_at timestamptz,
  error text
);
create index on public.automation_events (created_at) where processed_at is null;
alter table public.automation_events enable row level security;
revoke all on public.automation_events from anon, authenticated;

-- runs: estado para reanudar después de una espera
alter table public.automation_runs
  add column event_id uuid references public.automation_events(id) on delete set null,
  add column conversation_id uuid references public.conversations(id) on delete set null,
  add column state jsonb not null default '[]',      -- pasos que faltan por ejecutar
  add column resume_at timestamptz,
  add column context jsonb not null default '{}';
create index on public.automation_runs (resume_at) where status = 'waiting';

-- ───────────── disparadores ─────────────
create or replace function public.enqueue_tag_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- las etiquetas puestas por una automatización no disparan otras (evita cadenas)
  if coalesce(current_setting('app.automation', true), '') = '1' then return new; end if;
  if exists (select 1 from public.automations a where a.organization_id = new.organization_id
              and a.trigger_type = 'tag_added' and a.enabled) then
    insert into public.automation_events (organization_id, type, contact_id, payload)
    select new.organization_id, 'tag_added', new.contact_id,
           jsonb_build_object('tag_id', new.tag_id, 'tag_name', t.name)
      from public.tags t where t.id = new.tag_id;
  end if;
  return new;
end $$;
revoke execute on function public.enqueue_tag_event() from public, anon, authenticated;
create trigger contact_tags_automation after insert on public.contact_tags
  for each row execute function public.enqueue_tag_event();

-- ingest_message ahora también encola el evento de mensaje entrante
create or replace function public.ingest_message(
  p_channel_id uuid, p_phone text, p_name text, p_content text, p_media_url text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  cid uuid; conv uuid; assignee uuid;
begin
  select organization_id into org from public.channels where id = p_channel_id;
  if org is null then raise exception 'Canal inexistente'; end if;
  if length(phone) < 6 then raise exception 'Teléfono inválido'; end if;
  phone := '+' || phone;

  insert into public.contacts (organization_id, phone_number, name)
  values (org, phone, nullif(trim(p_name), ''))
  on conflict (organization_id, phone_number)
    do update set name = coalesce(public.contacts.name, nullif(trim(p_name), ''))
  returning id into cid;

  select id, assignee_id into conv, assignee
    from public.conversations where channel_id = p_channel_id and contact_id = cid;

  if conv is null then
    insert into public.conversations (organization_id, channel_id, contact_id)
    values (org, p_channel_id, cid) returning id into conv;
  end if;

  if assignee is null then
    select p.id into assignee
      from public.profiles p
     where p.organization_id = org
       and (p.assigned_phone_ids = '{}' or p_channel_id = any (p.assigned_phone_ids))
     order by (select count(*) from public.conversations c
                where c.assignee_id = p.id and c.status = 'open'), p.created_at
     limit 1;
    update public.conversations set assignee_id = assignee where id = conv;
  end if;

  insert into public.messages (organization_id, conversation_id, contact_id, direction, content, media_url, status)
  values (org, conv, cid, 'in', p_content, p_media_url, 'received');
  update public.conversations set last_message_at = now(), status = 'open' where id = conv;

  if exists (select 1 from public.automations a where a.organization_id = org
              and a.trigger_type = 'incoming_message' and a.enabled) then
    insert into public.automation_events (organization_id, type, contact_id, conversation_id, payload)
    values (org, 'incoming_message', cid, conv, jsonb_build_object('text', coalesce(p_content, '')));
  end if;
  return conv;
end $$;

-- inactividad: conversaciones abiertas sin mensajes por N horas (conditions.hours, 24 por defecto)
create or replace function public.enqueue_inactivity() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with ins as (
    insert into public.automation_events (organization_id, type, contact_id, conversation_id, payload)
    select a.organization_id, 'inactivity', c.contact_id, c.id, jsonb_build_object('automation_id', a.id)
      from public.automations a
      join public.conversations c on c.organization_id = a.organization_id and c.status = 'open'
     where a.enabled and a.trigger_type = 'inactivity'
       and c.last_message_at < now() - make_interval(hours => greatest(coalesce((a.conditions ->> 'hours')::int, 24), 1))
       and not exists (select 1 from public.automation_runs r
                        where r.automation_id = a.id and r.contact_id = c.contact_id
                          and r.created_at > c.last_message_at)
       and not exists (select 1 from public.automation_events e
                        where e.type = 'inactivity' and e.conversation_id = c.id and e.processed_at is null
                          and e.payload ->> 'automation_id' = a.id::text)
    returning 1)
  select count(*) into n from ins;
  return n;
end $$;

-- ───────────── reclamar trabajo (varias instancias a la vez sin duplicar) ─────────────
create or replace function public.claim_automation_events(p_limit int)
returns setof public.automation_events
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.automation_events e set locked_at = now(), attempts = e.attempts + 1
   where e.id in (
     select id from public.automation_events
      where processed_at is null and attempts < 3
        and (locked_at is null or locked_at < now() - interval '5 minutes')
      order by created_at limit p_limit for update skip locked)
  returning e.*;
end $$;

create or replace function public.claim_due_runs(p_limit int)
returns setof public.automation_runs
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.automation_runs r set status = 'running'
   where r.id in (
     select id from public.automation_runs
      where status = 'waiting' and resume_at <= now()
      order by resume_at limit p_limit for update skip locked)
  returning r.*;
end $$;

-- etiqueta puesta por una automatización (no encadena otras automatizaciones)
create or replace function public.automation_add_tag(p_contact_id uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare org uuid; tid uuid;
begin
  select organization_id into org from public.contacts where id = p_contact_id;
  if org is null then raise exception 'Contacto no encontrado'; end if;
  perform set_config('app.automation', '1', true);
  insert into public.tags (organization_id, name) values (org, trim(p_name))
  on conflict (organization_id, name) do update set name = excluded.name returning id into tid;
  insert into public.contact_tags (contact_id, tag_id, organization_id) values (p_contact_id, tid, org)
  on conflict do nothing;
end $$;

revoke execute on function public.enqueue_inactivity() from public, anon, authenticated;
revoke execute on function public.claim_automation_events(int) from public, anon, authenticated;
revoke execute on function public.claim_due_runs(int) from public, anon, authenticated;
revoke execute on function public.automation_add_tag(uuid, text) from public, anon, authenticated;
grant execute on function public.enqueue_inactivity() to service_role;
grant execute on function public.claim_automation_events(int) to service_role;
grant execute on function public.claim_due_runs(int) to service_role;
grant execute on function public.automation_add_tag(uuid, text) to service_role;

-- ───────────── gestión desde el panel (solo administradores) ─────────────
drop policy "org_all" on public.automations;
create policy "automations_read" on public.automations for select to authenticated
  using (organization_id = (select public.current_org_id()));
create policy "automations_delete" on public.automations for delete to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));
revoke insert, update on public.automations from authenticated;

create or replace function public.save_automation(
  p_id uuid, p_name text, p_trigger text, p_conditions jsonb, p_tree jsonb, p_enabled boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id(); rid uuid;
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Nombre requerido'; end if;
  if p_trigger not in ('incoming_message','tag_added','inactivity','webhook') then
    raise exception 'Disparador inválido';
  end if;
  if jsonb_typeof(p_tree -> 'steps') is distinct from 'array' then
    raise exception 'El flujo debe tener una lista de pasos';
  end if;
  if p_id is null then
    insert into public.automations (organization_id, name, trigger_type, conditions, actions_tree_json, enabled)
    values (org, trim(p_name), p_trigger, coalesce(p_conditions, '{}'), p_tree, coalesce(p_enabled, true))
    returning id into rid;
  else
    update public.automations set name = trim(p_name), trigger_type = p_trigger,
           conditions = coalesce(p_conditions, '{}'), actions_tree_json = p_tree,
           enabled = coalesce(p_enabled, true)
     where id = p_id and organization_id = org returning id into rid;
    if rid is null then raise exception 'Automatización no encontrada'; end if;
  end if;
  return rid;
end $$;
revoke execute on function public.save_automation(uuid, text, text, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.save_automation(uuid, text, text, jsonb, jsonb, boolean) to authenticated;

-- webhook de entrada: devuelve el secreto una sola vez
create or replace function public.create_webhook(p_name text)
returns table (id uuid, secret text) language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id();
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Nombre requerido'; end if;
  return query
    insert into public.webhooks (organization_id, direction, name, secret)
    values (org, 'in', trim(p_name),
            replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
    returning public.webhooks.id, public.webhooks.secret;
end $$;
revoke execute on function public.create_webhook(text) from public, anon;
grant execute on function public.create_webhook(text) to authenticated;
