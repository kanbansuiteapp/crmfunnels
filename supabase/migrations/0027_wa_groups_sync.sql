-- 0027_wa_groups_sync.sql — última sincronización y borrado de grupos importados
alter table public.wa_groups add column if not exists last_synced_at timestamptz;
update public.wa_groups set last_synced_at = updated_at where last_synced_at is null;

create or replace function public.delete_wa_groups(p_ids uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  delete from public.wa_groups where id = any (p_ids) and organization_id = public.current_org_id();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.delete_wa_groups(uuid[]) from public, anon;
grant execute on function public.delete_wa_groups(uuid[]) to authenticated;
