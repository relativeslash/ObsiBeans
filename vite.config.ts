import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { LAYERS } from './tools/architecture.ts';

const moduleThreshold = { lines: 90, branches: 80 };

export default defineConfig({
  plugins: [svelte()],
  // The repository root is an Obsidian vault, which skips dot-folders; the defaults would recreate node_modules.
  cacheDir: '.cache/vite',
  resolve: process.env.VITEST ? { conditions: ['browser'] } : {},
  build: {
    target: 'es2024',
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: 'inline',
    lib: { entry: 'src/plugin/main.ts', formats: ['cjs'], fileName: () => 'main.js', cssFileName: 'styles' },
    rolldownOptions: {
      external: ['obsidian', 'electron', /^@codemirror\//, /^@lezer\//, /^node:/, ...builtinModules],
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    fsModuleCachePath: '.cache/vitest',
    alias: { obsidian: fileURLToPath(new URL('test/support/obsidian.ts', import.meta.url)) },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,svelte}'],
      reporter: ['text', 'lcov'],
      thresholds: {
        ...moduleThreshold,
        ...Object.fromEntries(LAYERS.map((layer) => [`${layer.root}**`, moduleThreshold])),
      },
    },
  },
});
