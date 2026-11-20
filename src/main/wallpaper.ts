// What is behind the panels, so Blur and Frosted panels can blur it themselves inside their rounded
// shape. Windows 11 draws its own blur over a window's whole rectangle, which left square corners.
// The desktop window (wallpaper, live wallpapers, desktop overlays) is drawn into a bitmap with
// PrintWindow; the panels are not part of it, so nothing has to be hidden and screenshots still
// show them.
import { nativeImage, screen } from 'electron'

export interface Backdrop { stamp: string; displays: { id: number; url: string }[] }

interface Gdi {
  progman: () => bigint
  rect: (h: bigint) => { x: number; y: number; w: number; h: number }
  capture: (h: bigint, w: number, hgt: number) => Buffer | null
}

let gdi: Gdi | null | undefined

function load(): Gdi | null {
  if (gdi !== undefined) return gdi
  gdi = null
  if (process.platform !== 'win32') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const koffi = require('koffi')
    const user32 = koffi.load('user32.dll')
    const g32 = koffi.load('gdi32.dll')
    koffi.struct('BdRect', { l: 'int', t: 'int', r: 'int', b: 'int' })
    koffi.struct('BdBih', {
      biSize: 'uint32', biWidth: 'int32', biHeight: 'int32', biPlanes: 'uint16', biBitCount: 'uint16', biCompression: 'uint32',
      biSizeImage: 'uint32', biXPelsPerMeter: 'int32', biYPelsPerMeter: 'int32', biClrUsed: 'uint32', biClrImportant: 'uint32'
    })
    const findWindow = user32.func('intptr_t __stdcall FindWindowW(str16 cls, str16 title)')
    const getRect = user32.func('bool __stdcall GetWindowRect(intptr_t h, _Out_ BdRect *r)')
    const printWindow = user32.func('bool __stdcall PrintWindow(intptr_t h, intptr_t dc, uint32_t flags)')
    const createDC = g32.func('intptr_t __stdcall CreateCompatibleDC(intptr_t dc)')
    const createDib = g32.func('intptr_t __stdcall CreateDIBSection(intptr_t dc, BdBih *info, uint32_t usage, _Out_ void **bits, intptr_t section, uint32_t offset)')
    const select = g32.func('intptr_t __stdcall SelectObject(intptr_t dc, intptr_t obj)')
    const del = g32.func('bool __stdcall DeleteObject(intptr_t obj)')
    const delDC = g32.func('bool __stdcall DeleteDC(intptr_t dc)')
    // One bitmap, kept while the desktop keeps its size.
    let dib: { dc: bigint; bmp: bigint; bits: unknown; w: number; h: number } | null = null
    gdi = {
      progman: () => findWindow('Progman', null),
      rect: (h) => { const r: any = {}; getRect(h, r); return { x: r.l, y: r.t, w: r.r - r.l, h: r.b - r.t } },
      capture: (h, w, hgt) => {
        if (!dib || dib.w !== w || dib.h !== hgt) {
          if (dib) { del(dib.bmp); delDC(dib.dc) }
          const dc = createDC(0)
          const out = [null]
          // Negative height: rows top to bottom; 32 bits per pixel, BGRA.
          const bmp = createDib(dc, { biSize: 40, biWidth: w, biHeight: -hgt, biPlanes: 1, biBitCount: 32, biCompression: 0, biSizeImage: 0, biXPelsPerMeter: 0, biYPelsPerMeter: 0, biClrUsed: 0, biClrImportant: 0 }, 0, out, 0, 0)
          if (!bmp || !out[0]) { delDC(dc); dib = null; return null }
          select(dc, bmp)
          dib = { dc, bmp, bits: out[0], w, h: hgt }
        }
        // 2 = PW_RENDERFULLCONTENT: includes content drawn with DirectX (live wallpapers).
        if (!printWindow(h, dib.dc, 2)) return null
        // A copy: Electron doesn't allow buffers that point into native memory.
        const px: Uint8Array = koffi.decode(dib.bits, koffi.array('uint8', w * hgt * 4, 'Typed'))
        return Buffer.from(px.buffer, px.byteOffset, px.byteLength)
      }
    }
  } catch {
    gdi = null
  }
  return gdi
}

let last: Backdrop | null = null
let busy = false

/** A small picture of what is behind each screen's panels; `same` when nothing new was taken. */
export async function backdrop(stamp?: string): Promise<Backdrop | { same: true } | null> {
  const g = load()
  if (!g) return null
  if (busy) return last && last.stamp !== stamp ? last : { same: true }
  busy = true
  try {
    const pm = g.progman()
    if (!pm) return null
    const r = g.rect(pm)
    if (r.w <= 0 || r.h <= 0) return null
    const raw = g.capture(pm, r.w, r.h)
    if (!raw) return null
    const full = nativeImage.createFromBitmap(raw, { width: r.w, height: r.h })
    const displays: Backdrop['displays'] = []
    for (const d of screen.getAllDisplays()) {
      const p = screen.dipToScreenRect(null, d.bounds)
      const crop = { x: p.x - r.x, y: p.y - r.y, width: p.width, height: p.height }
      if (crop.x < 0 || crop.y < 0 || crop.x + crop.width > r.w || crop.y + crop.height > r.h) continue
      // A quarter of the size is plenty for something that gets blurred.
      const small = full.crop(crop).resize({ width: Math.max(64, Math.round(d.bounds.width / 4)), quality: 'good' })
      displays.push({ id: d.id, url: 'data:image/jpeg;base64,' + small.toJPEG(80).toString('base64') })
    }
    last = { stamp: String(Date.now()), displays }
    return last
  } catch {
    return null
  } finally {
    busy = false
  }
}
