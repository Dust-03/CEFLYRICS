import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared'), '@render-engine': resolve('packages/render-engine/src') } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
