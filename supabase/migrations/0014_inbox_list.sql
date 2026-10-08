-- 0014_inbox_list.sql — lista de chats: no leídos, favoritos, nueva conversación y consulta unificada

-- no leídos (compartidos por todo el equipo): sube con cada mensaje entrante y se limpia al abrir el chat
alter table public.conversations add column unread_count int not null default 0;

create or replace function public.bump_unread() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.direction = 'in' then
    update public.conversations set unread_count = unread_count + 1 where id = new.conversation_id;
  end if;
  return new;
end $$;
revoke execute on function public.bump_unread() from public, anon, authenticated;
create trigger messages_unread after insert on public.messages
  for each row execute function public.bump_unread();

create or replace function public.mark_conversation_read(p_id uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.conversations set unread_count = 0 where id = p_id and unread_count > 0
$$;

-- la RLS limita esto a los chats que el usuario puede editar (los suyos, o todos si es admin)
create or replace function public.mark_all_read()
returns void language sql security invoker set search_path = '' as $$
  update public.conversations set unread_count = 0 where unread_count > 0
$$;

-- favoritos: personales de cada usuario
create table public.conversation_favorites (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  primary key (user_id, conversation_id)
);
alter table public.conversation_favorites enable row level security;
revoke all on public.conversation_favorites from anon;
create policy "own_favorites" on public.conversation_favorites for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.conversations c where c.id = conversation_id));

create or replace function public.toggle_favorite(p_conversation uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.conversation_favorites where user_id = auth.uid() and conversation_id = p_conversation;
  if found then return false; end if;
  insert into public.conversation_favorites (user_id, conversation_id) values (auth.uid(), p_conversation);
  return true;
end $$;

-- nueva conversación por teléfono (queda asignada a quien la crea)
create or replace function public.start_conversation(p_channel uuid, p_phone text, p_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  org uuid := public.current_org_id();
  digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  cid uuid; conv uuid;
begin
  if org is null then raise exception 'Sin organización'; end if;
  if length(digits) < 6 or length(digits) > 15 then raise exception 'Teléfono inválido'; end if;
  if not exists (select 1 from public.channels where id = p_channel and organization_id = org) then
    raise exception 'Canal inválido';
  end if;

  insert into public.contacts (organization_id, phone_number, name)
  values (org, '+' || digits, nullif(trim(p_name), ''))
  on conflict (organization_id, phone_number)
    do update set name = coalesce(public.contacts.name, nullif(trim(p_name), ''))
  returning id into cid;

  insert into public.conversations (organization_id, channel_id, contact_id, assignee_id)
  values (org, p_channel, cid, auth.uid())
  on conflict (channel_id, contact_id) do update set assignee_id = coalesce(public.conversations.assignee_id, auth.uid())
  returning id into conv;
  return conv;
end $$;
revoke execute on function public.start_conversation(uuid, text, text) from public, anon;
grant execute on function public.start_conversation(uuid, text, text) to authenticated;

-- toda la lista en una consulta (security invoker: la RLS decide qué chats ve cada quien)
create or replace function public.inbox_conversations() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(s.r order by s.at desc), '[]'::jsonb) from (
    select c.last_message_at as at,
      jsonb_build_object(
        'id', c.id, 'status', c.status, 'ai_enabled', c.ai_enabled,
        'assignee_id', c.assignee_id, 'assignee_name', p.name,
        'last_message_at', c.last_message_at, 'unread_count', c.unread_count,
        'favorite', exists (select 1 from public.conversation_favorites f
                             where f.conversation_id = c.id and f.user_id = auth.uid()),
        'contact', jsonb_build_object('id', ct.id, 'name', ct.name, 'phone_number', ct.phone_number),
        'channel', jsonb_build_object('id', ch.id, 'name', ch.name),
        'tags', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color))
                            from public.contact_tags x join public.tags t on t.id = x.tag_id
                           where x.contact_id = ct.id), '[]'::jsonb),
        'last_message', (select jsonb_build_object('content', m.content, 'direction', m.direction,
                                                   'by_ai', m.by_ai, 'status', m.status)
                           from public.messages m where m.conversation_id = c.id
                          order by m.timestamp desc limit 1)
      ) as r
    from public.conversations c
    join public.contacts ct on ct.id = c.contact_id
    join public.channels ch on ch.id = c.channel_id
    left join public.profiles p on p.id = c.assignee_id
    order by c.last_message_at desc
    limit 300
  ) s
$$;

revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.mark_all_read() from public, anon;
revoke execute on function public.toggle_favorite(uuid) from public, anon;
revoke execute on function public.inbox_conversations() from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.mark_all_read() to authenticated;
grant execute on function public.toggle_favorite(uuid) to authenticated;
grant execute on function public.inbox_conversations() to authenticated;
