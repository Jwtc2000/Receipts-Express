// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shareOrDownloadFile } from './share'

function makeFile(): File {
  return new File(['x'], 'test.txt', { type: 'text/plain' })
}

beforeEach(() => {
  // jsdom implements neither the Web Share API nor createObjectURL — both
  // need explicit stubs to exercise this module at all.
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'canShare')
  Reflect.deleteProperty(navigator, 'share')
})

describe('shareOrDownloadFile', () => {
  it('shares the file and returns true when the share sheet succeeds', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })

    const result = await shareOrDownloadFile(makeFile(), 'My Title')

    expect(result).toBe(true)
    expect(share).toHaveBeenCalledWith({ files: [expect.any(File)], title: 'My Title' })
  })

  it('returns false, not an error, when the user cancels the share sheet', async () => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')),
      configurable: true,
    })

    await expect(shareOrDownloadFile(makeFile(), 'My Title')).resolves.toBe(false)
  })

  it('rethrows a non-AbortError share failure instead of reporting false success', async () => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(new Error('share sheet crashed')),
      configurable: true,
    })

    await expect(shareOrDownloadFile(makeFile(), 'My Title')).rejects.toThrow('share sheet crashed')
  })

  it('falls back to a download link and returns true when canShare is unavailable', async () => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const result = await shareOrDownloadFile(makeFile(), 'My Title')

    expect(result).toBe(true)
    expect(clickSpy).toHaveBeenCalledOnce()
  })

  it('returns false, not a false success, when the download click is blocked', async () => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked by browser')
    })
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')

    const result = await shareOrDownloadFile(makeFile(), 'My Title')

    expect(result).toBe(false)
    // The failed download's object URL is revoked immediately rather than
    // leaking, unlike the success path's deferred revoke.
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url')
  })
})
