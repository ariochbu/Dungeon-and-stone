-- Parche: corrige "infinite recursion detected in policy for relation profiles".
-- Las políticas "admins select/update all" comprobaban el rol con una subconsulta
-- directa a la propia tabla `profiles`, lo que hace que esa misma política se
-- vuelva a evaluar a sí misma sin parar. La solución es mover esa comprobación a
-- una función SECURITY DEFINER (bypassa RLS en su propia consulta interna).
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001_init.sql.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "profiles: admins select all" on public.profiles;
create policy "profiles: admins select all"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "profiles: admins update all" on public.profiles;
create policy "profiles: admins update all"
  on public.profiles for update
  using (public.is_admin());

drop policy if exists "characters: admins manage all" on public.characters;
create policy "characters: admins manage all"
  on public.characters for all
  using (public.is_admin())
  with check (public.is_admin());
