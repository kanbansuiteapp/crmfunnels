-- 0025_agents_list.sql — lista de agentes de IA: descripción, objetivo, estado activo, duplicar y tamaño de la base de conocimiento
alter table public.ai_agents
  add column description text not null default '',
  add column objective text not null default '',
  add column active boolean not null default true;
grant select (description, objective, active) on public.ai_agents to authenticated;

-- el agente inactivo deja de responder (ver _shared/ai.ts)
drop function if exists public.save_ai_agent(uuid, text, text, text, text, text[], text[]);

create or replace function public.save_ai_agent(
  p_id uuid, p_name text, p_prompt text, p_model text, p_api_key text,
  p_allowed_tags text[], p_collect_fields text[],
  p_description text default '', p_objective text default '', p_active boolean default true
) returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id(); rid uuid;
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Nombre requerido'; end if;
  if p_id is null then
    insert into public.ai_agents (organization_id, name, system_prompt, model, api_key, allowed_tags, collect_fields,
                                  description, objective, active)
    values (org, trim(p_name), coalesce(p_prompt, ''), coalesce(nullif(trim(p_model), ''), 'gpt-4o-mini'),
            nullif(trim(p_api_key), ''), coalesce(p_allowed_tags, '{}'), coalesce(p_collect_fields, '{}'),
            left(coalesce(p_description, ''), 500), left(coalesce(p_objective, ''), 80), coalesce(p_active, true))
    returning id into rid;
  else
    update public.ai_agents set name = trim(p_name), system_prompt = coalesce(p_prompt, ''),
           model = coalesce(nullif(trim(p_model), ''), 'gpt-4o-mini'),
           api_key = coalesce(nullif(trim(p_api_key), ''), api_key),   -- vacío conserva la actual
           allowed_tags = coalesce(p_allowed_tags, '{}'), collect_fields = coalesce(p_collect_fields, '{}'),
           description = left(coalesce(p_description, ''), 500), objective = left(coalesce(p_objective, ''), 80),
           active = coalesce(p_active, true)
     where id = p_id and organization_id = org returning id into rid;
    if rid is null then raise exception 'Agente no encontrado'; end if;
  end if;
  return rid;
end $$;
revoke execute on function public.save_ai_agent(uuid, text, text, text, text, text[], text[], text, text, boolean) from public, anon;
grant execute on function public.save_ai_agent(uuid, text, text, text, text, text[], text[], text, text, boolean) to authenticated;

-- copia la configuración (con la API key); la base de conocimiento no se copia
create or replace function public.duplicate_ai_agent(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id(); rid uuid;
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  insert into public.ai_agents (organization_id, name, system_prompt, model, api_key, allowed_tags, collect_fields,
                                description, objective, active)
  select organization_id, left('Copia de ' || name, 80), system_prompt, model, api_key, allowed_tags, collect_fields,
         description, objective, false
    from public.ai_agents where id = p_id and organization_id = org
  returning id into rid;
  if rid is null then raise exception 'Agente no encontrado'; end if;
  return rid;
end $$;
revoke execute on function public.duplicate_ai_agent(uuid) from public, anon;
grant execute on function public.duplicate_ai_agent(uuid) to authenticated;

-- tamaño aproximado (bytes) del texto indexado de la organización
create or replace function public.kb_size()
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(octet_length(k.content)), 0)::bigint
    from public.knowledge_chunks k join public.knowledge_sources s on s.id = k.source_id
   where s.organization_id = public.current_org_id()
$$;
revoke execute on function public.kb_size() from public, anon;
grant execute on function public.kb_size() to authenticated;
