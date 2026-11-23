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

/** A greyscale copy of an image, ready to work on, or null where the browser cannot make one. */
async function toGray(image: Blob): Promise<{ gray: Uint8ClampedArray; width: number; height: number } | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
  const bitmap = await createImageBitmap(image)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const { width, height } = canvas
  const rgba = ctx.getImageData(0, 0, width, height).data
  const gray = new Uint8ClampedArray(width * height)
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    gray[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
  }
  return { gray, width, height }
}

/** A PNG of a greyscale image. PNG: a lossy copy would add artefacts around exactly the text this is for. */
async function fromGray(gray: Uint8ClampedArray, width: number, height: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const pixels = ctx.createImageData(width, height)
  const rgba = pixels.data
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    rgba[i] = rgba[i + 1] = rgba[i + 2] = gray[j]
    rgba[i + 3] = 255
  }
  ctx.putImageData(pixels, 0, 0)
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
}

/**
 * The image to OCR: the original when it has no dark band, otherwise a
 * greyscale copy with each band inverted. Anything going wrong also gives
 * the original, which is what was read before this step existed.
 */
export async function invertDarkBands(image: Blob): Promise<Blob> {
  try {
    const page = await toGray(image)
    if (!page) return image
    const { gray, width, height } = page
    const bands = darkBandRows(gray, width, height)
    if (bands.length === 0) return image
    for (const [start, end] of bands) {
      for (let j = start * width; j < end * width; j++) gray[j] = 255 - gray[j]
    }
    return (await fromGray(gray, width, height)) ?? image
  } catch {
    return image
  }
}

/*
 * Dot-matrix print, and thermal print from a printer low on heat, draws each
 * character as separate dots. The engine reads the gaps as breaks in the
 * stroke and the letters come out wrong or not at all ("VRN Q LT" for a name
 * a person reads at a glance). Thickening every dark pixel by one pixel
 * closes the gaps, a blur rounds the joined dots into strokes, and a
 * contrast stretch before and after keeps faint print dark enough to survive
 * both. On print with solid strokes it does harm (letters thicken into each
 * other), so it is used only for a second reading when the first was unsure;
 * see extractReceipt in ocr.ts.
 */

/** Spread the darkest and lightest 1% of pixels to black and white. */
function stretch(gray: Uint8ClampedArray): Uint8ClampedArray {
  const hist = new Uint32Array(256)
  for (const v of gray) hist[v]++
  const cut = gray.length * 0.01
  let lo = 0
  let hi = 255
  for (let v = 0, seen = 0; v < 256; v++) {
    seen += hist[v]
    if (seen > cut) {
      lo = v
      break
    }
  }
  for (let v = 255, seen = 0; v >= 0; v--) {
    seen += hist[v]
    if (seen > cut) {
      hi = v
      break
    }
  }
  if (hi - lo < 10) return gray
  const out = new Uint8ClampedArray(gray.length)
  for (let i = 0; i < gray.length; i++) out[i] = ((gray[i] - lo) * 255) / (hi - lo)
  return out
}

/** Each pixel takes the darkest value around it (3x3): dark marks grow by a pixel. */
function thicken(gray: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let m = 255
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) m = Math.min(m, gray[(y + dy) * width + x + dx])
      }
      out[y * width + x] = m
    }
  }
  return out
}

/** A Gaussian blur of about one pixel (binomial 1-4-6-4-1, across then down). */
function blur(gray: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const across = new Uint8ClampedArray(gray)
  for (let y = 0; y < height; y++) {
    for (let x = 2; x < width - 2; x++) {
      const i = y * width + x
      across[i] = (gray[i - 2] + 4 * gray[i - 1] + 6 * gray[i] + 4 * gray[i + 1] + gray[i + 2] + 8) >> 4
    }
  }
  const out = new Uint8ClampedArray(across)
  for (let y = 2; y < height - 2; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const w = width
      out[i] = (across[i - 2 * w] + 4 * across[i - w] + 6 * across[i] + 4 * across[i + w] + across[i + 2 * w] + 8) >> 4
    }
  }
  return out
}

/** Dotted strokes joined into solid ones, in a greyscale image. */
export function joinDotsGray(gray: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  return stretch(blur(thicken(stretch(gray), width, height), width, height))
}

/**
 * A copy of the image with dotted print joined into solid strokes, for a
 * second reading; null where the browser cannot make one, so that no second
 * reading is attempted. Like the dark-band copy, it exists only for the scan.
 */
export async function joinDots(image: Blob): Promise<Blob | null> {
  try {
    const page = await toGray(image)
    if (!page) return null
    return await fromGray(joinDotsGray(page.gray, page.width, page.height), page.width, page.height)
  } catch {
    return null
  }
}
