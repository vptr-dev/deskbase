import { useLayoutEffect, useRef, type ReactNode } from 'react'

/** Measure in the panel's document so detached desktop windows use their own viewport. */
export function PanelBody({ desktop, children }: { desktop?: boolean; children: ReactNode }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const body = ref.current
    const panel = body?.parentElement
    const win = body?.ownerDocument.defaultView
    if (!body || !panel || !win) return
    let frame = 0
    const fit = (): void => {
      frame = 0
      if (!body.isConnected || !panel.clientHeight || !panel.clientWidth) return
      const oldTop = body.scrollTop
      const oldLeft = body.scrollLeft
      const parents = [body, ...Array.from(body.children).filter((el): el is HTMLElement => 'offsetHeight' in el)]
      // Respect the chosen text size when it fits. Lists with their own scroll area
      // keep that area; other controls can shrink together down to the readable floor.
      for (const scale of [1, 0.9, 0.8, 0.7]) {
        body.style.setProperty('--panel-fit', String(scale))
        if (parents.every(el => {
          const style = win.getComputedStyle(el)
          return (style.overflowY === 'auto' && el !== body || el.scrollHeight <= el.clientHeight + 2) &&
            (style.overflowX === 'auto' && el !== body || el.scrollWidth <= el.clientWidth + 2)
        })) break
      }
      body.scrollTop = oldTop
      body.scrollLeft = oldLeft
    }
    const schedule = (): void => { if (!frame) frame = win.requestAnimationFrame(fit) }
    const resize = new ResizeObserver(schedule)
    resize.observe(panel)
    const mutations = new MutationObserver(records => {
      if (records.some(record => record.target !== body || record.type !== 'attributes')) schedule()
    })
    mutations.observe(body, { attributes: true, attributeFilter: ['class', 'style', 'open'], characterData: true, childList: true, subtree: true })
    mutations.observe(panel, { attributes: true, attributeFilter: ['class', 'style'] })
    body.addEventListener('load', schedule, true)
    body.ownerDocument.fonts.addEventListener('loadingdone', schedule)
    fit()
    return () => {
      resize.disconnect(); mutations.disconnect(); win.cancelAnimationFrame(frame)
      body.removeEventListener('load', schedule, true)
      body.ownerDocument.fonts.removeEventListener('loadingdone', schedule)
    }
  }, [])
  return <div ref={ref} className={desktop ? 'dw-body fit-panel' : 'widget-body fit-panel'}>{children}</div>
}
