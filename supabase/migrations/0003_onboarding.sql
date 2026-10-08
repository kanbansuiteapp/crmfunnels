-- 0003_onboarding.sql — alta de organización para un usuario recién registrado
create or replace function public.bootstrap_organization(p_org_name text, p_name text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  org uuid;
  pipe uuid;
  won_tag uuid;
  stage_names text[] := array['Nuevo','Contactado','Propuesta','Ganado','Perdido'];
  i int;
begin
  if uid is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from public.profiles where id = uid) then
    raise exception 'El usuario ya pertenece a una organización';
  end if;
  if length(trim(coalesce(p_org_name, ''))) = 0 then
    raise exception 'Nombre de organización requerido';
  end if;

  insert into public.organizations (name) values (trim(p_org_name)) returning id into org;
  insert into public.profiles (id, organization_id, name, email, role)
  values (uid, org, coalesce(nullif(trim(p_name), ''), split_part((select email from auth.users where id = uid), '@', 1)),
          (select email from auth.users where id = uid), 'admin');

  insert into public.tags (organization_id, name, color) values (org, 'Ganado', '#16a34a') returning id into won_tag;
  insert into public.pipelines (organization_id, name) values (org, 'Ventas') returning id into pipe;
  for i in 1..array_length(stage_names, 1) loop
    insert into public.stages (organization_id, pipeline_id, name, order_position, associated_tag_id)
    values (org, pipe, stage_names[i], i - 1, case when stage_names[i] = 'Ganado' then won_tag end);
  end loop;
  return pipe;
end $$;

revoke execute on function public.bootstrap_organization(text, text) from public, anon;
grant execute on function public.bootstrap_organization(text, text) to authenticated;
