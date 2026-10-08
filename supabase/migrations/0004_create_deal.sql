-- 0004_create_deal.sql — alta de deal con contacto (upsert por teléfono) al final de la etapa
create or replace function public.create_deal(
  p_pipeline_id uuid, p_stage_id uuid, p_title text, p_value numeric,
  p_contact_name text, p_phone text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  org uuid := public.current_org_id();
  cid uuid;
  did uuid;
  pos int;
  phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
begin
  if org is null then raise exception 'Sin organización'; end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Título requerido'; end if;
  if length(phone) < 6 then raise exception 'Teléfono inválido'; end if;
  if not exists (select 1 from public.stages where id = p_stage_id and pipeline_id = p_pipeline_id) then
    raise exception 'Etapa inválida para este pipeline';
  end if;

  insert into public.contacts (organization_id, phone_number, name)
  values (org, phone, nullif(trim(p_contact_name), ''))
  on conflict (organization_id, phone_number)
    do update set name = coalesce(nullif(trim(p_contact_name), ''), public.contacts.name)
  returning id into cid;

  select coalesce(max(position) + 1, 0) into pos from public.deals where stage_id = p_stage_id;

  insert into public.deals (organization_id, pipeline_id, stage_id, contact_id, title, value, position)
  values (org, p_pipeline_id, p_stage_id, cid, trim(p_title), greatest(coalesce(p_value, 0), 0), pos)
  returning id into did;
  return did;
end $$;

revoke execute on function public.create_deal(uuid, uuid, text, numeric, text, text) from public, anon;
grant execute on function public.create_deal(uuid, uuid, text, numeric, text, text) to authenticated;
