-- 0029_campaign_form.sql — formulario completo de campaña: creación automática, administradores, moderación y ajustes avanzados

alter table public.group_campaigns drop constraint if exists group_campaigns_type_check;
alter table public.group_campaigns add constraint group_campaigns_type_check check (type in ('group', 'community', 'channel'));

alter table public.group_campaigns
  add column if not exists description text not null default '',
  add column if not exists image_path text,
  add column if not exists auto_create boolean not null default true,
  add column if not exists who_can_send text not null default 'admins' check (who_can_send in ('admins', 'all')),
  add column if not exists admin_channel_ids uuid[] not null default '{}',   -- números conectados; el primero crea los grupos
  add column if not exists backup_admins text[] not null default '{}',       -- teléfonos de respaldo (solo dígitos)
  add column if not exists moderation boolean not null default false,
  add column if not exists moderation_mode text not null default 'all' check (moderation_mode in ('all', 'ai')),
  add column if not exists moderation_criteria text[] not null default '{}',
  add column if not exists max_participants int not null default 1000 check (max_participants between 1 and 1000000),
  add column if not exists max_clicks int not null default 1000 check (max_clicks between 1 and 10000000),
  add column if not exists strategy text not null default 'balanced' check (strategy in ('balanced', 'sequential')),
  add column if not exists remember_visitor boolean not null default true,
  add column if not exists reserve_groups int not null default 0 check (reserve_groups between 0 and 50),
  add column if not exists numbering_position text not null default 'end' check (numbering_position in ('start', 'end')),
  add column if not exists numbering_start int not null default 1 check (numbering_start between 0 and 100000),
  add column if not exists tag_in text,
  add column if not exists tag_out text,
  add column if not exists tracking_code text not null default '',
  add column if not exists silent_protection boolean not null default false;

alter table public.group_campaign_groups add column if not exists clicks int not null default 0;

-- imágenes de campañas (carpeta <org>/campaigns/…)
drop policy if exists "campaign_media_insert" on storage.objects;
drop policy if exists "campaign_media_read" on storage.objects;
drop policy if exists "campaign_media_delete" on storage.objects;
create policy "campaign_media_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and (storage.foldername(name))[1] = (select public.current_org_id())::text
         and (storage.foldername(name))[2] = 'campaigns' and (select public.is_org_admin()));
create policy "campaign_media_read" on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[1] = (select public.current_org_id())::text
         and (storage.foldername(name))[2] = 'campaigns' and (select public.is_org_admin()));
create policy "campaign_media_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[1] = (select public.current_org_id())::text
         and (storage.foldername(name))[2] = 'campaigns' and (select public.is_org_admin()));

-- reemplaza la lista de grupos de una campaña; con creación automática puede quedar vacía al guardar
drop function if exists public._set_campaign_groups(uuid, uuid, text, uuid[]);
create or replace function public._set_campaign_groups(p_campaign uuid, p_org uuid, p_type text, p_ids uuid[], p_allow_empty boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(cardinality(p_ids), 0) = 0 then
    if not p_allow_empty then raise exception 'Selecciona al menos un grupo, comunidad o canal'; end if;
  elsif (select count(*) from public.wa_groups where id = any (p_ids) and organization_id = p_org and type = p_type) <> cardinality(p_ids) then
    raise exception 'Los registros elegidos no son válidos para este tipo de campaña';
  end if;
  delete from public.group_campaign_groups where campaign_id = p_campaign and group_id <> all (coalesce(p_ids, '{}'));
  insert into public.group_campaign_groups (campaign_id, group_id, organization_id, position)
  select p_campaign, id, p_org, ord - 1 from unnest(coalesce(p_ids, '{}')) with ordinality as t(id, ord)
  on conflict (campaign_id, group_id) do update set position = excluded.position;
end $$;
revoke execute on function public._set_campaign_groups(uuid, uuid, text, uuid[], boolean) from public, anon, authenticated;

drop function if exists public.create_group_campaign(text, text, uuid[]);
drop function if exists public.update_group_campaign(uuid, text, uuid[]);

-- crea o edita una campaña; p_cfg trae los ajustes del formulario
create or replace function public.save_group_campaign(p_id uuid, p_cfg jsonb, p_group_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  org uuid := public.current_org_id(); cid uuid := p_id;
  v_type text := coalesce(p_cfg ->> 'type', 'group');
  v_name text := trim(coalesce(p_cfg ->> 'name', ''));
  v_desc text := trim(coalesce(p_cfg ->> 'description', ''));
  v_auto boolean := coalesce((p_cfg ->> 'auto_create')::boolean, true) and v_type = 'group';
  v_admins uuid[] := coalesce(array(select jsonb_array_elements_text(p_cfg -> 'admin_channel_ids'))::uuid[], '{}');
  v_backup text[] := coalesce(array(select regexp_replace(x, '\D', '', 'g') from jsonb_array_elements_text(p_cfg -> 'backup_admins') x), '{}');
  v_crit text[] := coalesce(array(select jsonb_array_elements_text(p_cfg -> 'moderation_criteria')), '{}');
  v_path text := lower(trim(coalesce(p_cfg ->> 'custom_path', '')));
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if v_type not in ('group', 'community', 'channel') then raise exception 'Tipo inválido'; end if;
  if v_name = '' then raise exception 'El nombre es obligatorio'; end if;
  if v_desc = '' then raise exception 'La descripción es obligatoria'; end if;
  if cardinality(v_admins) = 0 then raise exception 'Debes agregar al menos 1 número conectado como administrador'; end if;
  if (select count(*) from public.channels where id = any (v_admins) and organization_id = org) <> cardinality(v_admins) then
    raise exception 'Número administrador inválido';
  end if;
  if v_path <> '' and v_path !~ '^[a-z0-9-]{3,40}$' then raise exception 'La ruta solo puede tener letras, números y guiones (3 a 40)'; end if;

  if cid is null then
    insert into public.group_campaigns (organization_id, name, type) values (org, v_name, v_type) returning id into cid;
  elsif not exists (select 1 from public.group_campaigns where id = cid and organization_id = org) then
    raise exception 'Campaña no encontrada';
  end if;

  begin
    update public.group_campaigns set
      name = v_name, description = left(v_desc, 500), image_path = nullif(p_cfg ->> 'image_path', ''),
      auto_create = v_auto, who_can_send = coalesce(nullif(p_cfg ->> 'who_can_send', ''), 'admins'),
      admin_channel_ids = v_admins, backup_admins = v_backup,
      moderation = coalesce((p_cfg ->> 'moderation')::boolean, false),
      moderation_mode = coalesce(nullif(p_cfg ->> 'moderation_mode', ''), 'all'), moderation_criteria = v_crit,
      max_participants = coalesce((p_cfg ->> 'max_participants')::int, 1000),
      max_clicks = coalesce((p_cfg ->> 'max_clicks')::int, 1000),
      strategy = coalesce(nullif(p_cfg ->> 'strategy', ''), 'balanced'),
      remember_visitor = coalesce((p_cfg ->> 'remember_visitor')::boolean, true),
      reserve_groups = coalesce((p_cfg ->> 'reserve_groups')::int, 0),
      numbering_position = coalesce(nullif(p_cfg ->> 'numbering_position', ''), 'end'),
      numbering_start = coalesce((p_cfg ->> 'numbering_start')::int, 1),
      tag_in = nullif(trim(coalesce(p_cfg ->> 'tag_in', '')), ''), tag_out = nullif(trim(coalesce(p_cfg ->> 'tag_out', '')), ''),
      tracking_code = left(coalesce(p_cfg ->> 'tracking_code', ''), 5000),
      silent_protection = coalesce((p_cfg ->> 'silent_protection')::boolean, false),
      slug = case when v_path <> '' then v_path else slug end
    where id = cid;
  exception when unique_violation then raise exception 'Esa ruta ya está en uso';
  end;

  perform public._set_campaign_groups(cid, org, v_type, p_group_ids, v_auto);
  return cid;
end $$;
revoke execute on function public.save_group_campaign(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.save_group_campaign(uuid, jsonb, uuid[]) to authenticated;

-- clic público: elige el grupo según la estrategia y los límites; "recordar visitante" reenvía al mismo grupo
drop function if exists public.group_campaign_click(text);
create or replace function public.group_campaign_click(p_slug text, p_prev uuid default null)
returns table (link text, group_id uuid) language plpgsql security definer set search_path = '' as $$
declare c public.group_campaigns; gid uuid; l text;
begin
  update public.group_campaigns set clicks = clicks + 1 where slug = p_slug returning * into c;
  if c.id is null then return; end if;

  if c.remember_visitor and p_prev is not null then
    select g.invite_link, g.id into l, gid
      from public.group_campaign_groups cg join public.wa_groups g on g.id = cg.group_id
     where cg.campaign_id = c.id and g.id = p_prev and g.invite_link is not null;
  end if;

  if gid is null then
    select g.invite_link, g.id into l, gid
      from public.group_campaign_groups cg join public.wa_groups g on g.id = cg.group_id
     where cg.campaign_id = c.id and g.invite_link is not null
     order by (g.participants >= c.max_participants or cg.clicks >= c.max_clicks),
              case when c.strategy = 'balanced' then cg.clicks else 0 end, cg.position
     limit 1;
  end if;

  if gid is null then return; end if;
  update public.group_campaign_groups cg set clicks = cg.clicks + 1 where cg.campaign_id = c.id and cg.group_id = gid;
  return query select l, gid;
end $$;
revoke execute on function public.group_campaign_click(text, uuid) from public;
grant execute on function public.group_campaign_click(text, uuid) to anon, authenticated;
