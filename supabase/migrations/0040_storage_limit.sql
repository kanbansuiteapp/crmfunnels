-- 0040_storage_limit.sql — límite de almacenamiento (imágenes, audios, videos y documentos) por empresa
alter table public.organizations
  add column if not exists max_storage_mb bigint,                 -- null = sin límite
  add column if not exists storage_limit_hits int not null default 0;

-- Bytes usados por los archivos de una empresa (rutas <empresa>/...). Solo service_role o la propia empresa.
create or replace function public.org_storage_bytes(p_org uuid) returns bigint
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null and p_org is distinct from public.current_org_id() then return null; end if;
  return coalesce((select sum(coalesce((metadata->>'size')::bigint, 0)) from storage.objects
                    where bucket_id = 'chat-media' and name like p_org::text || '/%'), 0);
end $$;
revoke execute on function public.org_storage_bytes(uuid) from public, anon;
grant execute on function public.org_storage_bytes(uuid) to authenticated, service_role;

-- ¿le queda espacio a la empresa? (se compara lo ya usado con el límite)
create or replace function public.storage_has_room(p_org uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare mx bigint;
begin
  select max_storage_mb into mx from public.organizations where id = p_org;
  if mx is null then return true; end if;
  return coalesce((select sum(coalesce((metadata->>'size')::bigint, 0)) from storage.objects
                    where bucket_id = 'chat-media' and name like p_org::text || '/%'), 0) < mx * 1048576;
end $$;
revoke execute on function public.storage_has_room(uuid) from public, anon;
grant execute on function public.storage_has_room(uuid) to authenticated, service_role;

-- Corta cualquier subida (cliente o servidor) cuando la empresa ya llenó su espacio
create or replace function public.enforce_storage_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare org uuid; seg text := split_part(new.name, '/', 1);
begin
  if new.bucket_id <> 'chat-media' or seg !~ '^[0-9a-f-]{36}$' then return new; end if;
  org := seg::uuid;
  if not public.storage_has_room(org) then
    raise exception 'Alcanzaste el límite de almacenamiento de tu plan' using errcode = 'LS001';
  end if;
  return new;
end $$;
drop trigger if exists chat_media_storage_limit on storage.objects;
create trigger chat_media_storage_limit before insert on storage.objects
  for each row execute function public.enforce_storage_limit();

-- el plan muestra el espacio usado
create or replace function public.connections_overview() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'plan_name', (select plan_name from public.organizations where id = public.current_org_id()),
    'max_contacts', (select max_contacts from public.organizations where id = public.current_org_id()),
    'max_agents', (select max_agents from public.organizations where id = public.current_org_id()),
    'max_devices', (select max_devices from public.organizations where id = public.current_org_id()),
    'max_storage_mb', (select max_storage_mb from public.organizations where id = public.current_org_id()),
    'contact_limit_hits', (select contact_limit_hits from public.organizations where id = public.current_org_id()),
    'storage_limit_hits', (select storage_limit_hits from public.organizations where id = public.current_org_id()),
    'storage_bytes', public.org_storage_bytes(public.current_org_id()),
    'contacts', (select count(*) from public.contacts),
    'agents', (select count(*) from public.profiles where role = 'agent'),
    'devices', (select count(*) from public.channels),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'phone_number', c.phone_number, 'provider', c.provider, 'status', c.status, 'wa_type', c.wa_type,
        'needs_reconnect', c.needs_reconnect,
        'groups', (select count(*) from public.wa_groups g where g.channel_id = c.id)
      ) order by c.created_at) from public.channels c), '[]'::jsonb)
  )
$$;

-- cuenta un archivo rechazado por falta de espacio (lo llama el webhook, solo service_role)
create or replace function public.bump_storage_hits(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  update public.organizations set storage_limit_hits = storage_limit_hits + 1 where id = p_org
$$;
revoke execute on function public.bump_storage_hits(uuid) from public, anon, authenticated;
grant execute on function public.bump_storage_hits(uuid) to service_role;
