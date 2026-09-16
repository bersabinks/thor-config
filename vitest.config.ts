import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Même alias que le process main (electron.vite.config.ts) : MockAdbClient en dépend.
    alias: {
      '@mocks': resolve(__dirname, 'src/mocks'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'electron/**/*.test.ts'],
  },
})
