/**
 * Run npm from a dev script.
 *
 * On Windows Node refuses to execute npm's `.cmd` shim without a shell, while
 * `shell: true` concatenates arguments and warns (DEP0190). npm's own CLI entry
 * is therefore executed with the running node when it can be found, and the
 * shim is invoked directly everywhere else.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const CLI = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')

/**
 * Execute npm synchronously.
 * @param args - npm arguments.
 * @param options - `cwd`, `stdio`, `encoding`, ...
 * @returns captured stdout when `options.stdio` captures it.
 */
export function execNpm(args, options = {}) {
  if (existsSync(CLI)) return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...options })
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  return execFileSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32', ...options })
}
