-- 0012_profile.sql — perfil personal: WhatsApp y zona horaria
alter table public.profiles
  add column whatsapp text,
  add column timezone text;

create or replace function public.update_my_profile(p_name text, p_whatsapp text, p_timezone text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  wa text := nullif(regexp_replace(coalesce(p_whatsapp, ''), '[^0-9+]', '', 'g'), '');
  tz text := nullif(trim(coalesce(p_timezone, '')), '');
begin
  if uid is null then raise exception 'No autenticado'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'El nombre es obligatorio'; end if;
  if wa is not null and wa !~ '^\+?[0-9]{6,15}$' then raise exception 'WhatsApp inválido (usa el formato +51912345678)'; end if;
  if tz is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = tz) then
    raise exception 'Zona horaria inválida';
  end if;
  update public.profiles set name = trim(p_name), whatsapp = wa, timezone = tz where id = uid;
  if not found then raise exception 'Perfil no encontrado'; end if;
end $$;
revoke execute on function public.update_my_profile(text, text, text) from public, anon;
grant execute on function public.update_my_profile(text, text, text) to authenticated;

-- (reemplaza dashboard_metrics para usar la zona horaria del usuario) (security invoker: la RLS limita lo que ve cada usuario)
create or replace function public.dashboard_metrics(
  p_from date, p_to date, p_tag uuid default null, p_channel uuid default null
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  -- la zona horaria del usuario manda; si no la configuró, la de su organización
  tz text := coalesce(
    (select timezone from public.profiles where id = auth.uid()),
    (select timezone from public.organizations where id = public.current_org_id()),
    'UTC');
  f timestamptz;
  t timestamptz;
  res jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Rango de fechas inválido';
  end if;
  f := p_from::timestamp at time zone tz;
  t := (p_to + 1)::timestamp at time zone tz;

  with
  msgs as (
    select (m.timestamp at time zone tz)::date as d, m.direction, m.by_ai, m.conversation_id
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
     where m.timestamp >= f and m.timestamp < t
       and (p_channel is null or c.channel_id = p_channel)
       and (p_tag is null or exists (select 1 from public.contact_tags ct
                                      where ct.contact_id = m.contact_id and ct.tag_id = p_tag))
  ),
  newc as (
    select (c.created_at at time zone tz)::date as d
      from public.contacts c
     where c.created_at >= f and c.created_at < t
       and (p_tag is null or exists (select 1 from public.contact_tags ct
                                      where ct.contact_id = c.id and ct.tag_id = p_tag))
       and (p_channel is null or exists (select 1 from public.conversations v
                                          where v.contact_id = c.id and v.channel_id = p_channel))
  ),
  days as (select g::date as d from generate_series(p_from, p_to, interval '1 day') g),
  msg_daily as (
    select d, count(*) filter (where direction = 'in') as mi, count(*) filter (where direction = 'out') as mo
      from msgs group by d
  ),
  new_daily as (select d, count(*) as n from newc group by d),
  daily as (
    select days.d, coalesce(md.mi, 0) as messages_in, coalesce(md.mo, 0) as messages_out,
           coalesce(nd.n, 0) as new_contacts
      from days
      left join msg_daily md on md.d = days.d
      left join new_daily nd on nd.d = days.d
  ),
  pipe as (select id from public.pipelines order by created_at limit 1),
  deal_scope as (
    select d.id, d.value, d.updated_at, s.name as stage_name, s.id as stage_id
      from public.deals d
      join public.stages s on s.id = d.stage_id
      join pipe on pipe.id = d.pipeline_id
     where p_tag is null or exists (select 1 from public.contact_tags ct
                                     where ct.contact_id = d.contact_id and ct.tag_id = p_tag)
  ),
  stg as (
    select s.name, s.order_position, count(ds.id) as deals, coalesce(sum(ds.value), 0) as value
      from public.stages s
      join pipe on pipe.id = s.pipeline_id
      left join deal_scope ds on ds.stage_id = s.id
     group by s.id, s.name, s.order_position
  ),
  ag as (
    select p.name, count(distinct m.conversation_id) as n
      from msgs m
      join public.conversations c on c.id = m.conversation_id
      join public.profiles p on p.id = c.assignee_id
     group by p.id, p.name order by n desc limit 8
  ),
  tgr as (
    select t2.name, count(*) as n, row_number() over (order by count(*) desc, t2.name) as rn
      from public.contact_tags ct join public.tags t2 on t2.id = ct.tag_id
     group by t2.id, t2.name
  ),
  tg as (
    select name, n, rn from tgr where rn <= 5
    union all
    select 'Otras', sum(n)::bigint, 6 from tgr where rn > 5 having sum(n) > 0
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'tz', tz),
    'kpis', jsonb_build_object(
      'new_contacts',  (select count(*) from newc),
      'conversations', (select count(distinct conversation_id) from msgs),
      'messages_in',   (select count(*) from msgs where direction = 'in'),
      'messages_out',  (select count(*) from msgs where direction = 'out'),
      'ai_out',        (select count(*) from msgs where direction = 'out' and by_ai),
      'deals_won',     (select count(*) from deal_scope where stage_name ilike 'ganad%' and updated_at >= f and updated_at < t),
      'deals_won_value', (select coalesce(sum(value), 0) from deal_scope where stage_name ilike 'ganad%' and updated_at >= f and updated_at < t),
      'open_value',    (select coalesce(sum(value), 0) from deal_scope where stage_name not ilike 'ganad%' and stage_name not ilike 'perdid%')
    ),
    'daily',  (select coalesce(jsonb_agg(to_jsonb(daily) order by d), '[]') from daily),
    'stages', (select coalesce(jsonb_agg(to_jsonb(stg) order by order_position), '[]') from stg),
    'agents', (select coalesce(jsonb_agg(to_jsonb(ag) order by n desc), '[]') from ag),
    'tags',   (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'n', n) order by rn), '[]') from tg)
  ) into res;
  return res;
end $$;

revoke execute on function public.dashboard_metrics(date, date, uuid, uuid) from public, anon;
grant execute on function public.dashboard_metrics(date, date, uuid, uuid) to authenticated;
