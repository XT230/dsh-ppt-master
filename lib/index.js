/**
 * dsh-ppt-master — registers the PPT Master skill and manages the Python
 * interpreter that skill runs on.
 *
 * Configuration is this plugin's own Config: `python` and `skillDir` are
 * volatile fields, so the Settings service projects them into a form, the
 * config editor persists them into the active profile's `cordis.patch.yml`, and
 * a change reaches the running plugin in place through `loader/volatile-update`
 * — no restart, and no configuration file owned by this plugin.
 *
 * The plugin never installs packages, never edits PATH, and never touches a
 * system interpreter; it only executes a candidate once to learn whether it
 * really is a usable Python.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'

import {
  clearDetectionCache,
  detectCandidates,
  fileInfo,
  hasSkillFile,
  repoRootOf,
  requirementsFileOf,
  runProbe,
  samePath,
  skillDirCandidates,
  validateInterpreter,
} from './python.js'
import { buildSkillContent, parseSkillFile, skillDescription } from './skill.js'

export const name = 'ppt-master'
export const inject = ['skills', 'tools']

const SKILL_NAME = 'ppt-master'
/** Precedence of packaged skill providers, matching @deepseek-ai/dsh-skill. */
const SKILL_RANK = 600
const ENV_ROUTE = '/ppt-master/env'

/** The configured default: empty means "locate the skill directory automatically". */
export const DEFAULT_SKILL_DIR = ''
/** The configured default projects root: the calling session's own directory. */
export const DEFAULT_PROJECTS_ROOT = 'workspace'
/** Agent-preset id this bundle declares; the preset half mounts under it and the pin keys off it. */
export const PRESET_ID = 'ppt-master'
/**
 * Permission preset the preset-mounted half pins into its own sessions. The
 * skill's own tools create `0700` temporary directories, which the confined
 * sandbox refuses to write into, so a session that runs the skill needs the
 * wider mode; an empty value opts out and leaves permissions untouched.
 */
export const DEFAULT_PRESET_PERMISSION = 'danger-full-access'

export const Config = z.object({
  /** Absolute interpreter path; empty means "not configured". */
  python: z.string().default('').volatile(),
  /** Directory holding the skill's `SKILL.md`; empty means "locate it automatically". */
  skillDir: z.string().default(DEFAULT_SKILL_DIR).volatile(),
  /** Where a session creates its projects: `workspace` (default), `repo`, or an absolute path. */
  projectsRoot: z.string().default(DEFAULT_PROJECTS_ROOT).volatile(),
  /**
   * Permission preset the preset-mounted half applies to its own sessions;
   * empty means "leave the session's permissions alone".
   */
  presetPermission: z.string().default(DEFAULT_PRESET_PERMISSION).volatile(),
})

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Resolve the skill directory: an explicit value wins, then `PPT_MASTER_SKILL_DIR`,
 * then the first conventional checkout that actually holds a `SKILL.md`.
 * @returns the directory and where it came from.
 */
export function resolveSkillDir(configured, dshHome) {
  const explicit = text(configured)
  if (explicit) return { dir: explicit, source: 'config' }
  const fromEnv = text(process.env.PPT_MASTER_SKILL_DIR)
  if (fromEnv) return { dir: fromEnv, source: 'environment' }
  const candidates = skillDirCandidates(dshHome)
  const found = candidates.find((dir) => hasSkillFile(dir))
  if (found) return { dir: found, source: 'auto' }
  return { dir: candidates[0], source: 'unresolved' }
}

/** Read a volatile field reference (or a plain value) at use time. */
function readField(field, fallback) {
  const raw = field && typeof field.get === 'function' ? field.get() : field
  return text(raw) || fallback
}

/** Read a volatile field as-is, so an explicitly empty value stays empty. */
function readRaw(field) {
  const value = field && typeof field.get === 'function' ? field.get() : field
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Resolve where one session's projects live.
 *
 * `workspace` (the default) uses the calling session's own directory, so decks
 * land beside the work that asked for them and inside that session's writable
 * sandbox; `repo` keeps the upstream default under the checkout; any other
 * value is used as the root itself. A session without a directory falls back to
 * the checkout rather than guessing.
 *
 * @param configured - the configured mode or root path.
 * @param context - the session directory and the checkout root.
 * @returns the projects root and where it came from.
 */
export function resolveProjectsRoot(configured, { cwd, repoRoot } = {}) {
  const fallback = join(repoRoot, 'projects')
  const value = text(configured) || DEFAULT_PROJECTS_ROOT
  if (value === 'repo') return { root: fallback, source: 'repo' }
  if (value === 'workspace') {
    const base = text(cwd)
    return base ? { root: join(base, 'projects'), source: 'workspace' } : { root: fallback, source: 'workspace-fallback' }
  }
  return { root: value, source: 'configured' }
}

function remediationFor(state, view) {
  const repoRoot = view.repoRoot
  switch (state) {
    case 'configured':
      return 'Interpreter fixed. Call ppt_master_env with action "probe" before the first script of a run.'
    case 'unconfigured':
      return 'No interpreter is fixed. Call ppt_master_env for the validated candidates, ask the user to choose with ask_user_question, then call ppt_master_env with action "set" and the chosen absolute path. Do not decide for the user and do not install packages.'
    case 'invalid':
      return `The configured interpreter failed validation (${view.pythonError || 'unknown reason'}). Ask the user for a replacement, or let them fix it on the plugin's Configure page in the Web UI.`
    case 'no-interpreter':
      return `No usable interpreter was found. Ask the user to create one — for example \`uv venv -p 3.12 "${repoRoot}\\.venv"\` followed by \`uv pip install -r "${view.requirementsFile}"\` — then fix it with action "set".`
    case 'skill-missing':
      return `No SKILL.md under ${view.skillDir}. Ask the user to clone the upstream project (git clone https://github.com/hugohe3/ppt-master.git, then pip install -r <repo>/requirements.txt) and to set the plugin's skillDir to <repo>/skills/ppt-master on its Configure page. Locations tried: ${(view.skillDirsTried ?? [view.skillDir]).join(', ')}.`
    default:
      return 'Inspect the reported state and paths.'
  }
}

export function apply(ctx, config) {
  const dshHome = () => process.env.DSH_HOME || join(homedir(), '.dsh')
  const read = () => {
    const home = dshHome()
    const resolved = resolveSkillDir(readField(config.skillDir, ''), home)
    return {
      python: readField(config.python, ''),
      skillDir: resolved.dir,
      skillDirSource: resolved.source,
      projectsRootMode: readField(config.projectsRoot, DEFAULT_PROJECTS_ROOT),
      dshHome: home,
    }
  }
  const settings = () => {
    try {
      return ctx.get('settings') ?? null
    } catch {
      return null
    }
  }
  const documentPath = () => {
    const service = settings()
    try {
      return service?.documentPath ?? null
    } catch {
      return null
    }
  }
  const warn = (message, error) => {
    try {
      ctx.logger?.warn?.(`[ppt-master] ${message}`, error)
    } catch {
      /* logging must never break activation */
    }
  }

  function readSkill() {
    const { skillDir, python } = read()
    const path = join(skillDir, 'SKILL.md')
    if (!fileInfo(path).isFile) return null
    let parsed
    try {
      parsed = parseSkillFile(readFileSync(path, 'utf8'))
    } catch (cause) {
      warn(`cannot read ${path}`, cause)
      return null
    }
    if (parsed.error) {
      warn(`${path}: ${parsed.error}`)
      return null
    }
    return { path, parsed, skillDir, configured: python !== '' }
  }

  function facts(skillVersion, pythonVersion, sessionCwd) {
    const { python, skillDir, skillDirSource, projectsRootMode } = read()
    const repoRoot = repoRootOf(skillDir)
    const projects = resolveProjectsRoot(projectsRootMode, { cwd: sessionCwd, repoRoot })
    return {
      python: python || null,
      pythonVersion: python ? pythonVersion ?? null : null,
      skillDir,
      skillDirSource,
      repoRoot,
      projectsRoot: projects.root,
      projectsRootSource: projects.source,
      configPath: documentPath(),
      skillVersion: skillVersion ?? null,
      requirementsFile: requirementsFileOf(skillDir),
    }
  }

  async function status({ refresh = false, sessionCwd = '' } = {}) {
    const { python, skillDir, skillDirSource, projectsRootMode, dshHome: home } = read()
    const skillPath = join(skillDir, 'SKILL.md')
    const skillOk = fileInfo(skillPath).isFile
    const candidates = await detectCandidates({ python, skillDir, dshHome: home, refresh })
    const effective = python || null
    const match = effective ? candidates.find((item) => samePath(item.path, effective)) ?? null : null
    const state = !skillOk
      ? 'skill-missing'
      : effective && match && match.ok
        ? 'configured'
        : effective
          ? 'invalid'
          : candidates.some((item) => item.ok)
            ? 'unconfigured'
            : 'no-interpreter'
    let skillVersion = null
    if (skillOk) {
      try {
        skillVersion = parseSkillFile(readFileSync(skillPath, 'utf8')).version ?? null
      } catch {
        skillVersion = null
      }
    }
    const repoRoot = repoRootOf(skillDir)
    const projects = resolveProjectsRoot(projectsRootMode, { cwd: sessionCwd, repoRoot })
    const view = {
      state,
      python: effective,
      pythonVersion: match && match.ok ? match.version : null,
      pythonSource: effective ? 'config' : null,
      pythonError: effective && (!match || !match.ok) ? match?.error ?? 'not found among the local candidates' : null,
      skillName: SKILL_NAME,
      skillDir,
      skillDirSource,
      skillDirsTried: skillDirSource === 'unresolved' ? skillDirCandidates(home) : null,
      skillFile: skillPath,
      skillOk,
      skillVersion,
      repoRoot,
      projectsRoot: projects.root,
      projectsRootSource: projects.source,
      projectsRootMode,
      requirementsFile: requirementsFileOf(skillDir),
      configPath: documentPath(),
      writable: settings()?.writable ?? null,
      candidates,
    }
    return { ...view, remediation: remediationFor(state, view) }
  }

  async function probe(sessionCwd = '') {
    const view = await status({ sessionCwd })
    if (!view.python) {
      return { ...view, probed: false, ok: false, note: 'No interpreter is fixed; follow remediation first.' }
    }
    const result = await runProbe(view.python, { requirements: view.requirementsFile })
    if (result.ok !== true) {
      return {
        ...view,
        state: 'invalid',
        probed: false,
        ok: false,
        error: result.error,
        remediation: `The interpreter cannot execute the probe script: ${result.error}`,
      }
    }
    const report = result.report
    return {
      ...view,
      state: 'configured',
      probed: true,
      ok: report.ok,
      python: report.python,
      pythonVersion: report.version,
      implementation: report.implementation,
      prefix: report.prefix,
      basePrefix: report.basePrefix,
      coreMissing: report.coreMissing,
      optionalMissing: report.optionalMissing,
      packages: report.packages,
      untracked: report.untracked,
      note:
        report.ok === true
          ? 'Every core package imports; optional gaps are listed per capability.'
          : 'Core packages are missing: report them and wait for the user. Never install packages.',
    }
  }

  async function setInterpreter(value) {
    const service = settings()
    if (service === null) {
      return { ok: false, error: 'the settings service is not mounted in this profile; edit the profile patch instead' }
    }
    let writable
    try {
      writable = service.writable
    } catch {
      writable = false
    }
    if (writable !== true) {
      return { ok: false, error: 'this profile does not accept configuration writes (a higher layer or the profile mode owns it)' }
    }
    const entryId = ctx.fiber?.entry?.options?.id
    if (typeof entryId !== 'string' || !entryId) {
      return { ok: false, error: 'this plugin instance has no profile entry id to configure' }
    }
    const requested = text(value)
    let patch
    let pythonVersion = null
    if (requested) {
      const checked = await validateInterpreter(requested)
      if (checked.ok !== true) return { ok: false, error: checked.error }
      patch = { python: checked.target }
      pythonVersion = checked.version ?? null
    } else {
      patch = { python: '' }
    }
    try {
      await service.update(entryId, patch)
    } catch (cause) {
      return { ok: false, error: String(cause?.message ?? cause) }
    }
    clearDetectionCache()
    const after = read()
    return {
      ok: true,
      entryId,
      cleared: requested === '',
      python: after.python || null,
      pythonVersion,
      configPath: documentPath(),
      note: 'Stored in the active profile patch; the running plugin picked it up without a restart.',
    }
  }

  // ---------------------------------------------------------------- skill provider

  const provider = {
    name: 'dsh-ppt-master',
    list: async () => {
      const view = readSkill()
      if (view === null) return []
      return [
        {
          name: SKILL_NAME,
          description: skillDescription(view.parsed.description, view.configured),
          invocation: { modelInvocable: true, userInvocable: true },
          provider: 'dsh-ppt-master',
          source: 'bundled',
          rank: SKILL_RANK,
          resourceBase: { kind: 'directory', path: view.skillDir },
          path: view.path,
          locator: view.path,
        },
      ]
    },
    get: async (candidate, options) => {
      const skillDir = read().skillDir
      const locator = typeof candidate.locator === 'string' ? candidate.locator : join(skillDir, 'SKILL.md')
      const parsed = parseSkillFile(readFileSync(locator, 'utf8'))
      if (parsed.error) throw new Error(`${locator}: ${parsed.error}`)
      const { python } = read()
      const configured = python !== ''
      let pythonVersion = null
      if (configured) {
        const candidates = await detectCandidates({ python, skillDir, dshHome: dshHome() })
        pythonVersion = candidates.find((item) => samePath(item.path, python))?.version ?? null
      }
      const { rank, locator: _locator, ...summary } = candidate
      return {
        ...summary,
        description: skillDescription(parsed.description, configured),
        content: buildSkillContent(parsed.body, facts(parsed.version, pythonVersion, options?.cwd), configured),
      }
    },
  }

  const changeListeners = new Set()
  /** Let the preset-mounted half refresh its catalog when the configuration changes. */
  function onConfigChange(listener) {
    changeListeners.add(listener)
    return () => changeListeners.delete(listener)
  }
  // The skill provider and the tool are registered by the preset-mounted half
  // (`./preset`), so the capability exists only in sessions that select the
  // preset this plugin declares. This half stays in the profile, where its
  // Config is what the Configure page edits.

  // ---------------------------------------------------------------------- tool

  const tool = {
    name: 'ppt_master_env',
    description:
      'Inspect or fix the Python interpreter the ppt-master skill runs on, and check that interpreter\'s packages. ' +
      'Reads the plugin configuration and the local interpreters; the only write is the interpreter path itself, stored in the active profile patch. ' +
      'It never installs packages, edits PATH, or changes the sandbox policy.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'probe', 'set'],
          description:
            'status (default) reports the configured interpreter, the validated local candidates, and what to do next; ' +
            'probe import-checks the skill\'s packages on the configured interpreter and reports them by tier; ' +
            'set fixes an interpreter path or clears it.',
        },
        python: {
          type: 'string',
          description:
            'Absolute path of the interpreter for action "set"; it is executed once to confirm it runs. ' +
            'Pass an empty string to clear the fixed interpreter and return to detection. Ignored by the other actions.',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    execute: async (args, exec) => {
      const action = typeof args?.action === 'string' ? args.action : 'status'
      // The calling session's directory decides the projects root in `workspace` mode.
      const sessionCwd = text(exec?.agent?.session?.header?.cwd)
      try {
        if (action === 'probe') return await probe(sessionCwd)
        if (action === 'set') return await setInterpreter(args?.python ?? '')
        return await status({ sessionCwd })
      } catch (cause) {
        return { ok: false, action, error: String(cause?.message ?? cause) }
      }
    },
  }

  // -------------------------------------------------- configuration change hook

  ctx.effect(
    () =>
      ctx.on('loader/volatile-update', () => {
        clearDetectionCache()
        for (const listener of changeListeners) {
          try {
            listener()
          } catch (cause) {
            warn('a configuration-change listener failed', cause)
          }
        }
      }),
    'ppt-master: volatile configuration',
  )

  // ------------------------------------------------------------ preset-facing API

  /**
   * What the preset-mounted half consumes: the same reads and writes the tools
   * and the Configure page use, so both halves share one configuration.
   */
  const api = {
    provider,
    tool,
    onConfigChange,
    read,
    status,
    probe,
    setInterpreter,
    /** The permission preset to pin into this preset's sessions; '' leaves them untouched. */
    permissionPreset: () => readRaw(config.presetPermission),
    /** Pin one session (called by the preset half's own in-scope hook). */
    pinSession,
  }
  ctx.effect(() => ctx.provide('pptMaster', api), 'ppt-master: preset-facing API')

  // ------------------------------------------------- session permission pinning

  // A session that selects this plugin's preset needs the wider sandbox: the
  // skill's own scripts create `0700` temporary directories, which a confined
  // sandbox refuses to write into. Three hooks cover every selection path, and
  // the preset half adds a fourth from inside its own scope:
  //   - `agent/created` (scoped): a session created with the preset, whose agent
  //     preset is read back from the registry;
  //   - `agent-preset/selected` (global): switching an already-created session to
  //     the preset — no agent is created, so creation alone missed this path;
  //   - `agent/inbox/claimed`, registered by the preset half: the switched
  //     session's scope is rebound to the new generation, so its first message
  //     reaches a listener there even if the global event is not delivered here.
  // `set()` appends nothing when the session already matches, so every hook is safe.
  function pinSession(session) {
    const name = readRaw(config.presetPermission)
    if (!name || !session) return
    let permissions
    try {
      permissions = ctx.get('permissionPresets')
    } catch {
      permissions = undefined
    }
    if (!permissions) return
    try {
      permissions.set(session, name)
    } catch (cause) {
      warn(`cannot pin the permission preset "${name}"`, cause)
    }
  }
  function presetOfAgent(agent) {
    try {
      return ctx.get('agentPresets')?.composedPreset?.(agent?.ctx)
    } catch {
      return undefined
    }
  }
  ctx.effect(
    () =>
      ctx.on('agent-preset/selected', (sessionId, preset) => {
        if (preset !== PRESET_ID) return
        pinSession(ctx.get('sessions')?.get?.(sessionId))
      }),
    'ppt-master: pin on preset switch',
  )
  ctx.effect(
    () =>
      ctx.on('agent/created', ({ agent }) => {
        if (presetOfAgent(agent) !== PRESET_ID) return
        pinSession(agent?.session)
      }),
    'ppt-master: pin on agent creation',
  )

  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber), 'ppt-master: config page policy')
  })

  // ------------------------------------------------- browser environment route

  ctx.inject(['webServer'], (web) => {
    web.effect(
      () =>
        web.webServer.register({
          kind: 'exact',
          path: ENV_ROUTE,
          handler: async (req, res) => {
            const send = (code, value) => {
              res.statusCode = code
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify(value))
            }
            if (req.method !== 'POST') {
              send(405, { ok: false, message: 'method not allowed' })
              return
            }
            let raw = ''
            try {
              for await (const chunk of req) raw += chunk
            } catch (cause) {
              send(400, { ok: false, message: `cannot read the request body: ${String(cause)}` })
              return
            }
            let envelope = {}
            try {
              envelope = JSON.parse(raw || '{}')
            } catch {
              send(400, { ok: false, message: 'invalid json' })
              return
            }
            const payload = envelope?.payload && typeof envelope.payload === 'object' ? envelope.payload : {}
            try {
              if (envelope?.method === 'status') {
                send(200, { ok: true, data: await status({ refresh: payload.refresh === true }) })
                return
              }
              if (envelope?.method === 'probe') {
                send(200, { ok: true, data: await probe() })
                return
              }
              if (envelope?.method === 'validate') {
                const result = await validateInterpreter(payload.python)
                send(200, { ok: true, data: result })
                return
              }
              send(400, { ok: false, message: `unknown method: ${String(envelope?.method)}` })
            } catch (cause) {
              warn(`route ${ENV_ROUTE} failed`, cause)
              send(500, { ok: false, message: String(cause?.message ?? cause) })
            }
          },
        }),
      'ppt-master: environment route',
    )
  })
}
