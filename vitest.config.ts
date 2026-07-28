import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    // Argon2id at 256 MiB is deliberately slow, and each ceremony runs several.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Each file gets a clean process: the vault module holds the DEK in module
    // state, and running several 256 MiB derivations at once helps nobody.
    pool: 'forks',
    fileParallelism: false
  },
  resolve: {
    alias: { '@shared': resolve(root, 'src/shared') }
  }
})
