-- 0028_group_campaigns.sql — campañas para llenar grupos y comunidades con un enlace que rota entre ellos
create table public.group_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  type text not null default 'group' check (type in ('group', 'community')),
  clicks int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.group_campaigns (organization_id, created_at desc);

create table public.group_campaign_groups (
  campaign_id uuid not null references public.group_campaigns(id) on delete cascade,
  group_id uuid not null references public.wa_groups(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  position int not null default 0,
  primary key (campaign_id, group_id)
);

alter table public.group_campaigns enable row level security;
alter table public.group_campaign_groups enable row level security;
revoke all on public.group_campaigns, public.group_campaign_groups from anon;
revoke insert, update, delete on public.group_campaigns, public.group_campaign_groups from authenticated;
create policy "group_campaigns_read" on public.group_campaigns for select to authenticated
  using (organization_id = (select public.current_org_id()));
create policy "group_campaign_groups_read" on public.group_campaign_groups for select to authenticated
  using (organization_id = (select public.current_org_id()));

-- valida y reemplaza la lista de grupos de una campaña (en el orden recibido)
create or replace function public._set_campaign_groups(p_campaign uuid, p_org uuid, p_type text, p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'Selecciona al menos un grupo'; end if;
  if (select count(*) from public.wa_groups where id = any (p_ids) and organization_id = p_org and type = p_type) <> cardinality(p_ids) then
    raise exception 'Los registros elegidos no son válidos para este tipo de campaña';
  end if;
  delete from public.group_campaign_groups where campaign_id = p_campaign;
  insert into public.group_campaign_groups (campaign_id, group_id, organization_id, position)
  select p_campaign, id, p_org, ord - 1 from unnest(p_ids) with ordinality as t(id, ord);
end $$;
revoke execute on function public._set_campaign_groups(uuid, uuid, text, uuid[]) from public, anon, authenticated;

create or replace function public.create_group_campaign(p_name text, p_type text, p_group_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id(); cid uuid;
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Nombre requerido'; end if;
  if p_type not in ('group', 'community') then raise exception 'Tipo inválido'; end if;
  insert into public.group_campaigns (organization_id, name, type) values (org, trim(p_name), p_type) returning id into cid;
  perform public._set_campaign_groups(cid, org, p_type, p_group_ids);
  return cid;
end $$;

create or replace function public.update_group_campaign(p_id uuid, p_name text, p_group_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id(); t text;
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Nombre requerido'; end if;
  update public.group_campaigns set name = trim(p_name) where id = p_id and organization_id = org returning type into t;
  if t is null then raise exception 'Campaña no encontrada'; end if;
  perform public._set_campaign_groups(p_id, org, t, p_group_ids);
end $$;

create or replace function public.delete_group_campaign(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  delete from public.group_campaigns where id = p_id and organization_id = public.current_org_id();
  if not found then raise exception 'Campaña no encontrada'; end if;
end $$;

revoke execute on function public.create_group_campaign(text, text, uuid[]) from public, anon;
revoke execute on function public.update_group_campaign(uuid, text, uuid[]) from public, anon;
revoke execute on function public.delete_group_campaign(uuid) from public, anon;
grant execute on function public.create_group_campaign(text, text, uuid[]) to authenticated;
grant execute on function public.update_group_campaign(uuid, text, uuid[]) to authenticated;
grant execute on function public.delete_group_campaign(uuid) to authenticated;

-- clic público: suma 1 y devuelve el enlace del primer grupo con cupo (o el primero con enlace si todos están llenos)
create or replace function public.group_campaign_click(p_slug text)
returns text language plpgsql security definer set search_path = '' as $$
declare cid uuid; link text;
begin
  update public.group_campaigns set clicks = clicks + 1 where slug = p_slug returning id into cid;
  if cid is null then return null; end if;
  select g.invite_link into link
    from public.group_campaign_groups cg join public.wa_groups g on g.id = cg.group_id
   where cg.campaign_id = cid and g.invite_link is not null
   order by (g.capacity is not null and g.participants >= g.capacity), cg.position
   limit 1;
  return link;
end $$;
revoke execute on function public.group_campaign_click(text) from public;
grant execute on function public.group_campaign_click(text) to anon, authenticated;
