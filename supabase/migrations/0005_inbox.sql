-- 0005_inbox.sql — canales con credenciales ocultas, ingreso de mensajes y reparto de chats
alter table public.channels
  add column api_url text,
  add column api_key text,
  add column instance_name text,
  add column webhook_secret text not null default replace(gen_random_uuid()::text, '-', '');

-- El cliente nunca lee credenciales ni escribe canales directamente
revoke select, insert, update on public.channels from authenticated;
grant select (id, organization_id, name, phone_number, provider, status, instance_name, created_at)
  on public.channels to authenticated;

create or replace function public.create_channel(
  p_name text, p_api_url text, p_api_key text, p_instance text, p_phone text default null
) returns table (id uuid, webhook_secret text)
language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id();
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Nombre requerido'; end if;
  return query
    insert into public.channels (organization_id, name, api_url, api_key, instance_name, phone_number)
    values (org, trim(p_name), nullif(trim(p_api_url), ''), nullif(trim(p_api_key), ''),
            nullif(trim(p_instance), ''), nullif(trim(p_phone), ''))
    returning public.channels.id, public.channels.webhook_secret;
end $$;
revoke execute on function public.create_channel(text, text, text, text, text) from public, anon;
grant execute on function public.create_channel(text, text, text, text, text) to authenticated;

-- Guarda un mensaje entrante: contacto, conversación (con reparto) y mensaje. Solo service_role.
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
    -- rotador: el agente elegible con menos conversaciones abiertas
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
  return conv;
end $$;
revoke execute on function public.ingest_message(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.ingest_message(uuid, text, text, text, text) to service_role;
