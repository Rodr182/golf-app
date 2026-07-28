# GolfBuddy — Modo Machetero

Web app responsive para calcular los resultados del modo de juego **Machetero**:
concursos por equipo y por evento, apuestas Front / Back / Match / Bye con
Carry Over, Regla 8, Medal, money list y estadísticas por jugador.

## Cómo correr la app

Necesitas [Node.js](https://nodejs.org) instalado (versión 18 o superior).

```bash
cd frontend
npm install     # solo la primera vez
npm run dev     # abre la app en http://localhost:5173
```

Para generar la versión lista para publicar:

```bash
cd frontend
npm run build   # deja el sitio final en frontend/dist/
```

La carpeta `frontend/dist/` se puede subir tal cual a cualquier hosting
estático (Vercel, Netlify, GitHub Pages, etc.).

## Primer uso

La app arranca **sin datos de ejemplo**: cada persona crea su cuenta, arma su
comunidad y desde ahí convoca eventos. Lo único precargado es el catálogo
oficial de canchas (Golf Los Inkas y Asia Golf), que mantiene el
administrador de la app.

Para empezar: crea tu cuenta → **Comunidades → + Nueva comunidad** → define
las reglas → comparte el enlace de la app con tu grupo para que postulen.
También puedes jugar sin comunidad desde **Iniciar Ronda → Ronda libre**.

## Rondas fuera de un evento

Desde **Iniciar Ronda** se puede armar una ronda suelta, con o sin comunidad
(«ronda libre»). Al pulsar **Empezar ronda** la ronda **queda guardada**: se
puede salir de la app y volver, se sincroniza entre celulares, y los
participantes que tienen cuenta la ven en su propio *Iniciar Ronda*.

Cada equipo lleva un **anotador designado** (solo puede serlo quien tiene
cuenta; si todos son invitados, anota quien creó la ronda). Los demás del
equipo ven la tarjeta en vivo en modo lectura. Terminada una tarjeta se salta
a la siguiente con **Siguiente tarjeta**, y cuando todas están completas se
calculan los resultados. Jugando solo o en pareja no hay apuestas: se guarda
como *ronda simple* (tarjeta y estadísticas).

## Ranking y pozo de la comunidad

Dentro de cada comunidad, además de la Money List:

- **Ranking**: combina la money list con la asistencia. Cada componente se
  normaliza entre el mejor y el peor de la tabla (0 a 100) y se pondera; por
  defecto 50% y 50%, editable por los administradores en **⚙️ Reglas**. Solo
  entran los miembros (no los invitados) y solo las fechas de **2 grupos o
  más** — una fecha de un grupo suma a la Money List pero no al ranking.
  La tabla se puede ordenar por ranking, por money list o por participación.
- **Pozo** (solo administradores): por fecha, toma lo que ganaron los
  ganadores de ese día y aplica los conceptos configurados —Mesa 35%, Prop 5%
  y Caja 10% por defecto, con nombres y porcentajes editables— más el
  acumulado de la temporada.

Ambos cálculos replican las hojas `Normalizacion` y `POZO` de la planilla que
el grupo llevaba en Excel.

## Borrar todos los datos (volver a cero)

La acción `Borrar datos de la app` (pestaña Actions en GitHub) vacía la tabla
`collections` de Supabase; hay que escribir `BORRAR` para confirmar. No toca
las cuentas de usuario ni la estructura de la base. Alternativa manual: en el
SQL Editor de Supabase, `delete from public.collections;`

## Dos modos de funcionamiento

**Modo local (así viene por defecto):** los datos se guardan en el navegador
de cada usuario. Sirve para probar; nada se comparte entre dispositivos.

**Modo nube (recomendado para usarla con tu grupo):** cuentas reales y datos
compartidos entre todos, usando [Supabase](https://supabase.com) (gratis).

### Cómo activar el modo nube

1. Crea una cuenta en [supabase.com](https://supabase.com) y un proyecto
   nuevo (el plan Free basta).
2. En el panel del proyecto, abre **SQL Editor**, pega el contenido de
   `supabase/migrations/20260718000000_init.sql` y presiona **Run**.
3. En **Authentication → Sign In / Up → Email**, desactiva
   **"Confirm email"** (para que tus amigos entren sin paso de confirmación).
4. En **Project Settings → API** copia la **Project URL** y la clave
   **anon public**, y pégalas en `frontend/src/config.js`.
5. Vuelve a publicar la app (`npm run build` o el deploy automático).

El primer usuario que se registre queda como administrador de la comunidad
Korn Ferry Boys.

## Publicación automática (GitHub Pages)

Cada vez que se sube un cambio a GitHub, la acción
`.github/workflows/deploy.yml` construye la app y la publica en
`https://<usuario>.github.io/golf-app/`.

Solo hace falta activarlo una vez: en GitHub, **Settings → Pages →
Build and deployment → Source: "GitHub Actions"**.

## Estructura

- `frontend/` — la web app (React + Vite). Toda la lógica está en `frontend/src/App.jsx`.
- `frontend/src/config.js` — credenciales de Supabase (vacías = modo local).
- `supabase/migrations/` — el esquema de la base de datos para el modo nube.
- `backend/` — esqueleto de servidor Express (no se usa; Supabase lo reemplaza).
