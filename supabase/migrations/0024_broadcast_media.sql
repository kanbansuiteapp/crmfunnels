-- 0024_broadcast_media.sql — imagen o video adjunto en el envío masivo y mensajes de hasta 4000 caracteres
alter table public.broadcasts add column media_path text, add column media_name text, add column media_mime text;

-- los administradores suben y ven los adjuntos de envíos masivos (carpeta <org>/broadcasts/…)
create policy "broadcast_media_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media'
         and (storage.foldername(name))[1] = (select public.current_org_id())::text
         and (storage.foldername(name))[2] = 'broadcasts'
         and (select public.is_org_admin()));
create policy "broadcast_media_read" on storage.objects for select to authenticated
  using (bucket_id = 'chat-media'
         and (storage.foldername(name))[1] = (select public.current_org_id())::text
         and (storage.foldername(name))[2] = 'broadcasts'
         and (select public.is_org_admin()));
create policy "broadcast_media_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media'
         and (storage.foldername(name))[1] = (select public.current_org_id())::text
         and (storage.foldername(name))[2] = 'broadcasts'
         and (select public.is_org_admin()));

drop function if exists public.create_broadcast_audience(text, uuid, text, uuid[], text, text[], int, timestamptz);

create or replace function public.create_broadcast_audience(
  p_name text, p_channel uuid, p_message text, p_tags uuid[], p_mode text, p_codes text[],
  p_per_minute int, p_scheduled_at timestamptz,
  p_media_path text default null, p_media_name text default null, p_media_mime text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id(); bid uuid; n int;
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Nombre requerido'; end if;
  if length(coalesce(p_message, '')) > 4000 then raise exception 'El mensaje no puede pasar de 4000 caracteres'; end if;
  if length(trim(coalesce(p_message, ''))) = 0 and coalesce(p_media_path, '') = '' then
    raise exception 'Escribe un mensaje o adjunta un archivo';
  end if;
  if coalesce(p_media_path, '') <> '' and left(p_media_path, length(org::text) + 12) <> org::text || '/broadcasts/' then
    raise exception 'Archivo no válido';
  end if;
  if not exists (select 1 from public.channels where id = p_channel and organization_id = org) then
    raise exception 'Canal inválido';
  end if;
  if coalesce(cardinality(p_tags), 0) > 0 and (
       select count(*) from public.tags where id = any (p_tags) and organization_id = org) <> cardinality(p_tags) then
    raise exception 'Etiqueta inválida';
  end if;

  insert into public.broadcasts (organization_id, channel_id, name, message, per_minute, status, started_at, scheduled_at,
                                 media_path, media_name, media_mime)
  values (org, p_channel, trim(p_name), trim(coalesce(p_message, '')), least(greatest(coalesce(p_per_minute, 6), 1), 20),
          'sending', now(), case when p_scheduled_at > now() then p_scheduled_at end,
          nullif(p_media_path, ''), left(p_media_name, 120), left(p_media_mime, 100))
  returning id into bid;

  insert into public.broadcast_recipients (broadcast_id, organization_id, contact_id)
  select bid, org, id from public.audience_contact_ids(org, p_tags, coalesce(p_mode, 'any'), p_codes);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Ningún contacto cumple el filtro'; end if;
  update public.broadcasts set total = n where id = bid;
  return bid;
end $$;
revoke execute on function public.create_broadcast_audience(text, uuid, text, uuid[], text, text[], int, timestamptz, text, text, text) from public, anon;
grant execute on function public.create_broadcast_audience(text, uuid, text, uuid[], text, text[], int, timestamptz, text, text, text) to authenticated;
