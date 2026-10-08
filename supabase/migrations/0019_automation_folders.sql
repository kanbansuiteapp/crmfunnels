-- 0019_automation_folders.sql — carpetas para organizar automatizaciones, y activar/pausar rápido

create table public.automation_folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create unique index on public.automation_folders (organization_id, lower(name));
alter table public.automation_folders enable row level security;
revoke all on public.automation_folders from anon;
revoke insert, update, delete on public.automation_folders from authenticated;
create policy "folders_read" on public.automation_folders for select to authenticated
  using (organization_id = (select public.current_org_id()));

-- al borrar una carpeta, sus automatizaciones quedan sin carpeta (no se borran)
alter table public.automations add column folder_id uuid references public.automation_folders(id) on delete set null;

create or replace function public.create_automation_folder(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id(); fid uuid;
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 60 then raise exception 'El nombre es obligatorio (máx. 60 caracteres)'; end if;
  insert into public.automation_folders (organization_id, name) values (org, trim(p_name)) returning id into fid;
  return fid;
exception when unique_violation then
  raise exception 'Ya existe una carpeta con ese nombre';
end $$;

create or replace function public.rename_automation_folder(p_id uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 60 then raise exception 'El nombre es obligatorio (máx. 60 caracteres)'; end if;
  update public.automation_folders set name = trim(p_name) where id = p_id and organization_id = public.current_org_id();
  if not found then raise exception 'Carpeta no encontrada'; end if;
exception when unique_violation then
  raise exception 'Ya existe una carpeta con ese nombre';
end $$;

create or replace function public.delete_automation_folder(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  delete from public.automation_folders where id = p_id and organization_id = public.current_org_id();
  if not found then raise exception 'Carpeta no encontrada'; end if;
end $$;

create or replace function public.set_automation_folder(p_id uuid, p_folder uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare org uuid := public.current_org_id();
begin
  if org is null or not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  if p_folder is not null and not exists (select 1 from public.automation_folders where id = p_folder and organization_id = org) then
    raise exception 'Carpeta no encontrada';
  end if;
  update public.automations set folder_id = p_folder where id = p_id and organization_id = org;
  if not found then raise exception 'Automatización no encontrada'; end if;
end $$;

create or replace function public.set_automation_enabled(p_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_org_admin() then raise exception 'Solo administradores'; end if;
  update public.automations set enabled = coalesce(p_enabled, false) where id = p_id and organization_id = public.current_org_id();
  if not found then raise exception 'Automatización no encontrada'; end if;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'create_automation_folder(text)', 'rename_automation_folder(uuid, text)', 'delete_automation_folder(uuid)',
    'set_automation_folder(uuid, uuid)', 'set_automation_enabled(uuid, boolean)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
