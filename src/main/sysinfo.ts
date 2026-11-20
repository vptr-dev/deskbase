import { net } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'

/** Live numbers for the System panel: CPU, memory and disk use in percent. */
export interface SysStats { cpu: number; ram: number; ramUsed: number; ramTotal: number; disk: number; diskFree: number; diskTotal: number; uptime: number }

let lastCpu: { idle: number; total: number } | null = null
function cpuTimes(): { idle: number; total: number } {
  let idle = 0
  let total = 0
  for (const c of os.cpus()) {
    const t = c.times
    idle += t.idle
    total += t.user + t.nice + t.sys + t.idle + t.irq
  }
  return { idle, total }
}

export async function sysStats(drive?: string): Promise<SysStats> {
  const now = cpuTimes()
  let cpu = 0
  if (lastCpu) {
    const di = now.idle - lastCpu.idle
    const dt = now.total - lastCpu.total
    cpu = dt > 0 ? Math.max(0, Math.min(100, Math.round((1 - di / dt) * 100))) : 0
  }
  lastCpu = now
  const total = os.totalmem()
  const free = os.freemem()
  let disk = 0
  let diskFree = 0
  let diskTotal = 0
  try {
    const root = drive && /^[a-z]:?\\?$/i.test(drive) ? drive.slice(0, 1) + ':\\' : path.parse(os.homedir()).root
    const s = await fs.promises.statfs(root)
    diskTotal = s.blocks * s.bsize
    diskFree = s.bavail * s.bsize
    disk = diskTotal ? Math.round((1 - diskFree / diskTotal) * 100) : 0
  } catch { /* no disk info */ }
  return { cpu, ram: Math.round((1 - free / total) * 100), ramUsed: total - free, ramTotal: total, disk, diskFree, diskTotal, uptime: os.uptime() }
}

// ---------- weather (Open-Meteo, no account or key) ----------
export interface Place { name: string; region: string; country: string; lat: number; lon: number }

async function getJson(url: string): Promise<any> {
  const r = await net.fetch(url, { headers: { 'User-Agent': 'Deskbase' } })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

export async function findPlace(query: string): Promise<Place[]> {
  const q = query.trim().slice(0, 80)
  if (!q) return []
  const j = await getJson(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=${encodeURIComponent(q)}`)
  return (j.results ?? []).map((p: any) => ({ name: String(p.name), region: String(p.admin1 ?? ''), country: String(p.country ?? ''), lat: Number(p.latitude), lon: Number(p.longitude) }))
}

export async function weather(lat: number, lon: number, fahrenheit: boolean): Promise<unknown> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('bad location')
  const unit = fahrenheit ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : ''
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&timezone=auto&forecast_days=7${unit}` +
    '&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max'
  return getJson(url)
}
