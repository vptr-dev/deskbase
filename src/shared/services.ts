export interface ServiceInfo {
  name: string
  icon: string
  desc: string
  field?: string
  example?: string
  secret?: string
  setup?: string
}

export const SERVICES = {
  trello: { name: 'Trello', icon: 'square-kanban', desc: 'Cards and lists on a board', field: 'Board link', example: 'https://trello.com/b/…', secret: 'API key and token, separated by a colon', setup: 'https://trello.com/power-ups/admin' },
  asana: { name: 'Asana', icon: 'list-todo', desc: 'Tasks in a project', field: 'Project ID', secret: 'Personal access token', setup: 'https://app.asana.com/0/my-apps' },
  clickup: { name: 'ClickUp', icon: 'checkSquare', desc: 'Tasks and statuses in a list', field: 'List ID', secret: 'Personal API token', setup: 'https://app.clickup.com/settings/apps' },
  linear: { name: 'Linear', icon: 'issue', desc: 'Your assigned issues', secret: 'Personal API key', setup: 'https://linear.app/settings/api' },
  monday: { name: 'monday.com', icon: 'columns', desc: 'Items on a board', field: 'Board ID', secret: 'Personal API token', setup: 'https://developer.monday.com/api-reference/docs/authentication' },
  airtable: { name: 'Airtable', icon: 'table', desc: 'Records in a table', field: 'Base ID / table ID', example: 'app…/tbl…', secret: 'Personal access token', setup: 'https://airtable.com/create/tokens' },
  figma: { name: 'Figma', icon: 'palette', desc: 'Files in a project', field: 'Project ID', secret: 'Personal access token', setup: 'https://www.figma.com/developers/api#access-tokens' },
  slack: { name: 'Slack', icon: 'comment', desc: 'Recent messages from a channel', field: 'Channel ID', secret: 'Token with channel history access', setup: 'https://api.slack.com/apps' },
  raindrop: { name: 'Raindrop.io', icon: 'bookmark', desc: 'Saved bookmarks in a collection', field: 'Collection ID', example: '0', secret: 'Access token', setup: 'https://app.raindrop.io/settings/integrations' },
  dropbox: { name: 'Dropbox', icon: 'folder', desc: 'Files and folders in your Dropbox', field: 'Folder path (optional)', example: '/Work', secret: 'Access token with files.metadata.read', setup: 'https://www.dropbox.com/developers/apps' },
  box: { name: 'Box', icon: 'folder', desc: 'Files in a Box folder', field: 'Folder ID', example: '0', secret: 'Access token with read access', setup: 'https://app.box.com/developers/console' },
  toggl: { name: 'Toggl Track', icon: 'timer', desc: 'Recent time entries', secret: 'API token', setup: 'https://track.toggl.com/profile' },
  clockify: { name: 'Clockify', icon: 'clock', desc: 'Projects in a workspace', field: 'Workspace ID', secret: 'API key', setup: 'https://app.clockify.me/user/settings' },
  codex: { name: 'Codex CLI', icon: 'code', desc: 'Recent local sessions and their resume commands' },
  claude: { name: 'Claude Code', icon: 'code', desc: 'Recent local sessions and their resume commands' },
  gitlab: { name: 'GitLab', icon: 'pr', desc: 'Open issues in a GitLab.com project', field: 'Project path', example: 'gitlab-org/gitlab', secret: 'Read API token (optional)', setup: 'https://gitlab.com/-/user_settings/personal_access_tokens' },
  bitbucket: { name: 'Bitbucket', icon: 'pr', desc: 'Open pull requests in a public repository', field: 'Workspace / repository', example: 'atlassian/python-bitbucket' },
  dockerhub: { name: 'Docker Hub', icon: 'layers', desc: 'Recent public image tags', field: 'Namespace / image', example: 'library/node' },
  huggingface: { name: 'Hugging Face', icon: 'layers', desc: 'Models matching a search', field: 'Model search', example: 'whisper' },
  npm: { name: 'npm', icon: 'code', desc: 'Package releases and dates', field: 'Package', example: 'typescript' },
  pypi: { name: 'PyPI', icon: 'code', desc: 'Python package releases', field: 'Package', example: 'pandas' },
  crates: { name: 'crates.io', icon: 'code', desc: 'Rust crate releases', field: 'Crate', example: 'serde' },
  rubygems: { name: 'RubyGems', icon: 'code', desc: 'Gem versions and release dates', field: 'Gem', example: 'rails' },
  packagist: { name: 'Packagist', icon: 'code', desc: 'PHP package releases', field: 'Vendor / package', example: 'symfony/console' },
  stackoverflow: { name: 'Stack Overflow', icon: 'comment', desc: 'Recent questions with a tag', field: 'Tag', example: 'typescript' },
  hackernews: { name: 'Hacker News', icon: 'rss', desc: 'Recent stories matching a topic', field: 'Search', example: 'engineering' },
  devto: { name: 'DEV Community', icon: 'code', desc: 'Articles about a tag', field: 'Tag', example: 'webdev' },
  youtube: { name: 'YouTube', icon: 'play', desc: 'Recent uploads from a channel', field: 'Channel ID', example: 'UC…' },
  openlibrary: { name: 'Open Library', icon: 'book-open', desc: 'Books matching a title, author or subject', field: 'Search', example: 'electronics' },
  crossref: { name: 'Crossref', icon: 'search', desc: 'Research works and DOI links', field: 'Search', example: 'satellite telemetry' },
  europepmc: { name: 'Europe PMC', icon: 'search', desc: 'Research articles by topic', field: 'Search', example: 'sleep' },
  arxiv: { name: 'arXiv', icon: 'book-open', desc: 'Recent papers matching a topic', field: 'Search', example: 'robotics' },
  datacite: { name: 'DataCite', icon: 'database', desc: 'Research datasets and publications', field: 'Search', example: 'weather observations' },
  zenodo: { name: 'Zenodo', icon: 'database', desc: 'Open datasets, software and papers', field: 'Search', example: 'meteorology' }
} satisfies Record<string, ServiceInfo>

export type ServiceId = keyof typeof SERVICES
export const serviceIds = Object.keys(SERVICES) as ServiceId[]
export const isService = (kind: string): kind is ServiceId => Object.hasOwn(SERVICES, kind)
export const serviceInfo = (id: ServiceId): ServiceInfo => SERVICES[id]
