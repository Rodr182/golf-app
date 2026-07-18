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

## Usuario de prueba

- Email: `demo@golf.com` · Contraseña: `demo`

Incluye datos de ejemplo: la comunidad **Korn Ferry Boys** (25 jugadores) con
una fecha jugada en Golf Los Inkas, y la cancha Asia Golf.

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
