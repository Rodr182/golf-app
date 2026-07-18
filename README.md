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

## Dónde se guardan los datos

Por ahora los datos se guardan en el navegador de cada usuario
(`localStorage`). El siguiente paso del proyecto es conectar la carpeta
`backend/` con Supabase para que las cuentas, comunidades y rondas se
compartan entre todos los usuarios.

## Estructura

- `frontend/` — la web app (React + Vite). Toda la lógica está en `frontend/src/App.jsx`.
- `backend/` — esqueleto de servidor Express (aún sin implementar).
- `supabase/` — configuración local de Supabase (aún sin usar).
