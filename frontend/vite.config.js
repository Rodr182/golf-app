import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Sello de esta compilación. Se mete en el código (__BUILD__) y además se
// publica en version.json, para que una app abierta hace días detecte que
// hay una versión nueva y se actualice en vez de seguir con la vieja.
const BUILD = new Date().toISOString().replace(/\.\d+Z$/, "Z");

const sello = () => ({
  name: "sello-de-version",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD }) });
  },
});

// El modo "single" genera un único index.html con todo incluido (JS/CSS inline),
// útil para compartir la app como un solo archivo o publicar una vista previa.
export default defineConfig(({ mode }) => ({
  // Rutas relativas para que el sitio funcione en cualquier hosting,
  // incluido GitHub Pages (que sirve bajo /golf-app/).
  base: "./",
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: mode === "single" ? [react(), viteSingleFile()] : [react(), sello()],
  build: {
    outDir: mode === "single" ? "dist-single" : "dist",
  },
}));
