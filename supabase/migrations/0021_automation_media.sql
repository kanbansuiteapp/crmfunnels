-- 0021_automation_media.sql — archivos adjuntos de las automatizaciones (carpeta <org>/automations/…)
-- Los administradores suben y ven los archivos del flujo; al enviarse, el motor los copia a la carpeta de la conversación.
create policy "automation_media_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media'
         and (storage.foldername(name))[1] = (select public.current_org_id())::text
         and (storage.foldername(name))[2] = 'automations'
         and (select public.is_org_admin()));
create policy "automation_media_read" on storage.objects for select to authenticated
  using (bucket_id = 'chat-media'
         and (storage.foldername(name))[1] = (select public.current_org_id())::text
         and (storage.foldername(name))[2] = 'automations'
         and (select public.is_org_admin()));
create policy "automation_media_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media'
         and (storage.foldername(name))[1] = (select public.current_org_id())::text
         and (storage.foldername(name))[2] = 'automations'
         and (select public.is_org_admin()));
