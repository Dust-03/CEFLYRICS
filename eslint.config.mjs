import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
  {
    ignores: ['out/', 'release/', 'node_modules/', 'test-results/', 'playwright-report/', 'tests/.media/', 'userdata/'],
  },
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Las pruebas y los ganchos de medición entran a window sin tipos.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // El prototipo es Node sin compilar, con require.
    files: ['prototype/server.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
);
