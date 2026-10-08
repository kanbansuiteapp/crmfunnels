-- 0010_ai_agents.sql — agentes de IA (OpenAI): configuración, canal asignado y búsqueda en la base de conocimiento

alter table public.ai_agents
  add column allowed_tags text[] not null default '{}',     -- etiquetas que el agente puede aplicar
  add column collect_fields text[] not null default '{}';   -- datos que debe capturar del cliente
grant select (allowed_tags, collect_fields) on public.ai_agents to authenticated;

alter table public.channels add column ai_agent_id uuid references public.ai_agents(id) on delete set null;
grant select (ai_agent_id) on public.channels to authenticated;

-- borrado solo por administradores (alta y edición van por RPC)
create policy "admin_delete" on public.ai_agents for delete to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));
revoke insert, update on public.ai_agents from authenticated;
create policy "admin_delete" on public.knowledge_sources for delete to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));
grant delete on public.knowledge_sources to authenticated;

create or replace function public.save_ai_agent(
  p_id uuid, p_name text, p_prompt text, p_model text, p_api_key text,
  p_allowed_tags text[], p_collect_fields text[]
) returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id(); rid uuid;
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Nombre requerido'; end if;
  if p_id is null then
    insert into public.ai_agents (organization_id, name, system_prompt, model, api_key, allowed_tags, collect_fields)
    values (org, trim(p_name), coalesce(p_prompt, ''), coalesce(nullif(trim(p_model), ''), 'gpt-4o-mini'),
            nullif(trim(p_api_key), ''), coalesce(p_allowed_tags, '{}'), coalesce(p_collect_fields, '{}'))
    returning id into rid;
  else
    update public.ai_agents set name = trim(p_name), system_prompt = coalesce(p_prompt, ''),
           model = coalesce(nullif(trim(p_model), ''), 'gpt-4o-mini'),
           api_key = coalesce(nullif(trim(p_api_key), ''), api_key),   -- vacío conserva la actual
           allowed_tags = coalesce(p_allowed_tags, '{}'), collect_fields = coalesce(p_collect_fields, '{}')
     where id = p_id and organization_id = org returning id into rid;
    if rid is null then raise exception 'Agente no encontrado'; end if;
  end if;
  return rid;
end $$;
revoke execute on function public.save_ai_agent(uuid, text, text, text, text, text[], text[]) from public, anon;
grant execute on function public.save_ai_agent(uuid, text, text, text, text, text[], text[]) to authenticated;

create or replace function public.set_channel_agent(p_channel_id uuid, p_agent_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id();
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if p_agent_id is not null and not exists (select 1 from public.ai_agents where id = p_agent_id and organization_id = org) then
    raise exception 'Agente no encontrado';
  end if;
  update public.channels set ai_agent_id = p_agent_id where id = p_channel_id and organization_id = org;
  if not found then raise exception 'Canal no encontrado'; end if;
end $$;
revoke execute on function public.set_channel_agent(uuid, uuid) from public, anon;
grant execute on function public.set_channel_agent(uuid, uuid) to authenticated;

-- ───────────── funciones solo para las Edge Functions (service_role) ─────────────
create or replace function public.match_knowledge(p_agent_id uuid, p_embedding extensions.vector, p_k int default 4)
returns table (content text, similarity float)
language sql stable security definer set search_path = '' as $$
  select k.content, 1 - (k.embedding operator(extensions.<=>) p_embedding) as similarity
    from public.knowledge_chunks k
    join public.knowledge_sources s on s.id = k.source_id
   where s.agent_id = p_agent_id
   order by k.embedding operator(extensions.<=>) p_embedding
   limit least(greatest(p_k, 1), 10)
$$;

-- etiqueta puesta por la IA (sí dispara automatizaciones de "etiqueta añadida")
create or replace function public.ai_add_tag(p_contact_id uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare org uuid; tid uuid;
begin
  select organization_id into org from public.contacts where id = p_contact_id;
  if org is null then raise exception 'Contacto no encontrado'; end if;
  insert into public.tags (organization_id, name) values (org, trim(p_name))
  on conflict (organization_id, name) do update set name = excluded.name returning id into tid;
  insert into public.contact_tags (contact_id, tag_id, organization_id) values (p_contact_id, tid, org)
  on conflict do nothing;
end $$;

create or replace function public.ai_set_field(p_contact_id uuid, p_name text, p_value text)
returns void language plpgsql security definer set search_path = '' as $$
declare org uuid; fid uuid;
begin
  select organization_id into org from public.contacts where id = p_contact_id;
  if org is null or length(trim(coalesce(p_value, ''))) = 0 then return; end if;
  insert into public.custom_field_defs (organization_id, name, type) values (org, trim(p_name), 'text')
  on conflict (organization_id, name) do update set name = excluded.name returning id into fid;
  insert into public.custom_field_values (contact_id, field_id, organization_id, value)
  values (p_contact_id, fid, org, left(p_value, 500))
  on conflict (contact_id, field_id) do update set value = excluded.value;
end $$;

revoke execute on function public.match_knowledge(uuid, extensions.vector, int) from public, anon, authenticated;
revoke execute on function public.ai_add_tag(uuid, text) from public, anon, authenticated;
revoke execute on function public.ai_set_field(uuid, text, text) from public, anon, authenticated;
grant execute on function public.match_knowledge(uuid, extensions.vector, int) to service_role;
grant execute on function public.ai_add_tag(uuid, text) to service_role;
grant execute on function public.ai_set_field(uuid, text, text) to service_role;

-- las conversaciones nuevas de un canal con agente nacen con la IA activada
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
    insert into public.conversations (organization_id, channel_id, contact_id, ai_enabled)
    values (org, p_channel_id, cid,
            exists (select 1 from public.channels where id = p_channel_id and ai_agent_id is not null))
    returning id into conv;
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
