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

Los cambios de un grupo —**sortear o elegir las parejas**, **reemplazar un
jugador**, **cambiar el anotador** y **corregir el hoyo de salida**— también
quedan en manos del anotador de ese grupo y de los administradores de la
comunidad. Los demás jugadores del grupo solo miran.

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

## La planilla manda

Los cálculos de la app replican las fórmulas de `Programa_KFB_2026.xlsx` (hojas
`Reglas`, `Pts General`, `Internos` y `RESULTADOS`). Ante cualquier duda, la
planilla es la referencia.

La prueba `scratchpad/test-excel.mjs` corre por el motor de la app una **fecha
real completa** tomada de la hoja `SCORES` —16 jugadores, 4 grupos— y compara
contra la hoja `RESULTADOS` camino por camino: Grupos vs. Grupos, Individual
general, Parejas, Individual interno, total de caminos y soles. Las 96
comparaciones dan igual.

Puntos donde la planilla es explícita y la app los sigue:

- **Hándicap** (regla 4): `ROUND(hcp × 75%, 0)`; strokes = `MIN(18, reducido −
  base)`, con base = el hándicap reducido más bajo (del grupo en los concursos
  internos, del evento en los generales).
  El **porcentaje no está fijo**: lo define cada comunidad en **⚙️ Reglas**, y
  una ronda suelta puede usar el suyo propio.
- **Hándicap positivo**: quien juega bajo par le da strokes a la cancha. Se
  carga **en negativo** (+2 se escribe `-2`) y ahí la reducción se **divide**
  en vez de multiplicar: `-2` al 75% queda en `-3`. Multiplicar acercaría el
  hándicap a cero, o sea le recortaría lo que da mientras al resto le recorta
  lo que recibe; dividiendo, la penalización cae en la misma proporción para
  todos. Es el único punto donde la app se aparta de la planilla, que multiplica
  para todos porque nunca tuvo un hándicap positivo cargado.

  La **base** sigue siendo el hándicap ajustado más bajo del grupo (en los
  concursos internos) o del evento (en los generales), así que un positivo pasa
  a ser la base y le **da strokes al resto**. Al anotar, la pantalla muestra la
  base, quién la marca y cuántos strokes recibe cada uno.
- **Regla 8** (regla 16): en los hoyos marcados —solo par 3— el stroke sirve
  para **llegar al par, no para bajar de ahí**, y no se aplica si el hoyo ya se
  jugó en par o mejor. En los par 3 no marcados el stroke cuenta entero.
- **Mayoría que anula** (reglas 24 y 36): por **grupos** en Grupos vs. Grupos,
  por **jugadores** en los individuales, por **parejas** en Pareja vs. Pareja.
- **Préstamo** (regla 10): el jugador que completa un grupo de 3 se toma de un
  **grupo de cuatro**.

## Inscripción y armado de grupos

Los inscritos se numeran por **orden de llegada**, y ese orden manda si hay que
dejar a alguien fuera: espera el último. Cada alta y cada baja lleva su hora, así
que dos celulares inscribiendo gente a la vez no se pisan ni "reviven" a quien
fue retirado.

Al cerrar la inscripción la app **sugiere** el armado. Los grupos válidos son de
3, 4 o 5 — nunca de 1 ni de 2, y confirmar los grupos exige que todos estén en
ese rango:

- Con **Priorizar grupos de 4** activada (por defecto, en ⚙️ Reglas): se juega en
  grupos de cuatro, con un único grupo de 3 si sobran justo tres. Con 13
  inscritos → 3 grupos de 4 y 1 en lista de espera; con 15 → 3 de 4 y 1 de 3.
- Desactivada: juegan todos, completando con grupos de 3 o de 5. Con 13 → 4, 4
  y 5; con 14 → 4, 4, 3 y 3.

Cuando el armado deja gente esperando, la pantalla muestra también la
alternativa donde juegan todos. Es una sugerencia: los grupos los arma el
administrador.

Las listas de jugadores de la comunidad —miembros, inscribir al evento,
reemplazar a alguien en un grupo— van en **orden alfabético**.

## Grupos de 3 y de 5

- **Grupo de 5**: la pareja base (los dos primeros del grupo) juega contra las
  tres combinaciones de los otros tres — tres matches internos de parejas, uno
  por cada par posible. En **Grupos vs. Grupos** el grupo juega con cuatro
  scores: al consolidar se elige (o se sortea) a quién se le deja fuera; ese
  jugador **sigue jugando todo lo demás** —individual, medal, parejas— y cobra
  o paga el resultado de su grupo como cualquiera.
- **Grupo de 3**: se completa con un jugador **de un grupo de cuatro**. Es solo un
  **préstamo de score**: presta su tarjeta para el mejor bola del grupo de 3,
  pero él cobra o paga únicamente con **su propio** grupo. No gana ni pierde
  doble.

La **mayoría que anula los caminos** se cuenta por participantes del concurso:
en Grupos vs. Grupos, **grupos** (regla 24 de la planilla: «más del 50% del no.
de grupos»); en los individuales, **jugadores** (regla 36). Con dos grupos de
distinto tamaño —5 contra 3— ganar uno es 1 de 2 = 50%, así que **no** anula y
los caminos se reparten.

## Temporadas

Todo lo acumulado —**Money List, Ranking, Pozo y Resultados**— se mira por
**temporada**, y una temporada es un **año**: las fechas con `date` 2026-… son
la temporada 2026. Dentro de la comunidad hay un selector de temporada encima de
esas cuatro pestañas; por defecto se abre la más reciente.

### Fechas jugadas antes de usar la app

Una comunidad puede haber jugado media temporada antes de instalar la app. Esas
fechas se cargan como **histórico**: entra lo que cada uno ganó o perdió y en
cuántas fechas jugó, y eso suma a la money list, al ranking y al pozo. **No se
inventan rondas**: no hay tarjeta ni scores de esas fechas, por eso en la Money
List las columnas «Mejor» y «Peor» solo miran lo jugado dentro de la app.

En el **perfil del jugador** pasa lo mismo: el balance total, las rondas jugadas
y la money list por comunidad suman esas fechas, con el desglose por temporada y
una nota de cuánto viene de antes.

### Las tarjetas de esas fechas

Si además se cargan las **tarjetas** (hoja `Registro Medal` de la planilla: los
golpes hoyo por hoyo y el hándicap del día), la temporada entra completa en las
**estadísticas**: scoring (birdies, pares, bogeys…), rendimiento hoyo por hoyo,
movimiento del hándicap, gross y neto ronda por ronda, y el **cara a cara** hoyo
a hoyo en todas esas fechas.

Se cargan con la acción `Cargar tarjetas anteriores a la app`, que lee
`scripts/tarjetas-<año>.json` y escribe la colección `gb_histcards_v1` — aparte
de la comunidad a propósito: son ~15 KB que no cambian nunca, así que se leen
**una sola vez al entrar** y no viajan en el sondeo de cada 15 segundos. La misma
acción con `BORRAR` las quita.

Esas fechas entran como rondas **solo tarjeta**: alimentan estadísticas pero
**nunca la plata**. La money list, el ranking, el pozo y el balance del perfil
las excluyen explícitamente, porque el dinero ya vive en `historico` y está
cuadrado contra la planilla. Tampoco aparecen en **Resultados**, porque de ellas
no tenemos los grupos, las parejas ni el desglose de cómo se ganó.

Se carga con la acción `Cargar temporada anterior a la app` (pestaña Actions),
que lee `scripts/historico-<año>.json`. Ese archivo lleva **solo los ids internos
de cada jugador, nunca nombres**, porque el repositorio es público. La misma
acción con `BORRAR` deshace la carga. Escribe únicamente el bloque
`historico.<año>` de la comunidad: las fechas ya guardadas no se tocan.

Los **invitados no entran**: no acumulan money list ni ranking, así que su plata
de esas fechas queda fuera de la carga y la money list de la temporada no suma
cero. Si alguien crea su cuenta después de la carga inicial, la misma acción
suma **un solo jugador** con `jugador_id`, `jugador_soles` y `jugador_fechas`.

Al cargar hay que **excluir las fechas que ya estén dentro de la app**, o se
contarían dos veces. La carga de 2026 trae las 10 fechas del 11/04 al 23/07; la
del 01/08 quedó fuera porque esa ya se jugó y consolidó en la app.

## Ranking y pozo de la comunidad

Dentro de cada comunidad, además de la Money List:

- **Ranking**: combina la money list con la asistencia. Cada componente se
  normaliza entre el mejor y el peor de la tabla (0 a 100) y se pondera; por
  defecto 50% y 50%, editable por los administradores en **⚙️ Reglas**. Solo
  entran los miembros (no los invitados) y solo las fechas de **2 grupos o
  más** — una fecha de un grupo suma a la Money List pero no al ranking.
  En la **tabla** solo aparecen los miembros con **al menos una fecha**: quien
  todavía no juega no figura hasta su primer registro. Su 0 **sí cuenta para
  normalizar**, igual que la hoja `Normalizacion`, que corre el cálculo sobre el
  padrón completo — sacarlos también de la cuenta subía el mínimo de
  participación y movía 6 de las 28 posiciones.
  La tabla se puede ordenar por ranking, por money list o por participación.
- **Pozo** (solo administradores): por fecha, toma lo que ganaron los
  ganadores de ese día y aplica los conceptos configurados —Mesa 35%, Prop 5%
  y Caja 10% por defecto, con nombres y porcentajes editables— más el
  acumulado de la temporada.

- **Cara a cara**: compara a dos miembros en las fechas que jugaron juntos, **con
  hándicap y por score, nunca por plata ni por gross**. El neto es el de ese día:
  los golpes menos los strokes que recibió cada uno con el % de la comunidad, con
  la base del evento — el mismo neto con el que se jugó el Individual general, así
  que el total de la fecha es exactamente la suma de los 18 hoyos. Cada fecha
  muestra el hándicap y los strokes de cada jugador. Se ven las fechas ganadas,
  los **hoyos ganados**, el promedio de neto y de gross y el mejor neto.
  Cada fecha se abre en un **match hoyo a hoyo** entre los dos: el neto y el
  gross de cada hoyo, un punto dorado en los hoyos donde recibe stroke, quién ganó
  el hoyo y el marcador acumulado (AS = empate).

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
