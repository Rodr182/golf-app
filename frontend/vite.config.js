import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// El modo "single" genera un único index.html con todo incluido (JS/CSS inline),
// útil para compartir la app como un solo archivo o publicar una vista previa.
export default defineConfig(({ mode }) => ({
  plugins: mode === "single" ? [react(), viteSingleFile()] : [react()],
  build: {
    outDir: mode === "single" ? "dist-single" : "dist",
  },
}));
