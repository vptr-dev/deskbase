// Cut a release: node scripts/release.mjs [patch|minor|major]
// Checks the tree is clean, type-checks and builds, bumps the version, moves the
// "Unreleased" notes in CHANGELOG.md under the new version, commits and pushes.
// Pushing the release commit starts the GitHub workflow that builds the installer and publishes
// the release that installed apps update from.
import { execSync } from 'node:child_process'
import fs from 'node:fs'

const run = (cmd) => execSync(cmd, { stdio: 'inherit' })
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()

const kind = process.argv[2] ?? 'patch'
if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error('Usage: npm run release -- [patch|minor|major]')
  process.exit(1)
}
if (out('git status --porcelain')) {
  console.error('Commit or stash your changes first.')
  process.exit(1)
}

run('npm run typecheck')
run('npm run build')

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const [ma, mi, pa] = pkg.version.split('.').map(Number)
const next = kind === 'major' ? `${ma + 1}.0.0` : kind === 'minor' ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`
pkg.version = next
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')

const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
lock.version = next
if (lock.packages?.['']) lock.packages[''].version = next
fs.writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n')

const readme = fs.readFileSync('README.md', 'utf8')
const updated = readme.replace(/Deskbase-Setup-\d+\.\d+\.\d+\.exe/, `Deskbase-Setup-${next}.exe`)
if (updated === readme) throw new Error('README.md must name the current installer')
fs.writeFileSync('README.md', updated)

const date = new Date().toISOString().slice(0, 10)
let log = fs.readFileSync('CHANGELOG.md', 'utf8')
log = log.replace('## Unreleased', `## Unreleased\n\n## ${next} — ${date}`)
fs.writeFileSync('CHANGELOG.md', log)

run('git add package.json package-lock.json CHANGELOG.md README.md')
run(`git commit -m "Release v${next}"`)
run('git push origin HEAD:main')
console.log(`\nPushed v${next}. GitHub Actions builds and checks the installer before publishing.`)
