// Builds src/renderer/src/lib/icon-data.ts from lucide icons (ISC license).
// Run: node scripts/icons.mjs
import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'

const dir = 'node_modules/lucide-react/dist/esm/icons'

/** Icons used by the interface, under the names the code uses. */
const UI = {
  plus: 'plus', chevron: 'chevron-right', down: 'chevron-down', up: 'chevron-up', left: 'chevron-left', right: 'chevron-right',
  search: 'search', settings: 'settings', trash: 'trash-2', star: 'star', more: 'ellipsis', check: 'check', x: 'x', grip: 'grip-vertical',
  sidebar: 'panel-left', undo: 'undo-2', redo: 'redo-2', calendar: 'calendar', clock: 'clock', flag: 'flag', tag: 'tag', repeat: 'repeat',
  copy: 'copy', edit: 'pencil', play: 'play', pause: 'pause', stop: 'square', skip: 'skip-forward', pin: 'pin', download: 'download',
  upload: 'upload', folder: 'folder', external: 'external-link', restore: 'rotate-ccw', bolt: 'zap', coin: 'coins', heart: 'heart',
  list: 'list', grid: 'layout-grid', filter: 'list-filter', sort: 'arrow-up-down', eye: 'eye', eyeOff: 'eye-off', home: 'house',
  sun: 'sun', moon: 'moon', minus: 'minus', link: 'link', keyboard: 'keyboard', trophy: 'trophy', expand: 'maximize-2', note: 'file-text',
  sparkle: 'sparkles', table: 'table', dice: 'dices', chart: 'chart-column', snooze: 'alarm-clock', shield: 'shield', scroll: 'scroll-text',
  diamond: 'gem', gauge: 'gauge', layout: 'layout-dashboard', monitor: 'monitor', database: 'database', board: 'square-kanban',
  gallery: 'gallery-horizontal-end', zap: 'zap', move: 'move', resize: 'move-diagonal-2', palette: 'palette', brush: 'brush', type: 'type',
  image: 'image', droplet: 'droplet', layers: 'layers', sliders: 'sliders-horizontal', wand: 'wand-sparkles', refresh: 'refresh-cw',
  lock: 'lock', unlock: 'lock-open', bell: 'bell', menu: 'menu', inbox: 'inbox', archive: 'archive', send: 'send', mic: 'mic',
  checkSquare: 'square-check-big', square: 'square', circle: 'circle', checkCircle: 'circle-check', toggle: 'list-collapse',
  quote: 'quote', code: 'code', divider: 'minus', heading: 'heading', bullet: 'list', number: 'list-ordered', callout: 'message-square-text',
  lightbulb: 'lightbulb', flame: 'flame', snowflake: 'snowflake', target: 'target', book: 'book-open', journal: 'notebook-pen',
  smile: 'smile', laugh: 'laugh', meh: 'meh', frown: 'frown', angry: 'angry', info: 'info', alert: 'triangle-alert', help: 'circle-help',
  arrowRight: 'arrow-right', arrowLeft: 'arrow-left', arrowUp: 'arrow-up', arrowDown: 'arrow-down', trendUp: 'trending-up', trendDown: 'trending-down',
  window: 'app-window', pinOff: 'pin-off', magnet: 'magnet', crosshair: 'crosshair', frame: 'frame', file: 'file', fileImport: 'file-input',
  notion: 'box', save: 'save', rows: 'rows-3', columns: 'columns-3', alignLeft: 'align-left', alignCenter: 'align-center',
  alignRight: 'align-right', bold: 'bold', italic: 'italic', contrast: 'contrast', blend: 'blend', aperture: 'aperture', focus: 'focus',
  timer: 'timer', hourglass: 'hourglass', activity: 'activity', percent: 'percent', hash: 'hash', at: 'at-sign', user: 'user', users: 'users',
  coffee: 'coffee', party: 'party-popper', box: 'box', mouse: 'mouse-pointer-2', desktop: 'monitor-smartphone', shapes: 'shapes',
  cloud: 'cloud', cloudSun: 'cloud-sun', cloudMoon: 'cloud-moon', cloudRain: 'cloud-rain', cloudDrizzle: 'cloud-drizzle', cloudSnow: 'cloud-snow',
  cloudFog: 'cloud-fog', cloudLightning: 'cloud-lightning', cloudHail: 'cloud-hail', cloudy: 'cloudy', wind: 'wind', droplets: 'droplets',
  sunrise: 'sunrise', sunset: 'sunset', thermometer: 'thermometer', cpu: 'cpu', ram: 'memory-stick', disk: 'hard-drive', place: 'map-pin',
  group: 'group', ungroup: 'ungroup', timerReset: 'timer-reset', listChecks: 'list-checks', calendarClock: 'calendar-clock', wallet: 'wallet',
  dumbbell: 'dumbbell', study: 'graduation-cap'
}

/** Icons offered in the icon picker, by group. */
const PICK = {
  General: ['file-text', 'file', 'notebook', 'notebook-pen', 'book-open', 'bookmark', 'folder', 'folder-open', 'archive', 'inbox', 'clipboard-list', 'list-todo', 'square-check-big', 'circle-check', 'list', 'layout-dashboard', 'layout-grid', 'database', 'table', 'square-kanban', 'calendar', 'calendar-days', 'clock', 'alarm-clock', 'timer', 'hourglass', 'star', 'heart', 'flag', 'tag', 'pin', 'bell', 'lightbulb', 'sparkles', 'zap', 'flame', 'target', 'trophy', 'medal', 'crown', 'gem', 'rocket', 'compass', 'map', 'house', 'search', 'eye', 'lock', 'key', 'shield'],
  Work: ['briefcase', 'building-2', 'presentation', 'chart-column', 'chart-line', 'chart-pie', 'trending-up', 'kanban', 'clipboard', 'pen-tool', 'pencil', 'mail', 'send', 'phone', 'message-circle', 'users', 'user', 'calendar-check', 'file-spreadsheet', 'printer', 'paperclip', 'stamp', 'scale', 'handshake', 'megaphone', 'brain', 'workflow', 'git-branch', 'code', 'terminal', 'bug', 'server', 'cloud', 'cpu', 'laptop', 'monitor', 'smartphone', 'keyboard', 'mouse'],
  Life: ['sun', 'moon', 'coffee', 'cup-soda', 'utensils', 'chef-hat', 'pizza', 'apple', 'carrot', 'shopping-cart', 'shopping-bag', 'gift', 'cake', 'party-popper', 'shirt', 'sofa', 'bed', 'bath', 'lamp', 'key-round', 'car', 'bike', 'bus', 'train-front', 'plane', 'ship', 'map-pin', 'globe', 'tent', 'mountain', 'trees', 'flower-2', 'leaf', 'sprout', 'dog', 'cat', 'baby', 'paw-print', 'umbrella', 'snowflake', 'cloud-sun', 'cloud-rain', 'wind', 'rainbow', 'waves', 'sunrise'],
  Health: ['heart-pulse', 'activity', 'dumbbell', 'footprints', 'droplet', 'glass-water', 'pill', 'stethoscope', 'syringe', 'brain', 'bed-double', 'salad', 'scale', 'smile', 'laugh', 'meh', 'frown', 'angry', 'thermometer', 'hand-heart', 'flower', 'sparkle'],
  Learning: ['graduation-cap', 'school', 'book', 'book-open', 'library', 'notebook-text', 'pen-line', 'highlighter', 'languages', 'calculator', 'sigma', 'atom', 'flask-conical', 'microscope', 'telescope', 'dna', 'earth', 'landmark', 'music', 'palette', 'brush', 'camera', 'film', 'mic', 'headphones', 'guitar', 'piano'],
  Money: ['wallet', 'credit-card', 'banknote', 'coins', 'piggy-bank', 'receipt', 'chart-candlestick', 'badge-dollar-sign', 'euro', 'pound-sterling', 'percent', 'landmark', 'store', 'ticket'],
  Play: ['gamepad-2', 'joystick', 'dices', 'puzzle', 'swords', 'castle', 'ghost', 'skull', 'sword', 'wand-sparkles', 'tv', 'clapperboard', 'popcorn', 'music-2', 'radio', 'disc-3', 'book-heart', 'volleyball'],
  Symbols: ['circle', 'square', 'triangle', 'diamond', 'hexagon', 'octagon', 'cloud', 'infinity', 'hash', 'at-sign', 'asterisk', 'plus', 'check', 'x', 'circle-alert', 'info', 'circle-help', 'arrow-right', 'arrow-up-right', 'repeat', 'refresh-cw', 'shuffle', 'link', 'anchor', 'feather', 'flag-triangle-right', 'bookmark-check', 'badge-check', 'smile-plus']
}

const need = new Set([...Object.values(UI), ...Object.values(PICK).flat()])
const data = {}
const missing = []
for (const name of need) {
  const file = path.join(dir, `${name}.mjs`)
  if (!existsSync(file)) { missing.push(name); continue }
  let src = readFileSync(file, 'utf8')
  for (let hop = 0; hop < 3; hop++) {
    const alias = src.match(/export \{ default \} from '\.\/([^']+)'/)
    if (!alias) break
    src = readFileSync(path.join(dir, alias[1]), 'utf8')
  }
  const m =src.match(/const __iconData = (\{[\s\S]*?\n\});/)
  if (!m) { missing.push(name); continue }
  const node = Function(`return ${m[1]}`)().node
  data[name] = node.map(([tag, attrs]) => { const a = { ...attrs }; delete a.key; return [tag, a] })
}
if (missing.length) console.warn('missing:', missing.join(', '))
const pick = Object.fromEntries(Object.entries(PICK).map(([g, list]) => [g, [...new Set(list)].filter((n) => data[n])]))
const ui = Object.fromEntries(Object.entries(UI).filter(([, v]) => data[v]))
const out = `// Generated by scripts/icons.mjs from lucide (ISC license, https://lucide.dev). Do not edit by hand.
export type IconNode = [string, Record<string, string | number>][]
export const ICON_DATA: Record<string, IconNode> = ${JSON.stringify(data)}
/** Short names used in the interface mapped to icon names */
export const UI_ICONS: Record<string, string> = ${JSON.stringify(ui)}
export const ICON_GROUPS: Record<string, string[]> = ${JSON.stringify(pick)}
`
writeFileSync('src/renderer/src/lib/icon-data.ts', out)
console.log(Object.keys(data).length, 'icons,', (out.length / 1024).toFixed(1), 'KB')
