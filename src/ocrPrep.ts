/**
 * Light text on a dark band (an app's coloured header, a dark-mode
 * screenshot) is lost to OCR: the engine's thresholding turns the band into
 * one black shape and the text in it with it. On a coffee chain's app receipt
 * that was the date. Inverting the rows of such a band makes it dark text on
 * light, which the engine reads like the rest.
 *
 * Only rows are inverted, whole. A row belongs to a band when even its
 * 75th-percentile pixel is dark: text never covers a quarter of a row, so a
 * band row stays dark there, while a white receipt photographed on a dark
 * table brightens far more than a quarter of the rows it crosses and is left
 * alone.
 */

// Rows darker than this at their 75th percentile are band rows (0-255).
const BAND_LEVEL = 110
// Fewer rows than this are a rule or a border, not a band holding text.
const MIN_BAND_ROWS = 8
// Rows added at each edge of a band, for its anti-aliased border.
const BAND_MARGIN = 2
// A dark-mode screenshot is dark nearly top to bottom. The engine reads a
// page that is inverted as a whole by itself, and inverting it here only
// turned its buttons and icons into dark shapes beside the text.
const MOSTLY_DARK = 0.8

/**
 * The [start, end) row ranges to invert in a greyscale image, in order and
 * never overlapping; none for a page that is dark nearly throughout.
 */
export function darkBandRows(gray: Uint8ClampedArray | Uint8Array, width: number, height: number): [number, number][] {
  const dark = new Uint8Array(height)
  const hist = new Uint32Array(256)
  const rank = Math.ceil(width * 0.75)
  for (let y = 0; y < height; y++) {
    hist.fill(0)
    for (let x = 0; x < width; x++) hist[gray[y * width + x]]++
    let seen = 0
    let p75 = 255
    for (let v = 0; v < 256; v++) {
      seen += hist[v]
      if (seen >= rank) {
        p75 = v
        break
      }
    }
    dark[y] = p75 < BAND_LEVEL ? 1 : 0
  }
  const bands: [number, number][] = []
  for (let y = 0; y < height; ) {
    if (!dark[y]) {
      y++
      continue
    }
    let end = y
    while (end < height && dark[end]) end++
    if (end - y >= MIN_BAND_ROWS) {
      const start = Math.max(0, y - BAND_MARGIN)
      const stop = Math.min(height, end + BAND_MARGIN)
      // A band broken by a row or two (the baseline of its text) comes out
      // as two runs whose margins meet. They are one band: inverted twice,
      // the rows they share would turn back into a dark line through the
      // text.
      const last = bands[bands.length - 1]
      if (last && start <= last[1]) last[1] = stop
      else bands.push([start, stop])
    }
    y = end
  }
  const covered = bands.reduce((rows, [start, end]) => rows + end - start, 0)
  return covered > height * MOSTLY_DARK ? [] : bands
}

/**
 * The image to OCR: the original when it has no dark band, otherwise a
 * greyscale copy with each band inverted. Anything going wrong also gives
 * the original, which is what was read before this step existed.
 */
export async function invertDarkBands(image: Blob): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== 'function') return image
    const bitmap = await createImageBitmap(image)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return image
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const { width, height } = canvas
    const pixels = ctx.getImageData(0, 0, width, height)
    const rgba = pixels.data
    const gray = new Uint8ClampedArray(width * height)
    for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
      gray[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
    }
    const bands = darkBandRows(gray, width, height)
    if (bands.length === 0) return image
    for (const [start, end] of bands) {
      for (let j = start * width; j < end * width; j++) gray[j] = 255 - gray[j]
    }
    for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
      rgba[i] = rgba[i + 1] = rgba[i + 2] = gray[j]
      rgba[i + 3] = 255
    }
    ctx.putImageData(pixels, 0, 0)
    // PNG: a lossy copy would add artefacts around exactly the text this is for.
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return out ?? image
  } catch {
    return image
  }
}
