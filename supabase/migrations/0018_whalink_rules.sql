-- 0018_whalink_rules.sql — como en el formulario: nombre ≤ 100 caracteres, mensaje obligatorio ≤ 250
create or replace function public.create_whalink(p_name text, p_channel uuid, p_message text, p_tag text)
returns text language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id(); s text;
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(p_name) > 100 then raise exception 'El nombre es obligatorio (máx. 100 caracteres)'; end if;
  if length(trim(coalesce(p_message, ''))) = 0 or length(p_message) > 250 then raise exception 'El mensaje es obligatorio (máx. 250 caracteres)'; end if;
  if not exists (select 1 from public.channels where id = p_channel and organization_id = org and phone_number is not null) then
    raise exception 'Canal inválido o sin número de teléfono configurado';
  end if;
  insert into public.whalinks (organization_id, channel_id, name, message, tag_name)
  values (org, p_channel, trim(p_name), trim(p_message), nullif(trim(p_tag), ''))
  returning slug into s;
  return s;
end $$;

create or replace function public.update_whalink(p_id uuid, p_name text, p_channel uuid, p_message text, p_tag text)
returns void language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id();
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(p_name) > 100 then raise exception 'El nombre es obligatorio (máx. 100 caracteres)'; end if;
  if length(trim(coalesce(p_message, ''))) = 0 or length(p_message) > 250 then raise exception 'El mensaje es obligatorio (máx. 250 caracteres)'; end if;
  if not exists (select 1 from public.channels where id = p_channel and organization_id = org and phone_number is not null) then
    raise exception 'Canal inválido o sin número de teléfono configurado';
  end if;
  update public.whalinks
     set name = trim(p_name), channel_id = p_channel, message = trim(p_message), tag_name = nullif(trim(p_tag), '')
   where id = p_id and organization_id = org;
  if not found then raise exception 'Enlace no encontrado'; end if;
end $$;
