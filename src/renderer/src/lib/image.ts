/** Read an image file and shrink it to a small JPEG data URL (fits in the JSON data file). */
export function imageToDataUrl(file: Blob, maxW = 480, maxH = 480, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxW / img.width, maxH / img.height)
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')
      if (!ctx) return reject(new Error('No canvas'))
      ctx.drawImage(img, 0, 0, w, h)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image')) }
    img.src = url
  })
}

/** Open a file picker for one image. */
export function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/** Pick an image and return it shrunk to a data URL (null when cancelled or unreadable). */
export async function pickImageData(maxW = 1600, maxH = 1600, quality = 0.85): Promise<string | null> {
  const f = await pickImage()
  if (!f) return null
  try { return await imageToDataUrl(f, maxW, maxH, quality) } catch { return null }
}
