-- 0017_whalink_edit.sql — editar un whalink (el slug y el código de atribución no cambian: el enlace sigue funcionando)
create or replace function public.update_whalink(p_id uuid, p_name text, p_channel uuid, p_message text, p_tag text)
returns void language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id();
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Nombre requerido'; end if;
  if length(coalesce(p_message, '')) > 500 then raise exception 'El mensaje es demasiado largo (máx. 500)'; end if;
  if not exists (select 1 from public.channels where id = p_channel and organization_id = org and phone_number is not null) then
    raise exception 'Canal inválido o sin número de teléfono configurado';
  end if;
  update public.whalinks
     set name = trim(p_name), channel_id = p_channel, message = coalesce(trim(p_message), ''), tag_name = nullif(trim(p_tag), '')
   where id = p_id and organization_id = org;
  if not found then raise exception 'Enlace no encontrado'; end if;
end $$;
revoke execute on function public.update_whalink(uuid, text, uuid, text, text) from public, anon;
grant execute on function public.update_whalink(uuid, text, uuid, text, text) to authenticated;
