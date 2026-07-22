import { defineConfig } from 'tsup';

export default defineConfig([
  {
    name: 'lib',
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node22',
    platform: 'node',
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
  },
  {
    name: 'cli',
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    target: 'node22',
    platform: 'node',
    dts: false,
    sourcemap: true,
    clean: false,
    splitting: false,
    shims: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  {
    name: 'github-action',
    entry: { 'action-entry': 'src/action-entry.ts' },
    format: ['esm'],
    target: 'node22',
    platform: 'node',
    dts: false,
    sourcemap: true,
    clean: false,
    splitting: false,
    shims: true,
  },
]);
