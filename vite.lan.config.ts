import { resolve } from 'node:path';
import ts from 'typescript';
import { defineConfig, type Plugin } from 'vite';

// Vite no baja de 2015: la última vuelta hasta la sintaxis de 2009 la da TypeScript. Con una sola
// palabra que no entienda, una tele vieja no ejecuta nada y queda en blanco.
const es5: Plugin = {
  name: 'es5',
  generateBundle(_options, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type !== 'chunk') continue;
      file.code = ts.transpileModule(file.code, {
        compilerOptions: { target: ts.ScriptTarget.ES5, downlevelIteration: true, ignoreDeprecations: '6.0' },
      }).outputText;
    }
  },
};

// La página de las teles va aparte del resto: un solo script común, porque el navegador de un
// televisor puede tener muchos años. El logo queda adentro y las fuentes, en la hoja de estilo.
export default defineConfig({
  plugins: [es5],
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
