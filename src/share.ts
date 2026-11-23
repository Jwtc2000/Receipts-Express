/**
 * Hand a file to the OS share sheet if available (mobile: save to Files,
 * Drive, Dropbox, …); otherwise trigger a plain browser download.
 * Returns true if the file was handed off, false if the user cancelled the
 * share sheet or the handoff could not be initiated.
 *
 * Caveat callers must respect: the download path can only confirm that the
 * browser *accepted* the download, not that the user actually kept the file —
 * a plain <a download> fires no completion event. So a `true` here means
 * "handed to the browser", not "safely saved". Callers that record a backup as
 * complete (see backup.ts) should treat it as best-effort, not proof.
 */
export async function shareOrDownloadFile(file: File, shareTitle: string): Promise<boolean> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: shareTitle })
      return true
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return false
      // Any other refusal falls through to the download below. The usual one
      // is NotAllowedError: the share sheet needs a recent tap, and building
      // a large PDF or backup can take longer than the browser allows. The
      // file is already made, so saving it beats reporting a failure that
      // retrying would only repeat.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch {
    // The click was blocked/failed — report failure rather than a false success.
    URL.revokeObjectURL(url)
    return false
  }
  // Revoking synchronously right after click() can cancel the download before
  // the browser has read the blob (a known footgun on some browsers). Defer it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}

/** Characters that cannot appear in a file name on one platform or another. */
export function safeFileName(name: string, fallback: string): string {
  // Letters in any script are kept. Stripping to ASCII turned a report named
  // in Japanese or Greek into "_".
  const cleaned = name.replace(/[\s\/\\:*?"<>|\u0000-\u001f]+/g, '_').replace(/^[._]+|[._]+$/g, '')
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : fallback
}
