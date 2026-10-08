-- 0023_broadcast_audience.sql — audiencia segmentada del envío masivo: tags (algunos / todos / excluir) y país (prefijo del teléfono)

-- contactos de la organización que cumplen los filtros; p_mode: 'any' | 'all' | 'exclude'; p_codes: prefijos telefónicos ('57', '52'…)
create or replace function public.audience_contact_ids(p_org uuid, p_tags uuid[], p_mode text, p_codes text[])
returns setof uuid language sql stable security definer set search_path = '' as $$
  select c.id from public.contacts c
   where c.organization_id = p_org and not c.do_not_contact
     and (coalesce(cardinality(p_codes), 0) = 0
          or exists (select 1 from unnest(p_codes) k where regexp_replace(c.phone_number, '\D', '', 'g') like k || '%'))
     and (coalesce(cardinality(p_tags), 0) = 0
          or case p_mode
               when 'all' then (select count(*) from public.contact_tags ct where ct.contact_id = c.id and ct.tag_id = any (p_tags)) = cardinality(p_tags)
               when 'exclude' then not exists (select 1 from public.contact_tags ct where ct.contact_id = c.id and ct.tag_id = any (p_tags))
               else exists (select 1 from public.contact_tags ct where ct.contact_id = c.id and ct.tag_id = any (p_tags))
             end)
$$;
revoke execute on function public.audience_contact_ids(uuid, uuid[], text, text[]) from public, anon, authenticated;

-- cuántos contactos recibirían el envío (vista previa del paso 2)
create or replace function public.count_audience(p_tags uuid[], p_mode text, p_codes text[])
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.audience_contact_ids(public.current_org_id(), p_tags, p_mode, p_codes)
$$;
revoke execute on function public.count_audience(uuid[], text, text[]) from public, anon;
grant execute on function public.count_audience(uuid[], text, text[]) to authenticated;

-- crea el envío con la audiencia fijada en ese momento; p_scheduled_at null = enviar ya
create or replace function public.create_broadcast_audience(
  p_name text, p_channel uuid, p_message text, p_tags uuid[], p_mode text, p_codes text[],
  p_per_minute int, p_scheduled_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id(); bid uuid; n int;
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Nombre requerido'; end if;
  if length(trim(coalesce(p_message, ''))) = 0 or length(p_message) > 1000 then
    raise exception 'El mensaje es obligatorio (máx. 1000 caracteres)';
  end if;
  if not exists (select 1 from public.channels where id = p_channel and organization_id = org) then
    raise exception 'Canal inválido';
  end if;
  if coalesce(cardinality(p_tags), 0) > 0 and (
       select count(*) from public.tags where id = any (p_tags) and organization_id = org) <> cardinality(p_tags) then
    raise exception 'Etiqueta inválida';
  end if;

  insert into public.broadcasts (organization_id, channel_id, name, message, per_minute, status, started_at, scheduled_at)
  values (org, p_channel, trim(p_name), trim(p_message), least(greatest(coalesce(p_per_minute, 6), 1), 20),
          'sending', now(), case when p_scheduled_at > now() then p_scheduled_at end)
  returning id into bid;

  insert into public.broadcast_recipients (broadcast_id, organization_id, contact_id)
  select bid, org, id from public.audience_contact_ids(org, p_tags, coalesce(p_mode, 'any'), p_codes);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Ningún contacto cumple el filtro'; end if;
  update public.broadcasts set total = n where id = bid;
  return bid;
end $$;
revoke execute on function public.create_broadcast_audience(text, uuid, text, uuid[], text, text[], int, timestamptz) from public, anon;
grant execute on function public.create_broadcast_audience(text, uuid, text, uuid[], text, text[], int, timestamptz) to authenticated;
