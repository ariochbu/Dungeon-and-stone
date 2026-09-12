-- Parche: el trigger protect_profile_privileges() revertía en silencio
-- cualquier UPDATE de role/is_banned hecho desde el SQL Editor (o cualquier
-- conexión sin sesión de usuario), porque auth.uid() es NULL ahí y el trigger
-- lo trataba como "actor no-admin". Ahora solo protege el camino normal de la
-- app (un usuario autenticado intentando auto-ascenderse), no las conexiones
-- ya privilegiadas que de por sí bypassean RLS.
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001_init.sql.

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_role text;
begin
  if auth.uid() is not null then
    select role into acting_role from public.profiles where id = auth.uid();
    if acting_role is distinct from 'admin' then
      new.role := old.role;
      new.is_banned := old.is_banned;
    end if;
  end if;
  return new;
end;
$$;

-- Ahora sí, con el trigger corregido, otorga el primer admin:
update public.profiles set role = 'admin' where username = 'produccion_test';
