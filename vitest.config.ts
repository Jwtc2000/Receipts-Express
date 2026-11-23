import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      // A Vite-plugin virtual module; see src/test/pwa-register-stub.ts.
      'virtual:pwa-register': fileURLToPath(new URL('./src/test/pwa-register-stub.ts', import.meta.url)),
    },
  },
  test: {
    // Most tests are plain data/logic tests with no DOM — kept on the fast
    // 'node' environment. Files that actually need a DOM (component tests,
    // anything touching `document`/`canvas`) opt in individually via a
    // `// @vitest-environment jsdom` pragma comment at the top of the file.
    environment: 'node',
    setupFiles: ['./src/test/localstorage-mock.ts', './src/test/jest-dom-setup.ts'],
  },
})
