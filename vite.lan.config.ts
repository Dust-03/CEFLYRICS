import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// La página de las teles va aparte del resto: un solo script común y sintaxis de 2017, porque el
// navegador de un televisor puede tener muchos años. Las fuentes y el logo quedan adentro.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@render-engine': resolve('packages/render-engine/src'),
    },
  },
  build: {
    outDir: 'out/lan',
    target: 'es2017',
    cssTarget: 'chrome61',
    lib: {
      entry: resolve('src/renderer/lan/main.ts'),
      name: 'pantalla',
      formats: ['iife'],
      fileName: () => 'pantalla.js',
      cssFileName: 'pantalla',
    },
  },
});
