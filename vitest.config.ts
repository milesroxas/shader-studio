import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'payload/node'
import { defineConfig } from 'vitest/config'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Two projects: `unit` runs the pure core (recipes, stills, hashes, the
 * draft-versus-published reading) with no database; `int` boots Payload on an
 * in-memory SQLite database from `dev/payload.config.ts` and exercises the
 * collection, the endpoints and the hydration end to end.
 */
export default defineConfig(() => {
  loadEnv(path.resolve(dirname, './dev'))

  return {
    resolve: { tsconfigPaths: true },
    test: {
      projects: [
        {
          test: {
            name: 'unit',
            environment: 'node',
            include: ['src/**/*.test.ts'],
          },
        },
        {
          test: {
            name: 'int',
            environment: 'node',
            include: ['dev/int.spec.ts'],
            hookTimeout: 60_000,
            testTimeout: 60_000,
            fileParallelism: false,
          },
        },
      ],
    },
  }
})
