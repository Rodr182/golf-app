-- GolfBuddy: que el SERVIDOR entregue solo las comunidades de cada uno.
--
-- Antes de esto, cualquiera que iniciara sesión podía leer la tabla entera. El
-- filtro por comunidad lo hacía la app en el celular, y un filtro que vive en
-- el celular no es una llave: quien supiera mirar podía ver la plata de una
-- comunidad a la que no pertenece.
--
-- Esto va de la mano con el cambio de cómo se guardan los datos: las fechas,
-- los eventos y las tarjetas previas de cada comunidad viven en su propia fila
-- ("gb_rounds_v2:<id de comunidad>"), no todas juntas en una. Sin eso, esta
-- regla no se podía escribir.
--
-- Queda abierto a propósito:
--   - gb_players_v2  — la lista de jugadores (ya sin correos), para armar
--                      grupos y mostrar nombres.
--   - gb_comm_v2     — las comunidades, para poder buscarlas y postular.
--   - gb_courses_v2  — el catálogo de canchas.
--   - gb_epoch       — el número de versión de los datos.
--   - "...:libre"    — las rondas casuales, que no son de ninguna comunidad.
--                      Acá falta trabajo: hoy las ve cualquiera que entre.
--
-- Las filas únicas de antes (gb_rounds_v2, gb_events_v1, gb_histcards_v1)
-- quedan SIN llave de lectura a propósito: nadie las lee ni las escribe, y
-- siguen en la base congeladas como respaldo.
--
-- Cómo aplicarlo: con el flujo "Permisos por comunidad" (modo APLICAR), que
-- además comprueba, haciendo de cuenta que es cada persona, qué puede leer y
-- qué puede guardar. O a mano, pegando este archivo en el SQL Editor.

-- A qué comunidades pertenece quien está preguntando.
-- SECURITY DEFINER a propósito: lee gb_comm_v2 sin pasar por los permisos. La
-- regla necesita saber en qué comunidades está uno, y esa lista vive en la
-- misma tabla que la regla protege; sin esto se muerde la cola.
create or replace function public.mis_comunidades()
returns text[]
language sql
security definer
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(c->>'id'), '{}'::text[])
  from public.collections k, jsonb_array_elements(k.value) c
  where k.key = 'gb_comm_v2'
    and ( c->'members' ? (select auth.uid()::text)
       or c->>'admin' = (select auth.uid()::text)
       or coalesce(c->'admins','[]'::jsonb) ? (select auth.uid()::text) );
$fn$;

revoke all on function public.mis_comunidades() from public;
grant execute on function public.mis_comunidades() to authenticated;

drop policy if exists "authenticated can read" on public.collections;
drop policy if exists "authenticated can insert" on public.collections;
drop policy if exists "authenticated can update" on public.collections;
drop policy if exists "leer solo lo de mis comunidades" on public.collections;
drop policy if exists "escribir solo lo de mis comunidades" on public.collections;
drop policy if exists "corregir solo lo de mis comunidades" on public.collections;

create policy "leer solo lo de mis comunidades"
  on public.collections for select
  to authenticated
  using (
    key in ('gb_players_v2','gb_comm_v2','gb_courses_v2','gb_epoch')
    or key like '%:libre'
    or split_part(key, ':', 2) = any (public.mis_comunidades())
  );

create policy "escribir solo lo de mis comunidades"
  on public.collections for insert
  to authenticated
  with check (
    key in ('gb_players_v2','gb_comm_v2','gb_courses_v2','gb_epoch')
    or key like '%:libre'
    or split_part(key, ':', 2) = any (public.mis_comunidades())
  );

-- Guardar es un "upsert": si la fila ya existe, es un UPDATE. Sin esta
-- política, un anotador no podría guardar nada sobre una fecha que ya existe.
create policy "corregir solo lo de mis comunidades"
  on public.collections for update
  to authenticated
  using (
    key in ('gb_players_v2','gb_comm_v2','gb_courses_v2','gb_epoch')
    or key like '%:libre'
    or split_part(key, ':', 2) = any (public.mis_comunidades())
  )
  with check (
    key in ('gb_players_v2','gb_comm_v2','gb_courses_v2','gb_epoch')
    or key like '%:libre'
    or split_part(key, ':', 2) = any (public.mis_comunidades())
  );

-- Nadie puede BORRAR filas desde la app: no hay política de delete, igual que
-- antes. Borrar una fecha o un jugador se hace con una marca, no quitándolo.
