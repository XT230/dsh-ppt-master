/**
 * Cut a release: verify, bump, commit, tag, push.
 *
 *   node dev/release.mjs patch            # bug fix       1.2.1 -> 1.2.2
 *   node dev/release.mjs minor            # new feature   1.2.1 -> 1.3.0
 *   node dev/release.mjs major            # breaking      1.2.1 -> 2.0.0
 *   node dev/release.mjs minor --dry-run  # verify only, change nothing
 *   node dev/release.mjs minor --no-push  # commit and tag locally, do not push
 *
 * Pushing the tag is what publishes: `.github/workflows/publish.yml` runs on
 * `v*`, checks that the tag matches package.json, and publishes through npm
 * Trusted Publishing (OIDC — no token, no OTP), attaching provenance and
 * creating the GitHub Release. Nothing else is needed per release.
 *
 * Run it in a normal shell: it captures subprocess output, which a confined
 * sandbox refuses.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { execNpm } from './npm.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const [kind] = process.argv.slice(2).filter((argument) => !argument.startsWith('--'))
const dryRun = process.argv.includes('--dry-run')
const noPush = process.argv.includes('--no-push')
const BUMPS = new Set(['patch', 'minor', 'major'])

/** Run a command, streaming its output; throws on a non-zero exit. */
function run(command, args, { capture = false } = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : ['ignore', 'inherit', 'inherit'],
  })
}
const step = (label) => console.log(`\n▸ ${label}`)

function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exitCode = 1
  return null
}

if (kind === undefined || !BUMPS.has(kind)) {
  console.error('usage: node dev/release.mjs <patch|minor|major> [--dry-run] [--no-push]')
  process.exitCode = 1
} else {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const [major, minor, patch] = manifest.version.split('.').map((part) => Number.parseInt(part, 10))
  const next =
    kind === 'major'
      ? `${major + 1}.0.0`
      : kind === 'minor'
        ? `${major}.${minor + 1}.0`
        : `${major}.${minor}.${patch + 1}`

  let blocked = false
  step(`verifying (${manifest.name}@${manifest.version} -> ${next})`)

  try {
    const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { capture: true }).trim()
    if (branch !== 'main') blocked = fail(`on branch ${branch}; releases are cut from main`) ?? true
    const dirty = run('git', ['status', '--porcelain'], { capture: true }).trim()
    if (dirty !== '') blocked = fail(`the working tree is not clean:\n${dirty}`) ?? true
  } catch (cause) {
    blocked = fail(`not a usable git repository: ${cause.message}`) ?? true
  }

  if (!blocked) {
    run(process.execPath, ['dev/set-name.mjs', '--check'])
    run(process.execPath, ['dev/selfcheck.mjs', '--ci'])
    run(process.execPath, ['dev/pack-check.mjs'])
  }

  if (blocked) {
    console.error('\nnothing was changed')
  } else if (dryRun) {
    console.log(`\n✔ preflight passed — a real run would create commit + tag "release v${next}" and publish ${manifest.name}@${next}`)
  } else {
    step(`bumping to ${next}`)
    execNpm(['version', kind, '-m', 'release v%s'], { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] })
    const tag = `v${next}`
    step('pushing')
    if (noPush) {
      console.log(`skipped (--no-push). Push when ready:\n  git push --follow-tags   # publishes ${tag}`)
    } else {
      run('git', ['push', '--follow-tags'])
      let url = 'https://github.com/XT230/dsh-ppt-master/actions'
      try {
        url = run('gh', ['run', 'list', '--workflow', 'publish.yml', '--limit', '1', '--json', 'url', '--jq', '.[0].url'], {
          capture: true,
        }).trim() || url
      } catch {
        /* gh is optional; the plain Actions URL is enough */
      }
      console.log(`\n✔ ${tag} pushed — the publish workflow will take it from here:\n  ${url}\n  gh run watch`)
    }
  }
}
