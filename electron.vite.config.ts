import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'electron-vite';
import { build, type Plugin } from 'vite';

const alias = {
  '@shared': resolve('src/shared'),
  '@render-engine': resolve('packages/render-engine/src'),
};

// La página de las teles se compila con cada build, para que nunca falte ni quede vieja.
const lanPage = (): Plugin => ({
  name: 'cef-lan-page',
  async closeBundle() {
    await build({ configFile: resolve('vite.lan.config.ts'), logLevel: 'warn' });
  },
});

export default defineConfig({
  main: {
    resolve: { alias },
    plugins: [lanPage()],
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
