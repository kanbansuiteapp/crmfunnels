-- 0006_agent_visibility.sql — agentes solo ven sus conversaciones; admin ve todo
drop policy "org_all" on public.conversations;

create policy "conv_select" on public.conversations for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.is_org_admin()) or assignee_id = (select auth.uid()))
  );

-- las altas las hace el webhook (service_role); el cliente solo edita (reasignar, cerrar)
create policy "conv_update" on public.conversations for update to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.is_org_admin()) or assignee_id = (select auth.uid()))
  )
  with check (
    organization_id = (select public.current_org_id())
    and ((select public.is_org_admin()) or assignee_id = (select auth.uid()))
  );

create policy "conv_delete" on public.conversations for delete to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

-- los mensajes siguen la visibilidad de su conversación (la RLS de conversations aplica en la subconsulta)
drop policy "org_read" on public.messages;
create policy "msg_read" on public.messages for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and exists (select 1 from public.conversations c where c.id = conversation_id)
  );
