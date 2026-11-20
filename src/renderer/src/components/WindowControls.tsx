import { useEffect, useState } from 'react'
import { api, isDesktop } from '../lib/api'

/**
 * Minimize, maximize and close, drawn by the app so they follow the theme and surface.
 * Sits at the top-right corner of the window; the top bars leave room for it (.caption-space).
 */
export function WindowControls(): JSX.Element | null {
  const [max, setMax] = useState(false)
  useEffect(() => {
    if (!isDesktop) return
    api.win.isMax().then(setMax).catch(() => {})
    return api.win.onMax(setMax)
  }, [])
  if (!isDesktop) return null
  return (
    <div className="wc" role="group" aria-label="Window">
      <button className="wc-btn" title="Minimize" aria-label="Minimize" onClick={() => api.win.control('min')}>
        <svg viewBox="0 0 10 10" aria-hidden><path d="M1 5.5h8" /></svg>
      </button>
      <button className="wc-btn" title={max ? 'Restore' : 'Maximize'} aria-label={max ? 'Restore' : 'Maximize'} onClick={() => api.win.control('max')}>
        {max
          ? <svg viewBox="0 0 10 10" aria-hidden><rect x="1" y="3" width="6" height="6" rx="1.2" /><path d="M3 3V2.2C3 1.5 3.5 1 4.2 1h3.6C8.5 1 9 1.5 9 2.2v3.6C9 6.5 8.5 7 7.8 7H7" /></svg>
          : <svg viewBox="0 0 10 10" aria-hidden><rect x="1" y="1" width="8" height="8" rx="1.6" /></svg>}
      </button>
      <button className="wc-btn wc-close" title="Close" aria-label="Close" onClick={() => api.win.control('close')}>
        <svg viewBox="0 0 10 10" aria-hidden><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" /></svg>
      </button>
    </div>
  )
}
