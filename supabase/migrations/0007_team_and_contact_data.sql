-- 0007_team_and_contact_data.sql — validación de asignaciones y RPC de etiquetas / campos personalizados

-- Un chat o deal solo puede asignarse a alguien de la misma organización
create or replace function public.check_assignee_org() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_id is not null and not exists (
    select 1 from public.profiles where id = new.assignee_id and organization_id = new.organization_id
  ) then
    raise exception 'El responsable no pertenece a la organización';
  end if;
  return new;
end $$;
revoke execute on function public.check_assignee_org() from public, anon, authenticated;
create trigger conversations_assignee_org before insert or update of assignee_id on public.conversations
  for each row execute function public.check_assignee_org();
create trigger deals_assignee_org before insert or update of assignee_id on public.deals
  for each row execute function public.check_assignee_org();

-- Etiquetar un contacto (crea la etiqueta si no existe)
create or replace function public.add_contact_tag(p_contact_id uuid, p_name text, p_color text default '#64748b')
returns uuid language plpgsql security invoker set search_path = '' as $$
declare org uuid := public.current_org_id(); tid uuid; nm text := trim(coalesce(p_name, ''));
begin
  if org is null then raise exception 'Sin organización'; end if;
  if length(nm) = 0 then raise exception 'Nombre de etiqueta requerido'; end if;
  if not exists (select 1 from public.contacts where id = p_contact_id) then
    raise exception 'Contacto no encontrado';
  end if;
  insert into public.tags (organization_id, name, color) values (org, nm, coalesce(p_color, '#64748b'))
  on conflict (organization_id, name) do update set name = excluded.name
  returning id into tid;
  insert into public.contact_tags (contact_id, tag_id, organization_id) values (p_contact_id, tid, org)
  on conflict do nothing;
  return tid;
end $$;

create or replace function public.remove_contact_tag(p_contact_id uuid, p_tag_id uuid)
returns void language sql security invoker set search_path = '' as $$
  delete from public.contact_tags where contact_id = p_contact_id and tag_id = p_tag_id
$$;

-- Guardar un campo personalizado (crea la definición si no existe; valor vacío lo borra)
create or replace function public.set_custom_field(p_contact_id uuid, p_name text, p_type text, p_value text)
returns void language plpgsql security invoker set search_path = '' as $$
declare org uuid := public.current_org_id(); fid uuid; nm text := trim(coalesce(p_name, ''));
begin
  if org is null then raise exception 'Sin organización'; end if;
  if length(nm) = 0 then raise exception 'Nombre de campo requerido'; end if;
  if p_type not in ('text','number','url','date') then raise exception 'Tipo inválido'; end if;
  if not exists (select 1 from public.contacts where id = p_contact_id) then
    raise exception 'Contacto no encontrado';
  end if;
  if p_type = 'number' and coalesce(p_value, '') <> '' and p_value !~ '^-?[0-9]+(\.[0-9]+)?$' then
    raise exception 'El valor debe ser numérico';
  end if;
  if p_type = 'date' and coalesce(p_value, '') <> '' and p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'La fecha debe ser AAAA-MM-DD';
  end if;

  insert into public.custom_field_defs (organization_id, name, type) values (org, nm, p_type)
  on conflict (organization_id, name) do update set name = excluded.name
  returning id into fid;

  if coalesce(p_value, '') = '' then
    delete from public.custom_field_values where contact_id = p_contact_id and field_id = fid;
  else
    insert into public.custom_field_values (contact_id, field_id, organization_id, value)
    values (p_contact_id, fid, org, p_value)
    on conflict (contact_id, field_id) do update set value = excluded.value;
  end if;
end $$;

revoke execute on function public.add_contact_tag(uuid, text, text) from public, anon;
revoke execute on function public.remove_contact_tag(uuid, uuid) from public, anon;
revoke execute on function public.set_custom_field(uuid, text, text, text) from public, anon;
grant execute on function public.add_contact_tag(uuid, text, text) to authenticated;
grant execute on function public.remove_contact_tag(uuid, uuid) to authenticated;
grant execute on function public.set_custom_field(uuid, text, text, text) to authenticated;
