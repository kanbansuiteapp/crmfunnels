-- 0002_hardening.sql — corrige avisos del linter de seguridad
alter function public.set_updated_at() set search_path = '';

alter extension vector set schema extensions;

-- funciones de trigger: nadie las llama por RPC
revoke execute on function public.log_tag_added() from public, anon, authenticated;
revoke execute on function public.enforce_pipeline_limit() from public, anon, authenticated;

-- helpers usados por las políticas RLS: solo usuarios autenticados
revoke execute on function public.current_org_id() from public, anon;
revoke execute on function public.is_org_admin() from public, anon;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.is_org_admin() to authenticated;

revoke execute on function public.move_deal(uuid, uuid, int) from public, anon;
grant execute on function public.move_deal(uuid, uuid, int) to authenticated;
