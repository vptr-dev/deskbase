let ctx: AudioContext | null = null

function tone(freq: number, start: number, dur: number, gain = 0.08): void {
  if (!ctx) ctx = new AudioContext()
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sine'
  o.frequency.value = freq
  g.gain.setValueAtTime(0, ctx.currentTime + start)
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
  o.connect(g).connect(ctx.destination)
  o.start(ctx.currentTime + start)
  o.stop(ctx.currentTime + start + dur + 0.05)
}

export function playChime(): void {
  try { tone(784, 0, 0.5); tone(1046, 0.18, 0.7) } catch { /* ignore */ }
}

export function playPop(): void {
  try { tone(660, 0, 0.12, 0.05); tone(990, 0.06, 0.16, 0.04) } catch { /* ignore */ }
}

export function playLevelUp(): void {
  try { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.35, 0.06)) } catch { /* ignore */ }
}
