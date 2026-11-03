import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'electron-vite';

const alias = {
  '@shared': resolve('src/shared'),
  '@render-engine': resolve('packages/render-engine/src'),
};

export default defineConfig({
  main: {
    resolve: { alias },
  },
  preload: {
    resolve: { alias },
    // Los preload con sandbox tienen que ser CommonJS.
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias },
    plugins: [svelte()],
    build: {
      rollupOptions: {
        input: {
          operator: resolve('src/renderer/operator/index.html'),
          output: resolve('src/renderer/output/index.html'),
        },
      },
    },
  },
});
