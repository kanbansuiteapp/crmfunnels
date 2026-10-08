-- 0032_metrics.sql — Reportes > Métricas: tableros, tarjetas y datos de cada métrica

create table public.metric_boards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.metric_boards (organization_id, position);

create table public.metric_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  board_id uuid not null references public.metric_boards(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  metric text not null check (metric in ('new_contacts','by_tag','by_country','messages_in','g_members','g_joins_leaves','g_clicks','g_count')),
  variant text not null check (variant in ('line','total','pie','bars')),
  period_kind text not null default 'today' check (period_kind in ('today','yesterday','last3','last7','last30','custom')),
  range_from date,
  range_to date,
  tag_ids uuid[] not null default '{}',
  position int not null default 0,
  created_at timestamptz not null default now(),
  check (period_kind <> 'custom' or (range_from is not null and range_to is not null and range_to >= range_from))
);
create index on public.metric_cards (board_id, position);

alter table public.metric_boards enable row level security;
alter table public.metric_cards enable row level security;
revoke all on public.metric_boards, public.metric_cards from anon;
create policy "org_all" on public.metric_boards for all to authenticated
  using (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));
create policy "org_all" on public.metric_cards for all to authenticated
  using (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

-- Datos de una métrica: { total, series: [{label, value}] }. security invoker: la RLS limita a la organización.
create or replace function public.metric_data(
  p_metric text, p_from date, p_to date, p_tags uuid[] default '{}'
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  tz text := coalesce((select timezone from public.organizations where id = public.current_org_id()), 'UTC');
  f timestamptz;
  t timestamptz;
  res jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Rango de fechas inválido';
  end if;
  f := p_from::timestamp at time zone tz;
  t := (p_to + 1)::timestamp at time zone tz;

  if p_metric = 'new_contacts' then
    select jsonb_build_object('total', coalesce(sum(n), 0), 'series', coalesce(jsonb_agg(jsonb_build_object('label', to_char(d, 'YYYY-MM-DD'), 'value', n) order by d), '[]'))
      into res
      from (select g::date as d,
                   (select count(*) from public.contacts c
                     where c.created_at >= (g::date)::timestamp at time zone tz
                       and c.created_at < (g::date + 1)::timestamp at time zone tz) as n
              from generate_series(p_from, p_to, interval '1 day') g) x;

  elsif p_metric = 'messages_in' then
    select jsonb_build_object('total', coalesce(sum(n), 0), 'series', coalesce(jsonb_agg(jsonb_build_object('label', to_char(d, 'YYYY-MM-DD'), 'value', n) order by d), '[]'))
      into res
      from (select g::date as d,
                   (select count(*) from public.messages m
                     where m.direction = 'in'
                       and m.timestamp >= (g::date)::timestamp at time zone tz
                       and m.timestamp < (g::date + 1)::timestamp at time zone tz) as n
              from generate_series(p_from, p_to, interval '1 day') g) x;

  elsif p_metric = 'by_tag' then
    select jsonb_build_object('total', coalesce(sum(n), 0), 'series', coalesce(jsonb_agg(jsonb_build_object('label', name, 'value', n) order by n desc, name), '[]'))
      into res
      from (select tg.name, count(ct.contact_id) filter (where ct.created_at >= f and ct.created_at < t) as n
              from public.tags tg
              left join public.contact_tags ct on ct.tag_id = tg.id
             where tg.id = any (p_tags)
             group by tg.id, tg.name) x;

  elsif p_metric = 'by_country' then
    select jsonb_build_object('total', coalesce(sum(n), 0), 'series', coalesce(jsonb_agg(jsonb_build_object('label', country, 'value', n) order by n desc, country), '[]'))
      into res
      from (select coalesce(nullif(country_code, ''), 'Sin país') as country, count(*) as n
              from public.contacts
             where created_at >= f and created_at < t
             group by 1) x;

  elsif p_metric = 'g_members' then
    select jsonb_build_object('total', coalesce(sum(participants), 0), 'series', '[]'::jsonb) into res from public.wa_groups;

  elsif p_metric = 'g_clicks' then
    select jsonb_build_object('total', coalesce(sum(clicks), 0), 'series', '[]'::jsonb) into res from public.wa_groups;

  elsif p_metric = 'g_count' then
    select jsonb_build_object('total', (select count(*) from public.wa_groups),
                              'series', coalesce(jsonb_agg(jsonb_build_object('label', to_char(d, 'YYYY-MM-DD'), 'value', n) order by d), '[]'))
      into res
      from (select g::date as d,
                   (select count(*) from public.wa_groups w
                     where w.created_at >= (g::date)::timestamp at time zone tz
                       and w.created_at < (g::date + 1)::timestamp at time zone tz) as n
              from generate_series(p_from, p_to, interval '1 day') g) x;

  else  -- g_joins_leaves: todavía no se registra el historial de ingresos y salidas
    res := jsonb_build_object('total', 0, 'series', '[]'::jsonb);
  end if;
  return res;
end $$;
revoke all on function public.metric_data(text, date, date, uuid[]) from public, anon;
grant execute on function public.metric_data(text, date, date, uuid[]) to authenticated;
