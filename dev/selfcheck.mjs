/**
 * Development self-check for dsh-ppt-master.
 *
 *   node dev/selfcheck.mjs        # everything: portable checks + this machine
 *   node dev/selfcheck.mjs --ci   # portable checks only (exactly what CI runs)
 *
 * Two groups:
 *
 *   portable — the Config schema, path resolution, the bundle patch (parsed as
 *   real YAML, `!!js` scalars included), skill parsing and section assembly
 *   against a fixture SKILL.md under `dev/.tmp`, and a probe run on a system
 *   interpreter when one is on PATH. Needs no DSH install, no upstream
 *   ppt-master checkout and no skill dependencies, so it runs on any runner.
 *
 *   environment — the real upstream checkout and the real interpreter with its
 *   19 packages. Missing preconditions are reported as `skip`, and upstream
 *   wording differences are reported as `warn` rather than failures: our code
 *   depends on the file's shape, not on the wording of a third-party skill.
 *
 * It touches nothing outside the plugin directory (`dev/.tmp` is created and
 * removed again).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const tmp = join(root, 'dev', '.tmp')
const portable = process.argv.includes('--ci')

let failures = 0
let skips = 0
let warnings = 0
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` -> ${detail}`}`)
}
function skip(label, why) {
  skips += 1
  console.log(`  skip ${label}${why === undefined ? '' : ` (${why})`}`)
}
function warn(label, detail) {
  warnings += 1
  console.log(`  warn ${label}${detail === undefined ? '' : ` -> ${detail}`}`)
}

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const patchText = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')

// The Loader dialect writes `!!js <expression>`; js-yaml resolves that to the
// `tag:yaml.org,2002:js` tag, so both spellings are registered.
const yaml = await import('js-yaml')
const jsScalar = (name) => new yaml.Type(name, { kind: 'scalar', construct: (value) => ({ __jsExpr: value }) })
const patchSchema = yaml.DEFAULT_SCHEMA.extend([jsScalar('!js'), jsScalar('tag:yaml.org,2002:js')])
function parsePatch(text) {
  return yaml.load(text, { schema: patchSchema })
}
/** Every inserted entry of a patch file, `insert` rows flattened. */
function insertedEntries(rows) {
  return (Array.isArray(rows) ? rows : []).flatMap((row) => (Array.isArray(row?.insert) ? row.insert : []))
}
/** The plugin ids a preset declaration carries. */
function presetPluginIds(rows) {
  const declaration = insertedEntries(rows).find((entry) => Array.isArray(entry?.config?.plugins))
  return (declaration?.config?.plugins ?? []).map((plugin) => plugin?.id)
}
let patchRows = null
let patchError = null
try {
  patchRows = parsePatch(patchText)
} catch (cause) {
  patchError = cause
}

const {
  Config,
  DEFAULT_PRESET_PERMISSION,
  DEFAULT_PROJECTS_ROOT,
  DEFAULT_SKILL_DIR,
  PRESET_ID,
  resolveProjectsRoot,
  resolveSkillDir,
} = await import('../lib/index.js')
const presetHalf = await import('../lib/preset.js')
const { buildSkillContent, parseSkillFile, skillDescription, UNCONFIGURED_MARK } = await import('../lib/skill.js')
const {
  detectCandidates,
  fileInfo,
  isStoreStub,
  repoRootOf,
  requirementsFileOf,
  runProbe,
  skillDirCandidates,
  validateInterpreter,
  venvCandidatePaths,
} = await import('../lib/python.js')

/**
 * A stand-in for the upstream checkout: same file layout (repo root with
 * `requirements.txt`, skill under `skills/ppt-master`) and a folded block scalar
 * in the frontmatter, which is the parsing shape the real file has.
 */
const fixtureRoot = join(tmp, 'upstream')
const fixtureSkills = join(fixtureRoot, 'skills', 'ppt-master')
const FIXTURE_SKILL = [
  '---',
  'name: ppt-master',
  'description: >-',
  '  Fixture presentation workflow for the portable self-check: it stands in for the',
  '  upstream skill file, which CI does not have. Folded block scalar on purpose.',
  'metadata:',
  '  version: "9.9.9"',
  '---',
  '',
  '# PPT Master Skill',
  '',
  'Fixture body.',
  '',
].join('\n')
function makeFixture() {
  rmSync(fixtureRoot, { recursive: true, force: true })
  mkdirSync(fixtureSkills, { recursive: true })
  writeFileSync(join(fixtureSkills, 'SKILL.md'), FIXTURE_SKILL, 'utf8')
  writeFileSync(join(fixtureRoot, 'requirements.txt'), 'python-pptx==1.0.2\n', 'utf8')
}
makeFixture()

/** The first real interpreter on PATH, or null when none can be executed. */
async function systemPython() {
  const names = process.platform === 'win32' ? ['python.exe', 'python3.exe'] : ['python3', 'python']
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir === '') continue
    for (const name of names) {
      const candidate = join(dir, name)
      if (!fileInfo(candidate).isFile) continue
      const validated = await validateInterpreter(candidate)
      if (validated.ok === true) return candidate
    }
  }
  return null
}

/**
 * The shipped `standard` agent preset inside a dsh installation, whose plugin
 * list this bundle copies. Located from the node that runs this script or from
 * common global roots; `PPT_MASTER_STANDARD_PATCH` overrides the search.
 */
function findStandardPatch() {
  const marker = ['@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-web-app', 'presets', 'standard.patch.yml']
  const explicit = process.env.PPT_MASTER_STANDARD_PATCH
  const nodeDir = dirname(process.execPath)
  const roots = [
    explicit,
    join(nodeDir, 'node_modules', ...marker),
    join(dirname(nodeDir), 'node_modules', ...marker),
    join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', ...marker),
    join(homedir(), 'Programs', 'Scoop', 'persist', 'nodejs-lts', 'bin', 'node_modules', ...marker),
  ].filter((value) => typeof value === 'string' && value !== '')
  return roots.find((path) => fileInfo(path).isFile) ?? null
}

console.log('package manifest')
{
  check('the name is scoped', /^@[^/]+\/[^/]+$/u.test(manifest.name), manifest.name)
  check('the version is semver', /^\d+\.\d+\.\d+/u.test(manifest.version), manifest.version)
  check('main points at the profile half', manifest.main === 'lib/index.js', manifest.main)
  check('exports expose the client half', manifest.exports?.['./client']?.default === './lib/client.js')
  check('exports expose the preset half', manifest.exports?.['./preset']?.default === './lib/preset.js')
  check('the declared bundle patch exists', fileInfo(join(root, manifest.dsh?.bundle?.patch ?? 'missing')).isFile, manifest.dsh?.bundle?.patch)
  check('the client half targets the web platform', manifest.dsh?.client?.platform === 'web')
  check('the dsh peer range is declared', typeof manifest.peerDependencies?.['@deepseek-ai/dsh'] === 'string')
  check('published files are whitelisted', Array.isArray(manifest.files) && manifest.files.includes('lib/'))
}

console.log('Config schema')
{
  const parsed = Config({ python: 'C:/x/python.exe' })
  check('volatile python reads through get()', parsed.python.get() === 'C:/x/python.exe')
  check('skillDir default is empty (auto-locate)', parsed.skillDir.get() === DEFAULT_SKILL_DIR && DEFAULT_SKILL_DIR === '', parsed.skillDir.get())
  const empty = Config({})
  check('empty config means unconfigured', empty.python.get() === '')
  check('python field is marked volatile', Config.dict.python.meta.volatile === true)
}

console.log('skill directory resolution')
{
  check('an explicit skillDir wins', resolveSkillDir('C:/custom', undefined).source === 'config')
  const located = resolveSkillDir('', undefined)
  check('auto-location reports a known source', ['auto', 'environment', 'unresolved'].includes(located.source), located.source)
  check('conventional candidates stay absolute', skillDirCandidates('C:/dsh').every((dir) => /^[A-Za-z]:[\\/]|^\//u.test(dir)))
  check('an unresolved lookup never throws', resolveSkillDir('', 'C:/definitely-not-here') !== null)
  check('the fixture looks like a checkout', fileInfo(join(fixtureSkills, 'SKILL.md')).isFile, fixtureSkills)
}

console.log('projects root resolution')
{
  const repo = 'C:/repo'
  check('the default mode is the session workspace', DEFAULT_PROJECTS_ROOT === 'workspace', DEFAULT_PROJECTS_ROOT)
  check('Config defaults to workspace mode', Config({}).projectsRoot.get() === 'workspace')
  const workspace = resolveProjectsRoot('', { cwd: 'C:/work/session', repoRoot: repo })
  check('workspace mode uses the session directory', workspace.source === 'workspace' && /work[\\/]session[\\/]projects$/u.test(workspace.root), workspace.root)
  const fallback = resolveProjectsRoot('workspace', { repoRoot: repo })
  check('workspace mode without a session directory falls back to the checkout', fallback.source === 'workspace-fallback' && /repo[\\/]projects$/u.test(fallback.root), fallback.root)
  const repoMode = resolveProjectsRoot('repo', { cwd: 'C:/work', repoRoot: repo })
  check('repo mode keeps the checkout root', repoMode.source === 'repo' && /repo[\\/]projects$/u.test(repoMode.root), repoMode.root)
  const custom = resolveProjectsRoot('D:/decks', { cwd: 'C:/work', repoRoot: repo })
  check('an absolute path is used as the root itself', custom.source === 'configured' && custom.root === 'D:/decks', custom.root)
  check('presetPermission defaults to Full access', DEFAULT_PRESET_PERMISSION === 'danger-full-access' && Config({}).presetPermission.get() === 'danger-full-access')
}

console.log('bundle patch')
{
  check('the patch parses as YAML', patchRows !== null && patchError === null, patchError?.message)
  if (patchRows !== null) {
    check('the patch is a patch list', Array.isArray(patchRows), typeof patchRows)
    const entries = insertedEntries(patchRows)
    const hostRow = entries.find((entry) => entry?.id === 'ppt-master')
    const presetRow = entries.find((entry) => entry?.id === 'preset-ppt-master')
    check('the profile half is inserted under its own id', hostRow?.name === manifest.name, JSON.stringify(hostRow))
    check('the preset declaration is inserted', presetRow?.name === '@deepseek-ai/dsh-agent-preset', JSON.stringify(presetRow?.name))
    check('the declared preset id matches PRESET_ID', presetRow?.config?.id === PRESET_ID, presetRow?.config?.id)
    check('the preset is labelled for the picker', typeof presetRow?.config?.name === 'string' && typeof presetRow?.config?.description === 'string')
    const plugins = presetRow?.config?.plugins
    check('the preset carries a plugin list', Array.isArray(plugins) && plugins.length > 10, Array.isArray(plugins) ? plugins.length : typeof plugins)
    const ids = (plugins ?? []).map((plugin) => plugin?.id)
    check('preset plugin ids are unique', new Set(ids).size === ids.length)
    check(
      'the preset mounts the preset half',
      (plugins ?? []).some((plugin) => plugin?.id === 'ppt-master-skill' && plugin?.name === `${manifest.name}/preset`),
    )
    check('the preset keeps the skill tools', ids.includes('skill-filesystem') && ids.includes('tool-skill'))
    const bash = (plugins ?? []).find((plugin) => plugin?.id === 'tool-bash')
    check(
      '!!js conditions survive parsing',
      typeof bash?.disabled?.__jsExpr === 'string' && bash.disabled.__jsExpr.includes('win32'),
      JSON.stringify(bash?.disabled),
    )
  }
}

console.log('preset half')
{
  check('the preset half exports a plugin name', typeof presetHalf.name === 'string' && presetHalf.name.length > 0, presetHalf.name)
  check('the preset half injects the profile half service', Array.isArray(presetHalf.inject) && presetHalf.inject.includes('pptMaster'), JSON.stringify(presetHalf.inject))
  check('the preset half exports apply()', typeof presetHalf.apply === 'function')
  check('the preset half pins through the shared API', presetHalf.apply.toString().includes('pinSession'))
}

console.log('skill file (fixture)')
const fixtureSkillPath = join(fixtureSkills, 'SKILL.md')
const fixtureParsed = parseSkillFile(readFileSync(fixtureSkillPath, 'utf8'))
{
  check('parses without error', fixtureParsed.error === undefined, fixtureParsed.error)
  check('name is ppt-master', fixtureParsed.name === 'ppt-master', fixtureParsed.name)
  check('a folded description block is collapsed', fixtureParsed.description?.startsWith('Fixture presentation workflow') && !fixtureParsed.description.includes('\n'), fixtureParsed.description?.slice(0, 60))
  check('metadata.version is read', fixtureParsed.version === '9.9.9', fixtureParsed.version)
  check('body drops the frontmatter', fixtureParsed.body.startsWith('# PPT Master Skill'), fixtureParsed.body.slice(0, 24))
  check('repoRoot is derived from the skill directory', repoRootOf(fixtureSkills) === fixtureRoot, repoRootOf(fixtureSkills))
  check('requirements file resolves', requirementsFileOf(fixtureSkills) === join(fixtureRoot, 'requirements.txt'))
}

console.log('assembled sections')
{
  const facts = {
    python: 'C:/x/python.exe',
    pythonVersion: '3.12.7',
    skillDir: fixtureSkills,
    repoRoot: fixtureRoot,
    projectsRoot: join('C:/work/session', 'projects'),
    projectsRootSource: 'workspace',
    configPath: 'C:/Users/x/.dsh/profiles/web/cordis.patch.yml',
    skillVersion: fixtureParsed.version,
    requirementsFile: requirementsFileOf(fixtureSkills),
  }
  const base = fixtureParsed.description
  check('mark is absent when configured', !skillDescription(base, true).startsWith(UNCONFIGURED_MARK))
  const marked = skillDescription(base, false)
  check('mark is present when unconfigured', marked.startsWith(UNCONFIGURED_MARK))
  check('description stays within budget', marked.length <= 500, marked.length)

  const configured = buildSkillContent(fixtureParsed.body, facts, true)
  check('configured body keeps the skill body', configured.includes('Fixture body.'))
  check('configured body carries the interpreter', configured.includes('C:/x/python.exe'))
  check('configured body carries the projects root', configured.includes('"projectsRootSource": "workspace"') && configured.includes('projects'))
  check('configured body numbers the projects rule', configured.includes('4. Create and run every project under'))
  check('configured body numbers the deliverable rule', configured.includes('5. Deliverables land in the project'))
  check('the projects rule teaches --dir', configured.includes('--dir \\"<projectsRoot>\\"') || configured.includes('--dir "<projectsRoot>"'))
  check('configured body has no warning', !configured.includes('Python is not configured'))

  const unconfigured = buildSkillContent(fixtureParsed.body, { ...facts, python: null }, false)
  check('warning comes before the body', unconfigured.indexOf('Python is not configured') < unconfigured.indexOf('Fixture body.'))
  check('warning routes through the tool', unconfigured.includes('ask_user_question') && unconfigured.includes('action: "set"'))
  check('unconfigured body drops the python3 translation rule', !unconfigured.includes('Read every `python3 <script>'))
  check('unconfigured body still carries the projects rule', unconfigured.includes('Create and run every project under'))
  check('unconfigured body still carries the facts block', unconfigured.includes('"skillDir"'))
}

console.log('candidate helpers')
{
  check('Store stubs are rejected', isStoreStub('C:/Users/x/AppData/Local/Microsoft/WindowsApps') === true)
  check('ordinary directories pass', isStoreStub('C:/Python312') === false)

  const venvPaths = venvCandidatePaths('/repo/skills/ppt-master', '/dsh-home').map((item) => item.path)
  const matches = (pattern) => venvPaths.some((value) => pattern.test(value))
  check(
    'repository .venv is probed first',
    /(?:^|[\\/])repo[\\/]\.venv[\\/]Scripts[\\/]python\.exe$/u.test(venvPaths[0]),
    venvPaths[0],
  )
  check('$DSH_HOME/ppt-master/.venv is probed', matches(/dsh-home[\\/]ppt-master[\\/]\.venv[\\/]Scripts[\\/]python\.exe$/u))
  check('~/.ppt-master/.venv is probed', matches(/\.ppt-master[\\/]\.venv[\\/]Scripts[\\/]python\.exe$/u))
  check('~/.ppt-master/venv is still probed', matches(/\.ppt-master[\\/]venv[\\/]Scripts[\\/]python\.exe$/u))
  check('POSIX layouts are covered too', matches(/\.ppt-master[\\/]\.venv[\\/]bin[\\/]python3$/u))
}

console.log('temporary skill directory')
{
  const fake = join(tmp, 'SKILL.md')
  writeFileSync(fake, '---\nname: ppt-master\ndescription: inline description\n---\n\n# Body\n', 'utf8')
  const inline = parseSkillFile(readFileSync(fake, 'utf8'))
  check('inline description parses', inline.description === 'inline description', inline.description)
  writeFileSync(fake, 'no frontmatter', 'utf8')
  check('missing frontmatter is reported', parseSkillFile(readFileSync(fake, 'utf8')).error !== undefined)
}

console.log('probe')
{
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  if (portable) {
    const python = await systemPython()
    if (python === null) {
      skip('the probe script runs on a system interpreter', 'none found on PATH')
    } else {
      console.log(`       interpreter ${python}`)
      const quick = await runProbe(python, { quick: true })
      check('quick probe returns a version', quick.ok === true && /^\d+\./u.test(quick.report.version), quick.error ?? quick.report?.version)
      const drift = await runProbe(python, { requirements: requirementsFileOf(fixtureSkills) })
      check('the probe accepts a requirements file', drift.ok === true && Array.isArray(drift.report.packages), drift.error)
    }
  } else {
    const candidates = [process.env.PPT_MASTER_PYTHON, ...venvCandidatePaths(fixtureSkills, dshHome).map((item) => item.path)].filter(
      (value) => typeof value === 'string' && value !== '',
    )
    const python = candidates.find((path) => fileInfo(path).isFile)
    if (python === undefined) {
      skip('the local skill environment', `no interpreter among ${candidates.length} candidates`)
    } else {
      console.log(`       interpreter ${python}`)
      const quick = await runProbe(python, { quick: true })
      check('quick probe returns a version', quick.ok === true && /^\d+\./u.test(quick.report.version), quick.error ?? quick.report?.version)
      const full = await runProbe(python, { requirements: requirementsFileOf(fixtureSkills) })
      check('full probe reports every tracked package', full.ok === true && full.report.packages.length === 19, full.error ?? full.report?.packages?.length)
      check('full probe reports tiers', full.ok === true && Array.isArray(full.report.coreMissing) && Array.isArray(full.report.optionalMissing))
      console.log(`       core ok=${full.ok === true && full.report.coreMissing.length === 0}, optional missing=${full.ok === true ? full.report.optionalMissing.length : 'n/a'}`)
      const validated = await validateInterpreter(python)
      check('validate accepts the real interpreter', validated.ok === true, validated.error)
      const bogus = await validateInterpreter(join(root, 'package.json'))
      check('validate rejects a non-interpreter', bogus.ok === false, JSON.stringify(bogus))
      const detected = await detectCandidates({ python, skillDir: fixtureSkills, dshHome: join(tmp, '.tmp-dsh') })
      check('detection validates the configured interpreter first', detected[0]?.path === python && detected[0]?.source === 'config', JSON.stringify(detected[0]))
      check('no Store stub is offered', detected.every((item) => !isStoreStub(item.path)))
    }
  }
}

console.log('environment: the upstream checkout')
{
  const located = resolveSkillDir('', undefined)
  const dir = located.dir
  if (portable) {
    skip('the upstream skill file', '--ci')
  } else if (dir === null || !fileInfo(join(dir, 'SKILL.md')).isFile) {
    skip('the upstream skill file', `nothing located (source ${located.source})`)
  } else {
    const real = parseSkillFile(readFileSync(join(dir, 'SKILL.md'), 'utf8'))
    check('parses without error', real.error === undefined, real.error)
    check('name is ppt-master', real.name === 'ppt-master', real.name)
    check('metadata.version is read', /^\d+\.\d+/u.test(real.version || ''), real.version)
    check('body drops the frontmatter', real.body.startsWith('#'), real.body.slice(0, 24))
    check('repoRoot is the checkout', fileInfo(join(repoRootOf(dir), 'requirements.txt')).isFile, repoRootOf(dir))
    check('requirements file resolves', requirementsFileOf(dir) === join(repoRootOf(dir), 'requirements.txt'))
    if (!real.description?.startsWith('AI-driven presentation workflow')) {
      warn('the upstream description wording changed', real.description?.slice(0, 60))
    }
    if (!real.body.startsWith('# PPT Master Skill')) warn('the upstream body heading changed', real.body.slice(0, 40))

    const facts = {
      python: 'C:/x/python.exe',
      pythonVersion: '3.12.7',
      skillDir: dir,
      repoRoot: repoRootOf(dir),
      projectsRoot: join('C:/work/session', 'projects'),
      projectsRootSource: 'workspace',
      configPath: 'C:/Users/x/.dsh/profiles/web/cordis.patch.yml',
      skillVersion: real.version,
      requirementsFile: requirementsFileOf(dir),
    }
    const assembled = buildSkillContent(real.body, facts, true)
    check('the real body keeps the upstream opening', assembled.startsWith('#'))
    check('the real body carries the facts block', assembled.includes('"python": "C:/x/python.exe"') && assembled.includes('"skillVersion"'))
    const realOff = buildSkillContent(real.body, { ...facts, python: null }, false)
    check('the real body leads with the warning when unconfigured', realOff.startsWith('## ⚠️ Python is not configured'))

    const standard = findStandardPatch()
    if (standard === null) {
      skip('the preset plugin list is still in step with the standard preset', 'no dsh install found')
    } else {
      let shippedIds = []
      try {
        shippedIds = presetPluginIds(parsePatch(readFileSync(standard, 'utf8')))
      } catch (cause) {
        warn('the shipped standard preset could not be parsed', cause.message)
      }
      const ourIds = presetPluginIds(patchRows)
      const missing = shippedIds.filter((id) => !ourIds.includes(id))
      check('the preset list still covers every standard row', shippedIds.length > 0 && missing.length === 0, missing.join(', ') || 'no rows read')
    }
  }
}

rmSync(tmp, { recursive: true, force: true })

console.log(
  failures === 0
    ? `\nall checks passed${skips > 0 ? ` (${skips} skipped)` : ''}${warnings > 0 ? `, ${warnings} warning(s)` : ''}`
    : `\n${failures} check(s) failed${skips > 0 ? ` (${skips} skipped)` : ''}`,
)
process.exitCode = failures === 0 ? 0 : 1
