/**
 * Assert the published tarball's file list, so a packaging change (a file that
 * silently stops shipping, or `dev/`/`.github/` leaking into the package) fails
 * loudly instead of reaching npm.
 *
 * Used by `.github/workflows/ci.yml` and by `dev/release.mjs`. Run from the
 * plugin directory: `node dev/pack-check.mjs`.
 */
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { execNpm } from './npm.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

/** The complete published file list, relative to the package root. */
export const EXPECTED = [
  'LICENSE',
  'README.md',
  'cordis.patch.yml',
  'icon.svg',
  'lib/client.js',
  'lib/index.js',
  'lib/preset.js',
  'lib/probe.py',
  'lib/python.js',
  'lib/skill.js',
  'locale/en.json',
  'locale/zh.json',
  'package.json',
]

/** Run `npm pack --dry-run --json` and return the packed paths. */
export function packedPaths() {
  const stdout = execNpm(['pack', '--dry-run', '--json'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const [report] = JSON.parse(stdout)
  return report.files.map((file) => file.path).sort()
}

/** Compare the packed paths with {@link EXPECTED}; returns the drift report. */
export function comparePack() {
  const paths = packedPaths()
  return {
    paths,
    missing: EXPECTED.filter((path) => !paths.includes(path)),
    extra: paths.filter((path) => !EXPECTED.includes(path)),
  }
}

/** Whether this module is the script node was asked to run. */
function isEntryPoint() {
  const entry = process.argv[1]
  if (entry === undefined) return false
  const normalize = (path) => (process.platform === 'win32' ? path.toLowerCase() : path)
  try {
    return normalize(realpathSync(entry)) === normalize(realpathSync(fileURLToPath(import.meta.url)))
  } catch {
    return false
  }
}

if (isEntryPoint()) {
  const { paths, missing, extra } = comparePack()
  if (missing.length > 0 || extra.length > 0) {
    console.error('packed files drifted')
    if (missing.length > 0) console.error(`  missing: ${missing.join(', ')}`)
    if (extra.length > 0) console.error(`  extra:   ${extra.join(', ')}`)
    process.exitCode = 1
  } else {
    console.log(`packed file list is unchanged (${paths.length} files)`)
  }
}
