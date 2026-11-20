// Now playing: reads the Windows media session (what shows in the volume flyout: Spotify, browsers,
// Media Player…) through a small PowerShell loop that runs only while a panel shows it.
import { BrowserWindow, ipcMain } from 'electron'
import { spawn, type ChildProcess } from 'child_process'

const PRELUDE = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskG = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$type) { $t = $asTaskG.MakeGenericMethod($type).Invoke($null, @($op)); $null = $t.Wait(-1); $t.Result }
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
`

const LOOP = PRELUDE + `
$last = ''
$lastKey = ''
$lastSent = [DateTime]::MinValue
while ($true) {
  try {
    $s = $mgr.GetCurrentSession()
    if ($null -eq $s) { $o = [ordered]@{ none = $true }; $key = '' }
    else {
      $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $info = $s.GetPlaybackInfo()
      $tl = $s.GetTimelineProperties()
      $playing = $info.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing
      $dur = ($tl.EndTime - $tl.StartTime).TotalSeconds
      $pos = $tl.Position.TotalSeconds
      if ($playing -and $dur -gt 0) { $pos = $pos + ([DateTimeOffset]::Now - $tl.LastUpdatedTime).TotalSeconds; if ($pos -gt $dur) { $pos = $dur } }
      $o = [ordered]@{ title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; app = $s.SourceAppUserModelId; playing = $playing; canNext = $info.Controls.IsNextEnabled; canPrev = $info.Controls.IsPreviousEnabled; dur = [Math]::Round($dur, 1) }
      $key = "$($p.Title)|$($p.Artist)|$($s.SourceAppUserModelId)"
      if ($key -ne $lastKey -and $null -ne $p.Thumbnail) {
        try {
          $st = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
          $ns = $asRead.Invoke($null, @($st))
          $ms = New-Object System.IO.MemoryStream
          $ns.CopyTo($ms)
          if ($ms.Length -gt 0 -and $ms.Length -lt 1500000) { [Console]::Out.WriteLine((@{ thumb = [Convert]::ToBase64String($ms.ToArray()); key = $key } | ConvertTo-Json -Compress)) }
          $ns.Dispose(); $st.Dispose()
        } catch { }
      }
      $lastKey = $key
    }
    $j = $o | ConvertTo-Json -Compress
    $now = [DateTime]::UtcNow
    if ($j -ne $last -or ($now - $lastSent).TotalSeconds -ge 10) {
      if ($null -ne $s) { $o['pos'] = [Math]::Round($pos, 1) }
      [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress))
      [Console]::Out.Flush()
      $last = $j
      $lastSent = $now
    }
  } catch { [Console]::Out.WriteLine('{"none":true}'); [Console]::Out.Flush(); $last = '' }
  Start-Sleep -Milliseconds 1000
}
`

const CONTROL: Record<string, string> = { toggle: 'TryTogglePlayPauseAsync', next: 'TrySkipNextAsync', prev: 'TrySkipPreviousAsync' }

const encoded = (script: string): string => Buffer.from(script, 'utf16le').toString('base64')
const ps = (script: string): ChildProcess => spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded(script)], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })

let proc: ChildProcess | null = null
let watchers = 0
let stopTimer: NodeJS.Timeout | null = null
let state: Record<string, unknown> = { none: true }
let thumb: { key: string; data: string } | null = null

function send(): void {
  const key = `${state.title ?? ''}|${state.artist ?? ''}|${state.app ?? ''}`
  const out = { ...state, ...(thumb && thumb.key === key ? { thumb: thumb.data } : {}) }
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('media:state', out)
}

function start(): void {
  if (proc || process.platform !== 'win32') return
  const p = ps(LOOP)
  proc = p
  let buf = ''
  p.stdout?.setEncoding('utf8')
  p.stdout?.on('data', (chunk: string) => {
    buf += chunk
    let i: number
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line.startsWith('{')) continue
      try {
        const j = JSON.parse(line)
        if (typeof j.thumb === 'string') { thumb = { key: j.key, data: `data:image/${j.thumb.startsWith('iVBO') ? 'png' : 'jpeg'};base64,` + j.thumb }; send(); continue }
        state = { ...j, at: Date.now() }
        send()
      } catch { /* partial line */ }
    }
  })
  p.on('exit', () => { if (proc === p) proc = null; if (watchers > 0) setTimeout(start, 5000) })
}

function stop(): void {
  proc?.kill()
  proc = null
}

export function registerMedia(): void {
  ipcMain.handle('media:watch', (_e, on: boolean) => {
    watchers = Math.max(0, watchers + (on ? 1 : -1))
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null }
    if (watchers > 0) { start(); send() } else stopTimer = setTimeout(stop, 15000)
  })
  ipcMain.handle('media:control', async (_e, cmd: string) => {
    const m = CONTROL[cmd]
    if (!m || process.platform !== 'win32') return
    const p = ps(PRELUDE + `\n$s = $mgr.GetCurrentSession()\nif ($null -ne $s) { $null = Await ($s.${m}()) ([bool]) }\n`)
    await new Promise<void>((ok) => { p.on('exit', () => ok()); setTimeout(ok, 6000) })
  })
}
