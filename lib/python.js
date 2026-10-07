/**
 * Interpreter discovery, real-execution validation, and the dependency probe.
 *
 * Nothing here installs, upgrades, or registers anything: a candidate is only
 * ever executed once (`-I -B probe.py --quick`) to learn whether it really is a
 * usable Python and which version it reports.
 */
import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROBE_SCRIPT = fileURLToPath(new URL('./probe.py', import.meta.url))

const QUICK_TIMEOUT_MS = 15_000
const FULL_TIMEOUT_MS = 60_000
const MAX_CANDIDATES = 12
const DETECT_CONCURRENCY = 4
const CACHE_TTL_MS = 60_000

/** @returns whether the path exists, and whether it is a file or a directory. */
export function fileInfo(path) {
  try {
    const stats = statSync(path)
    return { exists: true, isFile: stats.isFile(), isDir: stats.isDirectory() }
  } catch {
    return { exists: false, isFile: false, isDir: false }
  }
}

/** Microsoft Store ships a stub `python.exe` that only opens the store page. */
export function isStoreStub(dir) {
  return /[\\/]WindowsApps(?:[\\/]|$)/iu.test(dir)
}

/** @returns whether two candidate paths address the same file on this platform. */
export function samePath(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

/** The upstream repository root (`<repo>/skills/ppt-master` → `<repo>`). */
export function repoRootOf(skillDir) {
  return dirname(dirname(skillDir))
}

/** The requirements file the upstream repository keeps at its root. */
export function requirementsFileOf(skillDir) {
  return join(repoRootOf(skillDir), 'requirements.txt')
}

/**
 * Conventional locations a local ppt-master checkout's skill directory is found
 * in, in the order they are tried. `skillDir` is empty by default so a fresh
 * install locates the checkout it finds instead of a publisher-specific path.
 */
export function skillDirCandidates(dshHome) {
  const home = homedir()
  const candidates = [
    join(home, 'ppt-master', 'skills', 'ppt-master'),
    join(home, 'Documents', 'Workspace', 'ppt-master', 'skills', 'ppt-master'),
  ]
  if (typeof dshHome === 'string' && dshHome) candidates.push(join(dshHome, 'ppt-master', 'skills', 'ppt-master'))
  candidates.push(join(home, '.ppt-master', 'skills', 'ppt-master'))
  return candidates
}

/** @returns whether a directory looks like the upstream skill bundle. */
export function hasSkillFile(dir) {
  return fileInfo(join(dir, 'SKILL.md')).isFile
}

function run(command, args, timeoutMs) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    } catch (cause) {
      resolve({ ok: false, error: String(cause) })
      return
    }
    const out = []
    const err = []
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* already gone */
      }
      finish({ ok: false, error: `timed out after ${timeoutMs} ms` })
    }, timeoutMs)
    child.stdout.on('data', (chunk) => out.push(chunk))
    child.stderr.on('data', (chunk) => err.push(chunk))
    child.on('error', (cause) => finish({ ok: false, error: String(cause) }))
    child.on('close', (code) => {
      const stdout = Buffer.concat(out).toString('utf8')
      const stderr = Buffer.concat(err).toString('utf8').trim()
      finish({ ok: true, code, stdout, stderr })
    })
  })
}

/**
 * Execute the probe script on one interpreter.
 * @param pythonPath - interpreter to execute.
 * @param options - `quick` skips the imports; `requirements` enables drift reporting.
 * @returns the parsed report, or an explicit failure with its reason.
 */
export async function runProbe(pythonPath, { quick = false, requirements = null, timeoutMs } = {}) {
  const args = ['-I', '-B', PROBE_SCRIPT]
  if (quick) args.push('--quick')
  if (requirements) args.push('--requirements', requirements)
  const run1 = await run(pythonPath, args, timeoutMs ?? (quick ? QUICK_TIMEOUT_MS : FULL_TIMEOUT_MS))
  if (run1.ok !== true) return { ok: false, error: run1.error }
  const tail = run1.stderr ? `; stderr: ${run1.stderr.slice(0, 400)}` : ''
  const start = run1.stdout.indexOf('{')
  if (start < 0) return { ok: false, error: `probe produced no JSON (exit code ${run1.code})${tail}`, code: run1.code }
  try {
    return { ok: true, report: JSON.parse(run1.stdout.slice(start)), code: run1.code }
  } catch (cause) {
    return { ok: false, error: `probe output is not valid JSON: ${cause.message}${tail}`, code: run1.code }
  }
}

/**
 * Conventional virtual-environment interpreter paths, most specific first.
 * Both the `venv` and the `.venv` directory name are covered, because either
 * is common for a checkout and for a user-level environment.
 * @param skillDir - the configured or located skill directory.
 * @param dshHome - the harness home whose `ppt-master` directory may hold one.
 * @returns candidate paths with the source label to report.
 */
export function venvCandidatePaths(skillDir, dshHome) {
  const repoRoot = repoRootOf(skillDir)
  const home = homedir()
  const dirs = [
    [join(repoRoot, '.venv'), 'repo-venv'],
    [join(dshHome, 'ppt-master', 'venv'), 'user-venv'],
    [join(dshHome, 'ppt-master', '.venv'), 'user-venv'],
    [join(home, '.ppt-master', 'venv'), 'user-venv'],
    [join(home, '.ppt-master', '.venv'), 'user-venv'],
  ]
  return dirs.flatMap(([dir, source]) => [
    { path: join(dir, 'Scripts', 'python.exe'), source },
    { path: join(dir, 'bin', 'python3'), source },
  ])
}

function venvCandidates(skillDir, dshHome) {
  return venvCandidatePaths(skillDir, dshHome).filter((item) => fileInfo(item.path).isFile)
}

function pathCandidates() {
  const found = []
  for (const dir of (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':')) {
    if (!dir || isStoreStub(dir)) continue
    for (const exe of process.platform === 'win32' ? ['python.exe', 'python3.exe'] : ['python3', 'python']) {
      const candidate = join(dir, exe)
      if (fileInfo(candidate).isFile) found.push({ path: candidate, source: 'path' })
    }
  }
  return found
}

/** Interpreters registered with the Windows launcher (`py -0p`), uv installs included. */
async function registryCandidates() {
  if (process.platform !== 'win32') return []
  const result = await run('py', ['-0p'], 8_000)
  if (result.ok !== true) return []
  const found = []
  for (const line of result.stdout.split(/\r?\n/u)) {
    const parsed = /^\s*-V:(\S+)\s*\*?\s+(.+?)\s*$/u.exec(line)
    if (parsed && /\.exe$/iu.test(parsed[2])) found.push({ path: parsed[2], source: `registry:${parsed[1]}` })
  }
  return found
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

let cache = { key: null, at: 0, value: null }

/** Drop the cached detection result (the configured interpreter or skill dir changed). */
export function clearDetectionCache() {
  cache = { key: null, at: 0, value: null }
}

/**
 * Collect candidate interpreters and check each one by executing it.
 * @param options - the configured interpreter, the skill directory, and the dsh home.
 * @returns validated candidates in precedence order.
 */
export async function detectCandidates({ python = '', skillDir, dshHome, refresh = false } = {}) {
  const key = `${skillDir}|${python}`
  if (!refresh && cache.value && cache.key === key && Date.now() - cache.at < CACHE_TTL_MS) return cache.value

  const seen = new Set()
  const ordered = []
  const push = (item) => {
    if (!item || !item.path) return
    const id = process.platform === 'win32' ? item.path.toLowerCase() : item.path
    if (seen.has(id)) return
    seen.add(id)
    ordered.push(item)
  }
  if (python) push({ path: python, source: 'config' })
  for (const item of venvCandidates(skillDir, dshHome)) push(item)
  for (const item of pathCandidates()) push(item)
  for (const item of await registryCandidates()) push(item)

  const checked = await mapLimit(ordered.slice(0, MAX_CANDIDATES), DETECT_CONCURRENCY, async (item) => {
    const probe = await runProbe(item.path, { quick: true })
    return {
      path: item.path,
      source: item.source,
      ok: probe.ok === true,
      version: probe.ok ? probe.report.version : null,
      error: probe.ok ? null : probe.error,
    }
  })

  cache = { key, at: Date.now(), value: checked }
  return checked
}

/**
 * Validate one explicit interpreter path by executing it.
 * @param pythonPath - the absolute path to check.
 * @returns the target and its version, or the reason it cannot be used.
 */
export async function validateInterpreter(pythonPath) {
  if (typeof pythonPath !== 'string' || !pythonPath.trim()) {
    return { ok: false, error: 'python must be the absolute path of an interpreter' }
  }
  const target = pythonPath.trim()
  if (!fileInfo(target).isFile) return { ok: false, error: `not a file: ${target}` }
  const probe = await runProbe(target, { quick: true })
  if (probe.ok !== true) return { ok: false, error: `that path does not run as Python: ${probe.error}` }
  return { ok: true, target, version: probe.report.version }
}
