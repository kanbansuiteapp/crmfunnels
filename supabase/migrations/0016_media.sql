-- 0016_media.sql — imágenes, audios, videos y documentos en el chat

alter table public.messages
  add column media_type text check (media_type in ('image','audio','video','document','sticker')),
  add column media_mime text,
  add column media_name text;
-- media_url guarda la RUTA dentro del bucket privado (no una URL pública)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 16777216, array[
  'image/*', 'audio/*', 'video/*', 'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do nothing;

-- rutas: <organización>/<conversación>/<archivo>. Solo ve o sube quien puede ver esa conversación (RLS de conversations aplica).
create policy "chat_media_read" on storage.objects for select to authenticated
  using (bucket_id = 'chat-media'
         and (storage.foldername(name))[1] = (select public.current_org_id())::text
         and exists (select 1 from public.conversations c where c.id::text = (storage.foldername(name))[2]));
create policy "chat_media_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media'
         and (storage.foldername(name))[1] = (select public.current_org_id())::text
         and exists (select 1 from public.conversations c where c.id::text = (storage.foldername(name))[2]));

-- la lista de chats ahora indica el tipo de medio del último mensaje
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
                                                   'by_ai', m.by_ai, 'status', m.status,
                                                   'media_type', m.media_type, 'media_name', m.media_name)
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

