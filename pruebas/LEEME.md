# Pruebas

Estas pruebas leen el código **tal como está** en `frontend/src/App.jsx` (extraen
las funciones del archivo, no las copian), así que si alguien cambia una regla
del Machetero y rompe algo, la prueba lo dice.

Antes vivían fuera del repositorio y se perdieron cuando se reinició la máquina
donde corrían. Por eso ahora van acá.

## Cómo correrlas

Las de lógica no necesitan nada más que Node:

```
node pruebas/test-auditoria.mjs
```

Las que abren un navegador (`smoke-*.mjs`) necesitan Playwright y la app
levantada. Playwright no está en las dependencias del proyecto a propósito, para
no hacer más lenta la publicación; se instala solo cuando hace falta:

```
npm i --no-save playwright                              # una vez
cd frontend && npm run build:local && npm run preview   # deja esto corriendo
node pruebas/smoke-auditoria.mjs                        # en otra terminal
```

Las capturas van al directorio actual; con `SHOTS_DIR=/otra/ruta` van a otro lado.

`build:local` compila **sin** las claves de la nube, para que la prueba no toque
los datos de verdad. Nunca hay que vaciar `frontend/src/config.js` para probar:
ese archivo lleva las claves reales y si se sube en blanco, nadie puede entrar.

Cada prueba termina en `RESULTADO: todo correcto` o enumera lo que falló, y
devuelve un código de salida distinto de cero si algo se rompió.

## Qué cubre cada una

| Archivo | Qué revisa |
|---|---|
| `test-auditoria.mjs` | El cuadre de la plata (el Machetero es de suma cero), los netos y los strokes rehechos desde la tarjeta, el hándicap positivo, y los avisos: tarjeta incompleta, golpes poco creíbles, grupos fuera de 3–5, saltos de hándicap e invitados. |
| `smoke-auditoria.mjs` | El recorrido completo en el navegador: se juega una fecha de dos grupos, se consolida, el administrador ve la auditoría con las tarjetas, y un miembro que no es administrador **no** la ve. |
