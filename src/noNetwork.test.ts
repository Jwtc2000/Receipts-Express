import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The tripwire under the privacy position.
 *
 * docs/privacy.html section 4 tells the reader "there is no server, and your
 * data never leaves your device", and section 6 calls loading the app "the one
 * network interaction". The Terms, the consumer health data policy and the
 * pilot material all lean on the same fact. None of it is enforced by anything
 * except the source: there is no server to inspect, no telemetry to audit, and
 * the Content-Security-Policy is a <meta> tag that constrains where a request
 * may go, not whether one is made at all.
 *
 * So the claim is exactly as durable as this test. If it fails, the app has
 * gained a way to open a connection of its own, and three pages published on
 * the public web have become false descriptions of it. Deleting or loosening
 * this test to make a build pass is therefore not a test change. Either the
 * new code goes, or those pages have to be rewritten first.
 *
 * What is deliberately *not* flagged: static and dynamic `import(...)`, which
 * load the app's own modules from its own origin and are what the service
 * worker caches; and `<img src>` / worker construction, which are same-origin
 * by construction here. Those are the loading of the app that section 6
 * describes. What is flagged is any API whose purpose is to send or receive
 * data on the app's own initiative.
 */
const FORBIDDEN: { pattern: RegExp; label: string }[] = [
  { pattern: /\bfetch\s*\(/, label: 'fetch(' },
  { pattern: /\bXMLHttpRequest\b/, label: 'XMLHttpRequest' },
  { pattern: /\bsendBeacon\b/, label: 'sendBeacon' },
  { pattern: /\bWebSocket\b/, label: 'WebSocket' },
  { pattern: /\bEventSource\b/, label: 'EventSource' },
]

const SRC_DIR = fileURLToPath(new URL('.', import.meta.url))

/**
 * Every non-test source file under src/, relative to src/.
 *
 * Test files are excluded because they legitimately name these APIs (this file
 * does so a dozen times). src/test/ holds only the vitest setup helpers, which
 * are never bundled into the app, so it is excluded on the same grounds.
 */
function collectSourceFiles(dir: string, prefix = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (entry.name === 'test') continue
      found.push(...collectSourceFiles(join(dir, entry.name), rel))
      continue
    }
    if (!/\.tsx?$/.test(entry.name)) continue
    if (/\.test\.tsx?$/.test(entry.name)) continue
    found.push(rel)
  }
  return found.sort()
}

const SOURCE_FILES = collectSourceFiles(SRC_DIR)

/**
 * The source with comment bodies removed and everything else — string and
 * template literal contents included — left alone.
 *
 * Comments are excluded because the ones in this repo explain the very
 * boundary being guarded ("never fetch a URL from the backup file", in
 * backup.ts), and a rule that fires on its own rationale gets deleted rather
 * than obeyed. String contents are kept: a call assembled in a string is still
 * a call, and there is no legitimate reason for one of these names to appear
 * in app text.
 *
 * Newlines inside a removed comment are preserved so reported line numbers
 * still match the file on disk. Quote tracking exists only so that `//` inside
 * a URL literal isn't mistaken for a comment; regular-expression literals are
 * not tracked, so a regex containing an odd number of quote characters can
 * leave the scanner treating following comments as code. That direction is the
 * safe one — it can raise a false alarm a human then reads, but it can never
 * hide a real call.
 */
function stripComments(source: string): string {
  let out = ''
  let quote: string | null = null
  let i = 0
  while (i < source.length) {
    const c = source[i]
    const next = source[i + 1]
    if (quote) {
      if (c === '\\') {
        out += c + (next ?? '')
        i += 2
        continue
      }
      if (c === quote) quote = null
      out += c
      i++
      continue
    }
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++
      continue
    }
    if (c === '/' && next === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n'
        i++
      }
      i += 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    out += c
    i++
  }
  return out
}

/** Every forbidden name in `source`, as "line N: <the line>" strings. */
function findNetworkCalls(source: string): string[] {
  const hits: string[] = []
  const lines = stripComments(source).split('\n')
  lines.forEach((line, index) => {
    for (const { pattern, label } of FORBIDDEN) {
      if (pattern.test(line)) hits.push(`line ${index + 1} (${label}): ${line.trim()}`)
    }
  })
  return hits
}

describe('the app opens no network connection of its own', () => {
  // A walk that silently finds nothing would make every assertion below pass
  // while checking no code at all, which is the one failure mode of a tripwire
  // that nobody notices. Pinned against files that have to exist for the app
  // to run at all.
  it('scans the whole app, not an empty list', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(15)
    expect(SOURCE_FILES).toContain('main.tsx')
    expect(SOURCE_FILES).toContain('App.tsx')
    expect(SOURCE_FILES).toContain('backup.ts')
    expect(SOURCE_FILES).toContain('ocr.ts')
    expect(SOURCE_FILES).toContain('components/ExpenseEditor.tsx')
    expect(SOURCE_FILES.some((f) => f.endsWith('.test.ts') || f.endsWith('.test.tsx'))).toBe(false)
  })

  it.each(SOURCE_FILES)('%s makes no outbound request', (file) => {
    const source = readFileSync(join(SRC_DIR, file), 'utf-8')
    // Cheap raw check first, so the comment stripper only ever runs on a file
    // that already looks like a problem. On a clean file the stripper cannot
    // influence the result at all.
    if (!FORBIDDEN.some(({ pattern }) => pattern.test(source))) return
    expect(findNetworkCalls(source)).toEqual([])
  })

  // The scanner is the thing being trusted, so it gets checked too — a
  // stripper that quietly swallowed the whole file would leave every case
  // above green.
  describe('the scanner itself', () => {
    it('finds each forbidden name in real code', () => {
      expect(findNetworkCalls('const r = await fetch(url)')).toHaveLength(1)
      expect(findNetworkCalls('const x = new XMLHttpRequest()')).toHaveLength(1)
      expect(findNetworkCalls('navigator.sendBeacon(url, body)')).toHaveLength(1)
      expect(findNetworkCalls('const s = new WebSocket(url)')).toHaveLength(1)
      expect(findNetworkCalls('const e = new EventSource(url)')).toHaveLength(1)
    })

    it('ignores the same names in comments', () => {
      expect(findNetworkCalls('// nothing here calls fetch(url)')).toEqual([])
      expect(findNetworkCalls('/* no XMLHttpRequest, no WebSocket */')).toEqual([])
      expect(findNetworkCalls('/**\n * never sendBeacon\n */\nconst a = 1')).toEqual([])
    })

    it('does not mistake a URL inside a string for a comment', () => {
      expect(findNetworkCalls('const u = "https://example.test" // fetch(x)')).toEqual([])
      expect(findNetworkCalls('const u = "https://x/" + fetch(y)')).toHaveLength(1)
    })

    it('keeps line numbers aligned with the file after removing a block comment', () => {
      const source = ['/*', ' * a block comment', ' */', 'const r = fetch(u)'].join('\n')
      expect(findNetworkCalls(source)).toEqual(['line 4 (fetch(): const r = fetch(u)'])
    })

    it('leaves import() alone — loading the app is not sending data', () => {
      expect(findNetworkCalls("const { jsPDF } = await import('jspdf')")).toEqual([])
    })
  })
})
