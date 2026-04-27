// Pre-build sanity check: APP_VERSION in src/lib/version.ts must match
// the topmost `## vX.Y.Z` heading in CHANGELOG.md and the version field
// in package.json. Run via the `build` npm script. The point isn't
// hermetic correctness — it's catching the easy mistake of bumping the
// changelog and forgetting to bump version.ts (or vice versa).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const versionTs = readFileSync(join(root, 'src/lib/version.ts'), 'utf8')
const versionMatch = /APP_VERSION\s*=\s*'([^']+)'/.exec(versionTs)
if (!versionMatch) fail('Could not parse APP_VERSION in src/lib/version.ts')
const appVersion = versionMatch[1]

const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
const topMatch = /^##\s+v([0-9]+\.[0-9]+\.[0-9]+)/m.exec(changelog)
if (!topMatch) fail('No `## vX.Y.Z` heading found in CHANGELOG.md')
const topChangelog = topMatch[1]

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const pkgVersion = pkg.version

if (appVersion !== topChangelog) {
  fail(
    `Version mismatch: APP_VERSION is ${appVersion} but CHANGELOG.md's top entry is v${topChangelog}.\n` +
    `  → If you added a changelog entry, bump APP_VERSION in src/lib/version.ts to match.\n` +
    `  → If you bumped APP_VERSION, add a matching entry to CHANGELOG.md.`
  )
}
if (appVersion !== pkgVersion) {
  fail(
    `Version mismatch: APP_VERSION is ${appVersion} but package.json says ${pkgVersion}.\n` +
    `  → Update package.json's "version" field to ${appVersion}.`
  )
}

console.log(`[check-version] OK — v${appVersion}`)

function fail(msg) {
  console.error(`[check-version] ${msg}`)
  process.exit(1)
}
