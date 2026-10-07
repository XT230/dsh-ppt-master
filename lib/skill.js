/**
 * Skill-file parsing and the host-side sections this plugin adds to it.
 *
 * The upstream `SKILL.md` owns the whole workflow: it expects the host to supply
 * the absolute directory holding the file (`SKILL_DIR`) and to translate its
 * `python3 <script>` commands. This module only parses the frontmatter the skill
 * registry needs and builds the two sections appended to (or, while nothing is
 * configured, prepended to) the body.
 */

/** Model-facing description budget, matching what the skill tool renders. */
const DESCRIPTION_LIMIT = 500
/** Marks the catalog entry while no interpreter is fixed. */
export const UNCONFIGURED_MARK = '[Python not configured] '

function unquote(value) {
  const text = value.trim()
  if (
    (text.startsWith('"') && text.endsWith('"') && text.length > 1) ||
    (text.startsWith("'") && text.endsWith("'") && text.length > 1)
  ) {
    return text.slice(1, -1)
  }
  return text
}

/**
 * Parse the YAML frontmatter of a skill file.
 * @param raw - the complete `SKILL.md` text.
 * @returns skill name, capped description, optional `metadata.version`, and the body.
 */
export function parseSkillFile(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (!match) return { error: 'no YAML frontmatter' }

  const body = raw.slice(match[0].length).trim()
  let name = null
  let description = null
  let version = null
  let section = null

  for (const line of match[1].split(/\r?\n/)) {
    const top = /^([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line)
    if (top && !/^\s/u.test(line)) {
      section = top[1]
      const inline = top[2].trim()
      if (section === 'name' && name === null && inline) name = unquote(inline)
      else if (section === 'description' && description === null) {
        description = inline && !/^[>|][+-]?$/u.test(inline) ? unquote(inline) : ''
      }
      continue
    }
    if (!/^\s/u.test(line)) {
      if (line.trim() !== '') section = null
      continue
    }
    const text = line.trim()
    if (section === 'description' && description !== null) {
      description = description ? `${description} ${text}` : text
    } else if (section === 'metadata') {
      const found = /^version:\s*(.+)$/u.exec(text)
      if (found && version === null) version = unquote(found[1])
    }
  }

  if (!description) return { error: 'frontmatter has no description' }
  return {
    name,
    description: description.replace(/\s+/gu, ' ').trim(),
    version,
    body,
  }
}

/**
 * Build the catalog description, marking it while no interpreter is fixed.
 * @param base - the description parsed from the skill file.
 * @param configured - whether an interpreter is currently fixed.
 * @returns the description within the model-facing budget.
 */
export function skillDescription(base, configured) {
  const text = base || 'PPT Master: generate natively editable PPTX decks'
  if (configured) return text.length > DESCRIPTION_LIMIT ? `${text.slice(0, DESCRIPTION_LIMIT - 1)}…` : text
  const room = DESCRIPTION_LIMIT - UNCONFIGURED_MARK.length
  return UNCONFIGURED_MARK + (text.length > room ? `${text.slice(0, room - 1)}…` : text)
}

function factsBlock(facts) {
  return ['```json', JSON.stringify(facts, null, 2), '```'].join('\n')
}

/** Rule texts, in the order they are numbered. */
function ruleTexts(configured) {
  const texts = []
  if (configured) {
    texts.push(
      'Read every `python3 <script> …` in this skill as `& "<python>" "<absolute script path>" …` and never use a bare `python`, `python3`, or `py`.',
    )
  }
  texts.push(
    'Treat the `skillDir` above as the `SKILL_DIR` this file\'s "paths before commands" rule requires: use absolute paths, and work from `repoRoot` so the skill\'s relative `.env` and resource locations resolve as documented.',
    'Before the first script of a run, call `ppt_master_env` with `action: "probe"` and continue only when `ok` is true. If `coreMissing` is non-empty, report it and wait for the user — never install packages. A missing `optional` package disables the capability named beside it; say so instead of degrading silently.',
    'Create and run every project under `projectsRoot`, not under the checkout\'s own `projects/`: pass `--dir "<projectsRoot>"` where a command creates a project, and read any `projects/<name>` path in this skill\'s documents as the absolute `<projectsRoot>/<name>`. Carry that absolute path through every later command and resume prompt. If `projectsRootSource` is `workspace-fallback`, no session directory was available — confirm the destination with the user before creating anything.',
    'Deliverables land in the project\'s own `exports/` directory, named with the project name and a timestamp. Image-generation and image-search API keys come from the skill\'s own `.env` lookup order (working directory, skill directory, repo root, `~/.ppt-master/.env`).',
  )
  return texts
}

function rules(configured) {
  return ruleTexts(configured).map((text, index) => `${index + 1}. ${text}`)
}

function unconfiguredNotice(facts) {
  return [
    '## ⚠️ Python is not configured — nothing in this skill can run yet',
    '',
    '`dsh-ppt-master` has no interpreter fixed for this skill, so do not run any script and do not guess an interpreter. Resolve it first:',
    '',
    '1. Call `ppt_master_env` (no arguments) to get the validated candidates and the current state.',
    '2. Ask the user to choose one with `ask_user_question`, offering the candidates together with their real Python versions.',
    '3. Call `ppt_master_env` with `action: "set"` and the chosen absolute path.',
    '',
    `If the state is \`no-interpreter\`, offer no choice: give the user the environment setup instead (for example \`uv venv -p 3.12 "${facts.repoRoot}\\.venv"\` followed by \`uv pip install -r "${facts.requirementsFile}"\`), and wait.`,
    '',
    `The user can also fix this in the Web UI: Plugins → dsh-ppt-master → the \`ppt-master\` row's Configure page. The value is stored in the active profile patch (${facts.configPath}).`,
  ].join('\n')
}

/**
 * Assemble the skill body the model receives.
 * @param body - the parsed skill body.
 * @param facts - host facts (interpreter, skill paths, config path).
 * @param configured - whether an interpreter is currently fixed.
 * @returns body with the warning prepended when unconfigured and the runtime section appended.
 */
export function buildSkillContent(body, facts, configured) {
  const parts = []
  if (!configured) parts.push(unconfiguredNotice(facts))
  parts.push(body)
  const section = ['## Runtime provided by the dsh-ppt-master plugin', '', factsBlock(facts)]
  section.push(
    '',
    configured ? 'Local rules that override the `python3` spelling above:' : 'These rules apply once an interpreter is fixed:',
    '',
    ...rules(configured),
  )
  parts.push(section.join('\n'))
  return parts.join('\n\n')
}
