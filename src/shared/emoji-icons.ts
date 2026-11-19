/** Maps emoji (from older saves and Notion imports) to line icons. */
const MAP: Record<string, string> = {
  '📄': 'file-text', '📝': 'notebook-pen', '📓': 'notebook', '📒': 'notebook', '📔': 'notebook', '📕': 'book', '📗': 'book', '📘': 'book', '📙': 'book',
  '📚': 'library', '📖': 'book-open', '🗂': 'folder-open', '📁': 'folder', '📂': 'folder-open', '🗃': 'database', '🗄': 'archive', '📌': 'pin', '📍': 'map-pin',
  '📎': 'paperclip', '✏': 'pencil', '🖊': 'pen-line', '🖋': 'pen-tool', '✍': 'pen-line', '📅': 'calendar', '📆': 'calendar-days', '🗓': 'calendar-days',
  '⏰': 'alarm-clock', '⏱': 'timer', '⏲': 'timer', '⌛': 'hourglass', '⏳': 'hourglass', '🕐': 'clock', '✅': 'circle-check', '☑': 'square-check-big', '✔': 'check',
  '🎯': 'target', '🏆': 'trophy', '🥇': 'medal', '🏅': 'medal', '⭐': 'star', '🌟': 'star', '✨': 'sparkles', '💫': 'sparkles', '💡': 'lightbulb', '🔥': 'flame',
  '⚡': 'zap', '💎': 'gem', '🧭': 'compass', '🗺': 'map', '🏠': 'house', '🏡': 'house', '💼': 'briefcase', '💰': 'wallet', '💵': 'banknote', '💸': 'banknote',
  '💳': 'credit-card', '🪙': 'coins', '🏦': 'landmark', '🛒': 'shopping-cart', '🛍': 'shopping-bag', '🎁': 'gift', '🔁': 'repeat', '🔄': 'refresh-cw',
  '📈': 'trending-up', '📉': 'chart-line', '📊': 'chart-column', '🔒': 'lock', '🔐': 'lock', '🔑': 'key', '🗝': 'key-round', '🧩': 'puzzle',
  '🎮': 'gamepad-2', '🕹': 'joystick', '👾': 'ghost', '🎲': 'dices', '♟': 'castle', '🃏': 'dices', '🧙': 'wand-sparkles', '🪄': 'wand-sparkles', '🔮': 'sparkles',
  '🐉': 'flame', '🐲': 'flame', '⚔': 'swords', '🗡': 'sword', '🛡': 'shield', '🏹': 'target', '🧪': 'flask-conical', '💀': 'skull', '☠': 'skull', '👑': 'crown',
  '🏰': 'castle', '💣': 'zap', '🚀': 'rocket', '🛸': 'rocket', '🤖': 'cpu', '🦸': 'shield', '🥷': 'swords', '🧟': 'ghost', '👻': 'ghost',
  '❤': 'heart', '💖': 'heart', '💕': 'heart', '💗': 'heart', '🧡': 'heart', '💛': 'heart', '💚': 'heart', '💙': 'heart', '💜': 'heart', '🖤': 'heart', '🤍': 'heart',
  '💪': 'dumbbell', '🏋': 'dumbbell', '🧠': 'brain', '🦉': 'feather', '🎨': 'palette', '🖌': 'brush', '🎵': 'music', '🎶': 'music', '🎧': 'headphones',
  '🎤': 'mic', '🎸': 'guitar', '🎹': 'piano', '📷': 'camera', '📸': 'camera', '🎬': 'clapperboard', '🎥': 'film', '📺': 'tv', '🍿': 'popcorn', '📻': 'radio',
  '🏃': 'footprints', '🚶': 'footprints', '👟': 'footprints', '🚴': 'bike', '🚲': 'bike', '🧘': 'flower', '🍎': 'apple', '🍏': 'apple', '🥗': 'salad', '🥕': 'carrot',
  '🍕': 'pizza', '🍳': 'chef-hat', '🍽': 'utensils', '🍴': 'utensils', '🎂': 'cake', '🍰': 'cake', '🧁': 'cake', '☕': 'coffee', '🍵': 'coffee', '🥤': 'cup-soda',
  '💧': 'droplet', '🚰': 'glass-water', '🥛': 'glass-water', '😴': 'bed-double', '🛏': 'bed', '🛌': 'bed', '🌱': 'sprout', '🌿': 'leaf', '🍃': 'leaf', '🍀': 'leaf',
  '🌳': 'trees', '🌲': 'trees', '🌸': 'flower-2', '🌷': 'flower-2', '🌹': 'flower-2', '🌻': 'flower-2', '🌼': 'flower', '🌞': 'sun', '☀': 'sun', '🌅': 'sunrise',
  '🌄': 'sunrise', '🌙': 'moon', '🌛': 'moon', '🌜': 'moon', '⭐️': 'star', '☁': 'cloud', '⛅': 'cloud-sun', '🌤': 'cloud-sun', '🌧': 'cloud-rain', '☔': 'umbrella',
  '❄': 'snowflake', '☃': 'snowflake', '🌈': 'rainbow', '🌊': 'waves', '💨': 'wind', '🌍': 'earth', '🌎': 'earth', '🌏': 'earth', '🌐': 'globe', '⛰': 'mountain',
  '🏔': 'mountain', '🏕': 'tent', '🐶': 'dog', '🐕': 'dog', '🐱': 'cat', '🐈': 'cat', '🐾': 'paw-print', '👶': 'baby', '✈': 'plane', '🛫': 'plane', '🚗': 'car',
  '🚙': 'car', '🚌': 'bus', '🚆': 'train-front', '🚄': 'train-front', '🚢': 'ship', '⛵': 'ship', '💊': 'pill', '🩺': 'stethoscope', '💉': 'syringe', '🧹': 'sparkles',
  '🧺': 'shopping-bag', '👕': 'shirt', '👗': 'shirt', '🛋': 'sofa', '🛁': 'bath', '🚿': 'bath', '💡️': 'lightbulb', '🎓': 'graduation-cap', '🏫': 'school',
  '🔬': 'microscope', '🔭': 'telescope', '⚗': 'flask-conical', '🧬': 'dna', '⚛': 'atom', '🧮': 'calculator', '➗': 'calculator', '🗣': 'languages', '🔤': 'languages',
  '🏛': 'landmark', '💻': 'laptop', '🖥': 'monitor', '📱': 'smartphone', '⌨': 'keyboard', '🖱': 'mouse', '🖨': 'printer', '☎': 'phone', '📞': 'phone', '📧': 'mail',
  '✉': 'mail', '📨': 'mail', '📩': 'mail', '📤': 'send', '📥': 'inbox', '📮': 'mail', '💬': 'message-circle', '🗨': 'message-circle', '👥': 'users', '👤': 'user',
  '🧑': 'user', '👨': 'user', '👩': 'user', '🤝': 'handshake', '📢': 'megaphone', '📣': 'megaphone', '🐛': 'bug', '🐞': 'bug', '⚙': 'settings', '🛠': 'settings',
  '🔧': 'settings', '🔨': 'settings', '🧰': 'briefcase', '💾': 'save', '🗑': 'trash-2', '🔔': 'bell', '🔕': 'bell', '🚩': 'flag', '🏁': 'flag', '🎌': 'flag',
  '🔍': 'search', '🔎': 'search', '👀': 'eye', '👁': 'eye', '🎉': 'party-popper', '🎊': 'party-popper', '🎈': 'party-popper', '🎟': 'ticket', '🎫': 'ticket',
  '🏪': 'store', '🧾': 'receipt', '🐷': 'piggy-bank', '⚖': 'scale', '🌡': 'thermometer', '🏥': 'heart-pulse', '❣': 'heart-pulse', '🫀': 'heart-pulse',
  '😀': 'smile', '😃': 'smile', '😄': 'laugh', '😁': 'laugh', '😆': 'laugh', '😂': 'laugh', '🤣': 'laugh', '😊': 'smile', '🙂': 'smile', '😌': 'smile', '😇': 'smile',
  '🥳': 'party-popper', '🤩': 'star', '😎': 'smile', '🤓': 'graduation-cap', '😐': 'meh', '😑': 'meh', '🤔': 'circle-help', '😕': 'frown', '😟': 'frown',
  '😞': 'frown', '😔': 'frown', '😢': 'frown', '😭': 'frown', '🥲': 'meh', '😬': 'meh', '😡': 'angry', '😠': 'angry', '🤯': 'brain',
  '🔴': 'circle', '🟠': 'circle', '🟡': 'circle', '🟢': 'circle', '🔵': 'circle', '🟣': 'circle', '⚫': 'circle', '⚪': 'circle', '⭕': 'circle',
  '🟥': 'square', '🟧': 'square', '🟨': 'square', '🟩': 'square', '🟦': 'square', '🟪': 'square', '⬛': 'square', '⬜': 'square', '🔺': 'triangle', '🔻': 'triangle',
  '❗': 'circle-alert', '❕': 'circle-alert', '⚠': 'triangle-alert', '❓': 'circle-help', '❔': 'circle-help', '➕': 'plus', '➖': 'minus', '✖': 'x', '❌': 'x',
  '♾': 'infinity', '💯': 'badge-check', '🔗': 'link', '⚓': 'anchor', '🪶': 'feather', '🔖': 'bookmark', '🏷': 'tag', '📋': 'clipboard-list', '🗒': 'notebook-text',
  '📃': 'file-text', '📑': 'file-text', '🧾️': 'receipt', '📦': 'box', '🎒': 'briefcase', '🔋': 'zap', '🎾': 'volleyball', '⚽': 'volleyball', '🏀': 'volleyball',
  '🏐': 'volleyball', '🏈': 'volleyball', '⚾': 'volleyball', '🎳': 'target', '⛳': 'flag', '🧗': 'mountain', '🏊': 'waves', '🚣': 'waves', '🤸': 'activity'
}

/** True when the string looks like an emoji or other pictograph rather than an icon name. */
export function isEmoji(s: string): boolean {
  return /[^\x20-\x7e]/.test(s)
}

/** Icon name for an emoji; `fallback` when there is no close match. */
export function emojiToIcon(s: string | null | undefined, fallback: string): string {
  if (!s) return fallback
  if (!isEmoji(s)) return s
  const clean = s.replace(/[︎️‍]/g, '').trim()
  if (MAP[clean]) return MAP[clean]
  // First pictograph only (skin tones, flags, combined emoji)
  const first = Array.from(clean)[0]
  return (first && MAP[first]) || fallback
}
