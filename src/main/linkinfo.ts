import { net } from 'electron'

export interface LinkInfo { title?: string; desc?: string; site?: string; icon?: string }

const decode = (s: string): string =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim()

/** Reads the title, description, site name and icon of a web page (for bookmark blocks). */
export async function linkInfo(raw: string): Promise<LinkInfo> {
  let url: URL
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw) } catch { return {} }
  if (!/^https?:$/.test(url.protocol)) return {}
  const base: LinkInfo = { site: url.hostname.replace(/^www\./, ''), icon: `${url.origin}/favicon.ico` }
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 8000)
    const res = await net.fetch(url.href, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', Accept: 'text/html' } })
    clearTimeout(timer)
    if (!res.ok || !/html/i.test(res.headers.get('content-type') ?? '')) return base
    const html = (await res.text()).slice(0, 400_000)
    const head = html.slice(0, html.search(/<\/head>/i) > 0 ? html.search(/<\/head>/i) : 200_000)
    const meta = (name: string): string | undefined => {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i')
      const tag = head.match(re)?.[0]
      const c = tag?.match(/content=["']([^"']*)["']/i)?.[1]
      return c ? decode(c) : undefined
    }
    const title = meta('og:title') ?? meta('twitter:title') ?? (head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ? decode(head.match(/<title[^>]*>([^<]*)<\/title>/i)![1]) : undefined)
    const desc = meta('og:description') ?? meta('description') ?? meta('twitter:description')
    const site = meta('og:site_name') ?? base.site
    const iconHref = head.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1]
    let icon = base.icon
    if (iconHref) { try { const u = new URL(decode(iconHref), res.url || url.href); if (/^https:$/.test(u.protocol)) icon = u.href } catch { /* keep the default */ } }
    return { title: title?.slice(0, 200), desc: desc?.slice(0, 300), site, icon }
  } catch {
    return base
  }
}
