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

## Si olvidaste tu contraseña

En la pantalla de inicio de sesión: **¿Olvidaste tu contraseña?** → escribes
tu email → llega un correo con un enlace → al abrirlo, la app pide la
contraseña nueva. El enlace vence a la hora.

El correo lo envía el servicio integrado de Supabase, que **limita los envíos
por hora** y a veces cae en spam. Una única vez hay que ejecutar la acción
`Configurar recuperacion de contrasena` (pestaña Actions) para que el enlace
del correo vuelva a la dirección pública de la app en vez de a `localhost`.

## Probar sin tocar la base de datos real

```bash
cd frontend && npm run build:local && npm run preview
```

`build:local` compila en modo local (datos solo en el navegador). **Nunca hay
que vaciar `src/config.js` para probar**: si ese archivo vacío llega al
repositorio, el despliegue publica una app sin base de datos y nadie puede
iniciar sesión. El flujo de publicación verifica esto y se detiene antes de
publicar si detecta que faltan las credenciales.

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

## Si se cae la señal en la cancha

Lo que se anota se guarda **primero en el propio celular** y después se sube.
Si la subida falla, la app **lo dice** con una barra arriba («No se pudo
guardar…») y un botón para reintentar; además reintenta sola cinco veces con
esperas crecientes. Al volver a entrar sin señal, la app arranca con la copia
del celular en vez de aparecer vacía.

Cada compilación lleva un sello (`version.json`). Si el celular tiene una
versión vieja en caché, la app lo detecta y se actualiza — nunca en medio de
una tarjeta: mientras anotas solo avisa.

## Quién anota

En cada grupo **anota una sola persona**: la designada. Todos los demás —los
otros jugadores del grupo y también los administradores— ven la tarjeta en
vivo, pero en **solo lectura**.

- El anotador tiene que **tener cuenta**: un invitado no entra a la app, así
  que no aparece como opción.
- Se puede **cambiar durante el juego** desde la tarjeta del grupo, con el
  selector **Anota**. Lo pueden hacer el administrador y el propio anotador
  (para pasarle la posta).
- Un administrador que quiera anotar primero se designa a sí mismo; aparece
  como opción en cualquier grupo por si el anotador no llegó.

## Corregir el hoyo de salida

Con los grupos ya armados, cada tarjeta de grupo trae el selector **Salida ·
Hoyo 1 / Hoyo 10**. Lo pueden cambiar el administrador y el anotador de ese
grupo, también desde la pantalla de anotación. Los golpes anotados no se
mueven: lo que cambia es qué nueve cuenta como Front y cuál como Back (y con
eso los caminos). Si ya hay scores, avisa antes de aplicarlo.

## Eliminar una ronda empezada

Dentro de una ronda o evento que todavía no se consolidó, **🗑 Eliminar**
(arriba a la derecha) la borra para todos. Solo lo ve **quien la creó** y los
administradores de la comunidad; si ya hay scores anotados, avisa antes. Para
borrar una fecha ya cerrada hay que reabrirla primero.

## Corregir una fecha ya cerrada

En un evento consolidado, el administrador tiene **↩︎ Reabrir para corregir**:
la fecha sale de la Money List, se corrige la tarjeta y se vuelve a
consolidar. Queda registrado cuántas veces se corrigió.

Los borrados (una cancha, una fecha reabierta) no se eliminan de la base: se
**marcan** como borrados. Así la marca viaja a los demás celulares en vez de
que uno desactualizado resucite lo eliminado.

## Copias de seguridad

La acción `Copia de seguridad` corre sola los domingos y también a mano. Deja
un archivo descargable con todas las colecciones (90 días de retención). Las
instrucciones para restaurar están al inicio de
`.github/workflows/backup.yml`.

## Compartir resultados por WhatsApp

Toda ronda ya cerrada trae **📲 Compartir por WhatsApp**: al consolidar (en la
misma pantalla, junto a los resultados), en **Resultados** de la comunidad y en
el **historial del perfil**. El mensaje va en texto plano —nombre de la ronda,
fecha, cancha, comunidad, la tabla del día jugador por jugador con su resultado
y el pozo—, con 🎟️ marcando a los invitados.

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

- **Cara a cara**: compara a dos miembros en las fechas que jugaron juntos —
  cuántas ganó cada uno, cuánta plata y los golpes de cada día.

Ambos cálculos replican las hojas `Normalizacion` y `POZO` de la planilla que
el grupo llevaba en Excel.

En el perfil, además de las tarjetas y el hándicap, están el **rendimiento
hoyo por hoyo** (promedio contra el par en cada cancha, para ver qué hoyos
cuestan más) y el **historial del Medal**.

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
