-- 0030_group_messages.sql — mensajes programados a grupos y comunidades
create table public.group_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  message text not null,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sending', 'done', 'failed', 'cancelled')),
  total int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  read_rate int check (read_rate between 0 and 100),   -- null = sin datos de lectura
  created_at timestamptz not null default now()
);
create index on public.group_messages (organization_id, scheduled_at desc);
create index on public.group_messages (status, scheduled_at);

create table public.group_message_targets (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.group_messages(id) on delete cascade,
  group_id uuid not null references public.wa_groups(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  sent_at timestamptz,
  unique (message_id, group_id)
);
create index on public.group_message_targets (message_id, status);

alter table public.group_messages enable row level security;
alter table public.group_message_targets enable row level security;
revoke all on public.group_messages, public.group_message_targets from anon;
revoke insert, update, delete on public.group_messages, public.group_message_targets from authenticated;
create policy "group_messages_read" on public.group_messages for select to authenticated
  using (organization_id = (select public.current_org_id()));
create policy "group_message_targets_read" on public.group_message_targets for select to authenticated
  using (organization_id = (select public.current_org_id()));

create or replace function public.create_group_message(p_name text, p_message text, p_group_ids uuid[], p_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id(); mid uuid;
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'El nombre es obligatorio'; end if;
  if length(trim(coalesce(p_message, ''))) = 0 or length(p_message) > 4000 then raise exception 'El mensaje es obligatorio (máx. 4000 caracteres)'; end if;
  if coalesce(cardinality(p_group_ids), 0) = 0 then raise exception 'Selecciona al menos un grupo o comunidad'; end if;
  if (select count(*) from public.wa_groups where id = any (p_group_ids) and organization_id = org and type in ('group', 'community'))
       <> cardinality(p_group_ids) then
    raise exception 'Alguno de los destinos no es válido';
  end if;
  if p_at is null then raise exception 'Elige la fecha y hora de envío'; end if;

  insert into public.group_messages (organization_id, name, message, scheduled_at, total)
  values (org, trim(p_name), trim(p_message), p_at, cardinality(p_group_ids)) returning id into mid;
  insert into public.group_message_targets (message_id, group_id, organization_id)
  select mid, g, org from unnest(p_group_ids) g;
  return mid;
end $$;

create or replace function public.delete_group_messages(p_ids uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  delete from public.group_messages where id = any (p_ids) and organization_id = public.current_org_id();
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.create_group_message(text, text, uuid[], timestamptz) from public, anon;
revoke execute on function public.delete_group_messages(uuid[]) from public, anon;
grant execute on function public.create_group_message(text, text, uuid[], timestamptz) to authenticated;
grant execute on function public.delete_group_messages(uuid[]) to authenticated;
