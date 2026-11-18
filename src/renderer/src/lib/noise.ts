/** Locally generated ambient noise for focus sessions (no audio files, no network). */
export type NoiseKind = 'off' | 'white' | 'pink' | 'brown'

let ctx: AudioContext | null = null
let src: AudioBufferSourceNode | null = null
let gain: GainNode | null = null
let current: NoiseKind = 'off'

function makeBuffer(c: AudioContext, kind: Exclude<NoiseKind, 'off'>): AudioBuffer {
  const len = c.sampleRate * 4
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const out = buf.getChannelData(ch)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      if (kind === 'white') out[i] = w * 0.35
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898
        out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.09
        b6 = w * 0.115926
      } else {
        last = (last + 0.02 * w) / 1.02
        out[i] = last * 3
      }
    }
    // Cross-fade the loop seam.
    const fade = Math.floor(c.sampleRate * 0.05)
    for (let i = 0; i < fade; i++) {
      const a = i / fade
      out[i] = out[i] * a + out[len - fade + i] * (1 - a)
    }
  }
  return buf
}

export function setNoise(kind: NoiseKind, volume: number): void {
  if (kind === 'off') {
    src?.stop()
    src = null
    current = 'off'
    return
  }
  ctx = ctx ?? new AudioContext()
  if (!gain) { gain = ctx.createGain(); gain.connect(ctx.destination) }
  gain.gain.value = Math.max(0, Math.min(1, volume))
  if (kind === current && src) return
  src?.stop()
  src = ctx.createBufferSource()
  src.buffer = makeBuffer(ctx, kind)
  src.loop = true
  src.connect(gain)
  src.start()
  current = kind
  void ctx.resume()
}

export function setNoiseVolume(volume: number): void {
  if (gain) gain.gain.value = Math.max(0, Math.min(1, volume))
}
