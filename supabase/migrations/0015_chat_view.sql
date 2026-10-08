-- 0015_chat_view.sql — ficha del contacto (correo, notas) y respuestas rápidas

alter table public.contacts
  add column email text check (email is null or email ~ '^\S+@\S+\.\S+$'),
  add column notes text check (notes is null or length(notes) <= 2000);

create table public.quick_replies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  shortcut text not null check (shortcut ~ '^[a-z0-9_-]{1,20}$'),
  content text not null check (length(content) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (organization_id, shortcut)
);
alter table public.quick_replies enable row level security;
revoke all on public.quick_replies from anon;
revoke insert, update on public.quick_replies from authenticated;
create policy "quick_read" on public.quick_replies for select to authenticated
  using (organization_id = (select public.current_org_id()));
create policy "quick_delete" on public.quick_replies for delete to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

-- crear o actualizar (por atajo); el atajo se normaliza a minúsculas sin "/"
create or replace function public.save_quick_reply(p_shortcut text, p_content text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id(); sc text := lower(ltrim(trim(coalesce(p_shortcut, '')), '/')); rid uuid;
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if sc !~ '^[a-z0-9_-]{1,20}$' then raise exception 'El atajo admite letras, números, - y _ (máx. 20)'; end if;
  if length(trim(coalesce(p_content, ''))) = 0 then raise exception 'El mensaje no puede estar vacío'; end if;
  insert into public.quick_replies (organization_id, shortcut, content)
  values (org, sc, trim(p_content))
  on conflict (organization_id, shortcut) do update set content = excluded.content
  returning id into rid;
  return rid;
end $$;
revoke execute on function public.save_quick_reply(text, text) from public, anon;
grant execute on function public.save_quick_reply(text, text) to authenticated;
