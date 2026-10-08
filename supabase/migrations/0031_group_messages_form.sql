-- 0031_group_messages_form.sql — "Crear mensaje programado": destino (grupos o campañas), bloques de mensaje, velocidad y repetición
-- Requiere la 0030.

alter table public.group_messages alter column message drop not null;
alter table public.group_messages alter column message set default '';

alter table public.group_messages
  add column if not exists kind text not null default 'group' check (kind in ('group', 'campaign')),
  add column if not exists campaign_ids uuid[] not null default '{}',
  add column if not exists only_current boolean not null default true,     -- true = solo los grupos de hoy; false = también los creados después
  add column if not exists speed text not null default 'fast' check (speed in ('fast', 'slow')),
  add column if not exists blocks jsonb not null default '[]',
  add column if not exists timezone text not null default 'America/Bogota',
  add column if not exists repeat_enabled boolean not null default false,
  add column if not exists repeat_frequency text not null default 'daily' check (repeat_frequency in ('daily', 'weekly', 'monthly')),
  add column if not exists repeat_end text not null default 'never' check (repeat_end in ('never', 'after', 'date')),
  add column if not exists repeat_after int check (repeat_after between 1 and 1000),
  add column if not exists repeat_until timestamptz,
  add column if not exists runs_done int not null default 0;

-- archivos de los mensajes (carpeta <org>/group-messages/…)
drop policy if exists "group_message_media_insert" on storage.objects;
drop policy if exists "group_message_media_read" on storage.objects;
drop policy if exists "group_message_media_delete" on storage.objects;
create policy "group_message_media_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and (storage.foldername(name))[1] = (select public.current_org_id())::text
         and (storage.foldername(name))[2] = 'group-messages' and (select public.is_org_admin()));
create policy "group_message_media_read" on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[1] = (select public.current_org_id())::text
         and (storage.foldername(name))[2] = 'group-messages' and (select public.is_org_admin()));
create policy "group_message_media_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[1] = (select public.current_org_id())::text
         and (storage.foldername(name))[2] = 'group-messages' and (select public.is_org_admin()));

drop function if exists public.create_group_message(text, text, uuid[], timestamptz);

create or replace function public.save_group_message(p_cfg jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  org uuid := public.current_org_id(); mid uuid;
  v_name text := trim(coalesce(p_cfg ->> 'name', ''));
  v_kind text := coalesce(p_cfg ->> 'kind', 'group');
  v_groups uuid[] := coalesce(array(select jsonb_array_elements_text(p_cfg -> 'group_ids'))::uuid[], '{}');
  v_camps uuid[] := coalesce(array(select jsonb_array_elements_text(p_cfg -> 'campaign_ids'))::uuid[], '{}');
  v_blocks jsonb := coalesce(p_cfg -> 'blocks', '[]'::jsonb);
  v_now boolean := coalesce((p_cfg ->> 'send_now')::boolean, false);
  v_at timestamptz := case when coalesce((p_cfg ->> 'send_now')::boolean, false) then now() else (p_cfg ->> 'scheduled_at')::timestamptz end;
  v_rep jsonb := coalesce(p_cfg -> 'repeat', '{}'::jsonb);
  v_rep_on boolean := coalesce((v_rep ->> 'enabled')::boolean, false);
  v_summary text;
  b jsonb; t text; ids uuid[];
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if v_name = '' then raise exception 'El nombre es obligatorio'; end if;
  if length(v_name) > 100 then raise exception 'El nombre no puede pasar de 100 caracteres'; end if;
  if v_kind not in ('group', 'campaign') then raise exception 'Tipo inválido'; end if;
  if v_at is null then raise exception 'Elige la fecha y hora de envío'; end if;
  if not v_now and v_at < now() - interval '1 minute' then raise exception 'La fecha de envío ya pasó'; end if;
  if jsonb_typeof(v_blocks) <> 'array' or jsonb_array_length(v_blocks) not between 1 and 3 then
    raise exception 'Agrega entre 1 y 3 mensajes';
  end if;

  for b in select * from jsonb_array_elements(v_blocks) loop
    t := b ->> 'type';
    if t is null or t not in ('text', 'audio', 'document', 'media', 'link', 'poll', 'contact', 'event') then raise exception 'Tipo de mensaje inválido'; end if;
    if length(coalesce(b ->> 'text', '')) > 4096 then raise exception 'Un mensaje supera los 4096 caracteres'; end if;
    if t in ('text', 'link', 'event') and length(trim(coalesce(b ->> 'text', ''))) = 0 then raise exception 'Completa el contenido de todos los mensajes'; end if;
    if t in ('audio', 'document', 'media') and left(coalesce(b ->> 'media_path', ''), length(org::text) + 16) <> org::text || '/group-messages/' then
      raise exception 'Falta el archivo de un mensaje';
    end if;
    if t = 'poll' and (length(trim(coalesce(b #>> '{poll,question}', ''))) = 0 or jsonb_array_length(coalesce(b #> '{poll,options}', '[]'::jsonb)) < 2) then
      raise exception 'La encuesta necesita una pregunta y al menos 2 opciones';
    end if;
    if t = 'contact' and (length(trim(coalesce(b #>> '{contact,name}', ''))) = 0 or length(trim(coalesce(b #>> '{contact,phone}', ''))) = 0) then
      raise exception 'El contacto necesita nombre y teléfono';
    end if;
  end loop;

  if v_kind = 'campaign' then
    if cardinality(v_camps) = 0 then raise exception 'Selecciona al menos una campaña'; end if;
    if (select count(*) from public.group_campaigns where id = any (v_camps) and organization_id = org) <> cardinality(v_camps) then
      raise exception 'Alguna campaña no es válida';
    end if;
    select coalesce(array_agg(distinct cg.group_id), '{}') into ids
      from public.group_campaign_groups cg where cg.campaign_id = any (v_camps) and cg.organization_id = org;
  else
    if cardinality(v_groups) = 0 then raise exception 'Selecciona al menos un grupo'; end if;
    if (select count(*) from public.wa_groups where id = any (v_groups) and organization_id = org and type in ('group', 'community')) <> cardinality(v_groups) then
      raise exception 'Alguno de los grupos no es válido';
    end if;
    ids := v_groups;
  end if;
  if cardinality(ids) = 0 then raise exception 'Las campañas elegidas todavía no tienen grupos'; end if;

  if v_rep_on and (v_rep ->> 'end') = 'after' and coalesce((v_rep ->> 'after')::int, 0) < 1 then raise exception 'Indica cuántas veces se repite'; end if;
  if v_rep_on and (v_rep ->> 'end') = 'date' and (v_rep ->> 'until') is null then raise exception 'Indica la fecha de finalización'; end if;

  select coalesce(nullif(trim(x ->> 'text'), ''), '[' || (x ->> 'type') || ']') into v_summary from jsonb_array_elements(v_blocks) x limit 1;

  insert into public.group_messages (
    organization_id, name, message, scheduled_at, total, kind, campaign_ids, only_current, speed, blocks, timezone,
    repeat_enabled, repeat_frequency, repeat_end, repeat_after, repeat_until
  ) values (
    org, v_name, left(v_summary, 4000), v_at, cardinality(ids), v_kind, v_camps, coalesce((p_cfg ->> 'only_current')::boolean, true),
    coalesce(nullif(p_cfg ->> 'speed', ''), 'fast'), v_blocks, coalesce(nullif(p_cfg ->> 'timezone', ''), 'America/Bogota'),
    v_rep_on, coalesce(nullif(v_rep ->> 'frequency', ''), 'daily'), coalesce(nullif(v_rep ->> 'end', ''), 'never'),
    nullif(v_rep ->> 'after', '')::int, nullif(v_rep ->> 'until', '')::timestamptz
  ) returning id into mid;

  insert into public.group_message_targets (message_id, group_id, organization_id) select mid, g, org from unnest(ids) g;
  return mid;
end $$;
revoke execute on function public.save_group_message(jsonb) from public, anon;
grant execute on function public.save_group_message(jsonb) to authenticated;

-- al empezar cada envío, suma los grupos creados después en las campañas (si no es "solo los de hoy")
create or replace function public.refresh_group_message_targets(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.group_messages;
begin
  select * into m from public.group_messages where id = p_id;
  if m.id is null or m.kind <> 'campaign' or m.only_current then return; end if;
  insert into public.group_message_targets (message_id, group_id, organization_id)
  select m.id, cg.group_id, m.organization_id from public.group_campaign_groups cg
   where cg.campaign_id = any (m.campaign_ids) and cg.organization_id = m.organization_id
  on conflict (message_id, group_id) do nothing;
  update public.group_messages set total = (select count(*) from public.group_message_targets where message_id = m.id) where id = m.id;
end $$;
revoke execute on function public.refresh_group_message_targets(uuid) from public, anon, authenticated;
grant execute on function public.refresh_group_message_targets(uuid) to service_role;
