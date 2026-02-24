import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    cli: 'src/cli/index.ts'
  },
  format: ['esm'],
  target: 'node20',
  splitting: false,
  sourcemap: true,
  clean: true,
  banner: {
    js: '#!/usr/bin/env node'
  }
})
