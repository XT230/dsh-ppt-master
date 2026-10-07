/**
 * Keep the plugin's package name consistent across the four places that hard-code it.
 *
 * Usage:
 *   node dev/set-name.mjs --check                    verify the four places agree
 *   node dev/set-name.mjs @scope/dsh-ppt-master      rewrite them to that name
 *
 * npm enforces the shape, so the argument must be a valid lower-case package name.
 * The row id (`ppt-master`) never changes: it is the profile entry id the plugin's
 * configuration is keyed by, so renaming the package must not touch it.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const PACKAGE_JSON = join(root, 'package.json')
const PATCH = join(root, 'cordis.patch.yml')
const CLIENT = join(root, 'lib', 'client.js')
const README = join(root, 'README.md')
const ROW_ID = 'ppt-master'

const NAME_PATTERN = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/u

function readCurrentName() {
  const manifest = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'))
  if (typeof manifest.name !== 'string' || !manifest.name) throw new Error('package.json has no name')
  return manifest.name
}

/** The exact strings that carry the package name. */
function occurrences(name) {
  return {
    'package.json': `"name": ${JSON.stringify(name)}`,
    'cordis.patch.yml': `name: ${JSON.stringify(name)}`,
    'lib/client.js:id': `id: '${name}'`,
    'lib/client.js:rowKey': `var ROW_KEY = '${name}#${ROW_ID}'`,
    // The preset declaration mounts the preset half through this subpath.
    'cordis.patch.yml:preset': `name: ${JSON.stringify(`${name}/preset`)}`,
  }
}

function readAll() {
  const files = {
    'package.json': readFileSync(PACKAGE_JSON, 'utf8'),
    'cordis.patch.yml': readFileSync(PATCH, 'utf8'),
    'lib/client.js': readFileSync(CLIENT, 'utf8'),
  }
  try {
    files['README.md'] = readFileSync(README, 'utf8')
  } catch {
    /* the readme is documentation, not a runtime requirement */
  }
  return files
}

function check() {
  const name = readCurrentName()
  const files = readAll()
  const wanted = occurrences(name)
  const problems = []

  const has = (file, needle) => files[file].includes(needle)
  if (!has('package.json', wanted['package.json'])) problems.push('package.json does not declare its own name')
  if (!has('cordis.patch.yml', wanted['cordis.patch.yml'])) problems.push(`cordis.patch.yml row name is not ${name}`)
  if (!has('lib/client.js', wanted['lib/client.js:id'])) problems.push(`lib/client.js module id is not ${name}`)
  if (!has('lib/client.js', wanted['lib/client.js:rowKey'])) problems.push(`lib/client.js ROW_KEY is not ${name}#${ROW_ID}`)
  if (!has('cordis.patch.yml', wanted['cordis.patch.yml:preset'])) problems.push(`cordis.patch.yml preset half is not ${name}/preset`)

  // A leftover unscoped spelling is what breaks the client registration after a rename.
  const stale = occurrences('dsh-ppt-master')
  if (name !== 'dsh-ppt-master') {
    for (const [where, needle] of Object.entries(stale)) {
      const file = where.split(':')[0]
      if (has(file, needle)) problems.push(`${file} still carries the unscoped spelling (${needle})`)
    }
  }

  // Documentation names the package in install commands; a scoped name there is safe
  // to rewrite because no filesystem path uses an `@scope/` prefix.
  const readme = files['README.md'] ?? ''
  if (name.startsWith('@')) {
    if (!readme.includes(name)) problems.push(`README.md does not mention ${name}`)
    const other = [...readme.matchAll(/@[a-z0-9-~][a-z0-9-._~]*\/dsh-ppt-master/gu)].map((match) => match[0])
    for (const found of new Set(other)) {
      if (found !== name) problems.push(`README.md mentions ${found} instead of ${name}`)
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.log(`  FAIL ${problem}`)
    console.log(`\npackage name ${name} is inconsistent`)
    return 1
  }
  console.log(`  ok   package name ${name} is consistent everywhere it is hard-coded`)
  return 0
}

function rename(next) {
  if (!NAME_PATTERN.test(next)) {
    console.log(`  FAIL ${next} is not a valid npm package name (lower case, optional @scope/)`)
    return 1
  }
  const current = readCurrentName()
  if (current === next) {
    console.log(`  ok   already ${next}`)
    return check()
  }
  const before = occurrences(current)
  const after = occurrences(next)
  const files = readAll()
  for (const [where, needle] of Object.entries(before)) {
    const file = where.split(':')[0]
    const replacement = after[where]
    if (!files[file].includes(needle)) {
      console.log(`  FAIL ${file} does not contain ${needle}; run --check to see the current state`)
      return 1
    }
    files[file] = files[file].split(needle).join(replacement)
  }
  writeFileSync(PACKAGE_JSON, files['package.json'], 'utf8')
  writeFileSync(PATCH, files['cordis.patch.yml'], 'utf8')
  writeFileSync(CLIENT, files['lib/client.js'], 'utf8')
  // Install commands in the readme carry the same name; rewrite the scoped form only,
  // so filesystem paths that merely end in `dsh-ppt-master` stay untouched.
  if (files['README.md'] !== undefined && current.startsWith('@') && next.startsWith('@')) {
    writeFileSync(README, files['README.md'].split(current).join(next), 'utf8')
  }
  console.log(`  ok   ${current} -> ${next}`)
  return check()
}

const argument = process.argv[2]
if (argument === undefined || argument === '--check') {
  process.exitCode = check()
} else {
  process.exitCode = rename(argument)
}
