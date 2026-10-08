-- 0013_whalink_broadcasts.sql — enlaces rastreables de WhatsApp y envío masivo con límite de velocidad

-- contactos que pidieron no recibir mensajes (se marca al escribir STOP / baja / cancelar)
alter table public.contacts add column do_not_contact boolean not null default false;

-- ───────────── Whalink ─────────────
create table public.whalinks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  name text not null,
  slug text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  code text not null default substr(replace(gen_random_uuid()::text, '-', ''), 9, 6),
  message text not null default '',
  tag_name text,
  clicks int not null default 0,
  leads int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.whalinks (organization_id);
alter table public.whalinks enable row level security;
revoke all on public.whalinks from anon;
revoke insert, update on public.whalinks from authenticated;
create policy "whalinks_read" on public.whalinks for select to authenticated
  using (organization_id = (select public.current_org_id()));
create policy "whalinks_delete" on public.whalinks for delete to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

create or replace function public.create_whalink(p_name text, p_channel uuid, p_message text, p_tag text)
returns text language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id(); s text;
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Nombre requerido'; end if;
  if length(coalesce(p_message, '')) > 500 then raise exception 'El mensaje es demasiado largo (máx. 500)'; end if;
  if not exists (select 1 from public.channels where id = p_channel and organization_id = org and phone_number is not null) then
    raise exception 'Canal inválido o sin número de teléfono configurado';
  end if;
  insert into public.whalinks (organization_id, channel_id, name, message, tag_name)
  values (org, p_channel, trim(p_name), coalesce(trim(p_message), ''), nullif(trim(p_tag), ''))
  returning slug into s;
  return s;
end $$;
revoke execute on function public.create_whalink(text, uuid, text, text) from public, anon;
grant execute on function public.create_whalink(text, uuid, text, text) to authenticated;

-- clic público: suma 1 y devuelve a dónde redirigir (solo número y texto del enlace)
create or replace function public.whalink_click(p_slug text)
returns table (phone text, msg text) language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.whalinks w set clicks = w.clicks + 1
    from public.channels c
   where w.slug = p_slug and c.id = w.channel_id and c.phone_number is not null
  returning regexp_replace(c.phone_number, '[^0-9]', '', 'g'),
            (case when w.message <> '' then w.message || E'\n\n' else '' end) || '(ref:' || w.code || ')';
end $$;
revoke execute on function public.whalink_click(text) from public;
grant execute on function public.whalink_click(text) to anon, authenticated;

-- atribución: el primer mensaje que trae "(ref:código)" cuenta como lead del enlace (una vez por contacto)
create or replace function public.whalink_attribute(p_conversation uuid, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare w public.whalinks; cid uuid; org uuid;
begin
  select contact_id, organization_id into cid, org from public.conversations where id = p_conversation;
  select * into w from public.whalinks where code = lower(p_code) and organization_id = org;
  if w.id is null or cid is null then return; end if;
  if exists (select 1 from public.contact_events
              where contact_id = cid and type = 'whalink_lead' and payload ->> 'whalink_id' = w.id::text) then
    return;
  end if;
  insert into public.contact_events (organization_id, contact_id, type, payload)
  values (org, cid, 'whalink_lead', jsonb_build_object('whalink_id', w.id, 'name', w.name));
  update public.whalinks set leads = leads + 1 where id = w.id;
  if w.tag_name is not null then perform public.ai_add_tag(cid, w.tag_name); end if;
end $$;
revoke execute on function public.whalink_attribute(uuid, text) from public, anon, authenticated;
grant execute on function public.whalink_attribute(uuid, text) to service_role;

-- ───────────── Envío masivo ─────────────
create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  name text not null,
  message text not null,
  tag_id uuid references public.tags(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','sending','done','cancelled')),
  per_minute int not null default 6 check (per_minute between 1 and 20),
  total int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  started_at timestamptz
);
create index on public.broadcasts (organization_id, created_at desc);

create table public.broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped')),
  locked_at timestamptz,
  error text,
  sent_at timestamptz
);
create index on public.broadcast_recipients (broadcast_id, status);

alter table public.broadcasts enable row level security;
alter table public.broadcast_recipients enable row level security;
revoke all on public.broadcasts, public.broadcast_recipients from anon;
revoke insert, update, delete on public.broadcasts, public.broadcast_recipients from authenticated;
create policy "broadcasts_read" on public.broadcasts for select to authenticated
  using (organization_id = (select public.current_org_id()));
create policy "recipients_read" on public.broadcast_recipients for select to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

-- crea la campaña en borrador con la lista de destinatarios fijada en ese momento
create or replace function public.create_broadcast(
  p_name text, p_channel uuid, p_message text, p_tag uuid, p_per_minute int
) returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id(); bid uuid; n int;
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Nombre requerido'; end if;
  if length(trim(coalesce(p_message, ''))) = 0 or length(p_message) > 1000 then
    raise exception 'El mensaje es obligatorio (máx. 1000 caracteres)';
  end if;
  if not exists (select 1 from public.channels where id = p_channel and organization_id = org) then
    raise exception 'Canal inválido';
  end if;
  if p_tag is not null and not exists (select 1 from public.tags where id = p_tag and organization_id = org) then
    raise exception 'Etiqueta inválida';
  end if;

  insert into public.broadcasts (organization_id, channel_id, name, message, tag_id, per_minute)
  values (org, p_channel, trim(p_name), trim(p_message), p_tag, least(greatest(coalesce(p_per_minute, 6), 1), 20))
  returning id into bid;

  insert into public.broadcast_recipients (broadcast_id, organization_id, contact_id)
  select bid, org, c.id from public.contacts c
   where c.organization_id = org and not c.do_not_contact
     and (p_tag is null or exists (select 1 from public.contact_tags ct where ct.contact_id = c.id and ct.tag_id = p_tag));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Ningún contacto cumple el filtro'; end if;
  update public.broadcasts set total = n where id = bid;
  return bid;
end $$;

create or replace function public.start_broadcast(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  update public.broadcasts set status = 'sending', started_at = now()
   where id = p_id and organization_id = public.current_org_id() and status = 'draft';
  if not found then raise exception 'La campaña no está en borrador'; end if;
end $$;

create or replace function public.cancel_broadcast(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  update public.broadcasts set status = 'cancelled'
   where id = p_id and organization_id = public.current_org_id() and status in ('draft','sending');
  if not found then raise exception 'La campaña ya terminó o no existe'; end if;
end $$;

revoke execute on function public.create_broadcast(text, uuid, text, uuid, int) from public, anon;
revoke execute on function public.start_broadcast(uuid) from public, anon;
revoke execute on function public.cancel_broadcast(uuid) from public, anon;
grant execute on function public.create_broadcast(text, uuid, text, uuid, int) to authenticated;
grant execute on function public.start_broadcast(uuid) to authenticated;
grant execute on function public.cancel_broadcast(uuid) to authenticated;

-- trabajo del worker (solo service_role)
create or replace function public.claim_broadcast_recipients(p_broadcast uuid, p_limit int)
returns setof public.broadcast_recipients
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.broadcast_recipients r set status = 'sending', locked_at = now()
   where r.id in (
     select x.id from public.broadcast_recipients x
      where x.broadcast_id = p_broadcast
        and (x.status = 'pending' or (x.status = 'sending' and x.locked_at < now() - interval '5 minutes'))
      order by x.id limit least(greatest(p_limit, 1), 20) for update skip locked)
  returning r.*;
end $$;

create or replace function public.broadcast_mark(p_recipient uuid, p_status text, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare b uuid;
begin
  update public.broadcast_recipients
     set status = p_status, error = left(p_error, 300), locked_at = null,
         sent_at = case when p_status = 'sent' then now() end
   where id = p_recipient returning broadcast_id into b;
  if b is null then return; end if;
  if p_status = 'sent' then update public.broadcasts set sent = sent + 1 where id = b;
  elsif p_status = 'failed' then update public.broadcasts set failed = failed + 1 where id = b; end if;
  if not exists (select 1 from public.broadcast_recipients where broadcast_id = b and status in ('pending','sending')) then
    update public.broadcasts set status = 'done' where id = b and status = 'sending';
  end if;
end $$;

create or replace function public.mark_do_not_contact(p_conversation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare cid uuid; org uuid;
begin
  select contact_id, organization_id into cid, org from public.conversations where id = p_conversation;
  if cid is null then return; end if;
  update public.contacts set do_not_contact = true where id = cid;
  insert into public.contact_events (organization_id, contact_id, type, payload) values (org, cid, 'opt_out', '{}');
end $$;

revoke execute on function public.claim_broadcast_recipients(uuid, int) from public, anon, authenticated;
revoke execute on function public.broadcast_mark(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.mark_do_not_contact(uuid) from public, anon, authenticated;
grant execute on function public.claim_broadcast_recipients(uuid, int) to service_role;
grant execute on function public.broadcast_mark(uuid, text, text) to service_role;
grant execute on function public.mark_do_not_contact(uuid) to service_role;
