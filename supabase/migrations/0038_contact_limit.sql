-- 0038_contact_limit.sql — el límite de contactos de cada empresa se aplica de verdad
alter table public.organizations add column if not exists contact_limit_hits int not null default 0;

-- Bloquea contactos NUEVOS al llegar al límite (los que ya existen siguen funcionando)
create or replace function public.enforce_contact_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare mx int; n int;
begin
  select max_contacts into mx from public.organizations where id = new.organization_id;
  if mx is null then return new; end if;
  -- un upsert sobre un contacto existente no cuenta como contacto nuevo
  if exists (select 1 from public.contacts where organization_id = new.organization_id and phone_number = new.phone_number) then
    return new;
  end if;
  select count(*) into n from public.contacts where organization_id = new.organization_id;
  if n >= mx then
    raise exception 'Alcanzaste el límite de % contactos de tu plan', mx using errcode = 'LC001';
  end if;
  return new;
end $$;
drop trigger if exists contacts_limit on public.contacts;
create trigger contacts_limit before insert on public.contacts
  for each row execute function public.enforce_contact_limit();

-- Mensajes entrantes: si la empresa está suspendida o llegó al límite, el contacto nuevo no se registra (y se cuenta)
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
  if not (select active from public.organizations where id = org) then return null; end if;
  if length(phone) < 6 then raise exception 'Teléfono inválido'; end if;
  phone := '+' || phone;

  begin
    insert into public.contacts (organization_id, phone_number, name)
    values (org, phone, nullif(trim(p_name), ''))
    on conflict (organization_id, phone_number)
      do update set name = coalesce(public.contacts.name, nullif(trim(p_name), ''))
    returning id into cid;
  exception when sqlstate 'LC001' then
    update public.organizations set contact_limit_hits = contact_limit_hits + 1 where id = org;
    return null;
  end;

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
        'groups', (select count(*) from public.wa_groups g where g.channel_id = c.id)
      ) order by c.created_at) from public.channels c), '[]'::jsonb)
  )
$$;
