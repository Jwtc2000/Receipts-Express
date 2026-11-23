/** Downscale + compress a captured photo so storage and PDFs stay lean. */
export async function compressImage(file: Blob, maxDim = 1800, quality = 0.85): Promise<Blob> {
  const bitmap = await loadBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image compression failed: no 2D canvas available')
  // JPEG has no transparency. A transparent area drawn onto an unfilled
  // canvas comes out black, so a PNG receipt with a transparent background
  // was stored as dark text on black. Paper is white.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  if ('close' in bitmap) bitmap.close()

  return encodeJpeg(canvas, quality)
}

/**
 * Encode a canvas as JPEG and release its pixel buffer. A canvas holds its
 * full-size buffer until it is garbage-collected, and a 25-page PDF makes
 * one per page; on a phone that is enough to make the next allocation fail.
 */
export function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image compression failed'))),
      'image/jpeg',
      quality,
    )
  }).finally(() => {
    canvas.width = 0
    canvas.height = 0
  })
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file)
    } catch {
      // fall through to <img> loading
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not load image'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function imageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Could not read image dimensions'))
    img.src = dataUrl
  })
}
