import { describe, expect, it, vi } from 'vitest'
import { build } from 'vite'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf-8'),
)

describe('app version wiring', () => {
  // package.json's version is the single source of truth (vite.config.ts injects
  // it as __APP_VERSION__ into the bundle, and About renders it). Building for
  // real and asserting the exact string lands in the output means any future
  // severing of that wire — a hardcoded literal, a dropped define — fails CI.
  it('the production build inlines the exact package.json version', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'version-build-'))
    try {
      vi.stubEnv('NODE_ENV', 'production')
      try {
        await build({ logLevel: 'silent', build: { outDir, emptyOutDir: true } })
      } finally {
        vi.unstubAllEnvs()
      }
      // The JavaScript only. The whole output used to be searched, and the
      // version also appears in THIRD_PARTY_NOTICES.md, which the build
      // copies in, so the test passed whether or not the app showed it.
      const assets = join(outDir, 'assets')
      const bundle = readdirSync(assets)
        .filter((f) => f.endsWith('.js'))
        .map((f) => readFileSync(join(assets, f), 'utf-8'))
        .join('\n')
      // As a string literal, in whichever quote the minifier chose.
      const literal = new RegExp(`["'\`]${pkg.version.replace(/\./g, '\\.')}["'\`]`)
      expect(bundle).toMatch(literal)
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  }, 30_000)
})
