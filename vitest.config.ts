import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Most tests are plain data/logic tests with no DOM — kept on the fast
    // 'node' environment. Files that actually need a DOM (component tests,
    // anything touching `document`/`canvas`) opt in individually via a
    // `// @vitest-environment jsdom` pragma comment at the top of the file.
    environment: 'node',
    setupFiles: ['./src/test/localstorage-mock.ts', './src/test/jest-dom-setup.ts'],
  },
})
