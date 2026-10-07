/**
 * Read a DSH session log.
 *
 * The log is JSONL compressed as **one zstd frame per append**, so a single
 * `zstdDecompressSync` call returns only the first batch of events (reading the
 * header alone is a classic way to misread what a session did). This walks the
 * frame magic and decodes every frame.
 *
 * Usage:
 *   node dev/session-log.mjs <session-dir-or-file> [--filter regex] [--all]
 *   node dev/session-log.mjs --recent [minutes]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

function readFrames(file) {
  const buffer = readFileSync(file)
  const offsets = []
  for (let at = buffer.indexOf(MAGIC); at !== -1; at = buffer.indexOf(MAGIC, at + 4)) offsets.push(at)
  const text = []
  for (let index = 0; index < offsets.length; index += 1) {
    const end = index + 1 < offsets.length ? offsets[index + 1] : buffer.length
    try {
      text.push(zstdDecompressSync(buffer.subarray(offsets[index], end)).toString('utf8'))
    } catch {
      /* a truncated tail frame is expected while a session is live */
    }
  }
  return { events: text.join('').split('\n').filter(Boolean), frames: offsets.length }
}

function sessions() {
  const root = join(process.env.DSH_HOME || join(process.env.USERPROFILE || '', '.dsh'), 'sessions')
  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.zstd')) found.push(path)
    }
  }
  if (existsSync(root)) walk(root)
  return found.map((file) => ({ file, stat: statSync(file) })).sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs)
}

const argv = process.argv.slice(2)
const filterAt = argv.indexOf('--filter')
const filter = filterAt === -1 ? null : new RegExp(argv[filterAt + 1], 'u')
const showAll = argv.includes('--all')
const target = argv.find((argument, index) => !argument.startsWith('--') && index !== filterAt + 1)

const list = argv.includes('--recent')
  ? sessions().filter(({ stat }) => Date.now() - stat.mtimeMs < (Number(argv[argv.indexOf('--recent') + 1]) || 60) * 60_000)
  : []

if (!argv.includes('--recent') && target === undefined) {
  console.log('usage: node dev/session-log.mjs <session-dir-or-file> [--filter regex] [--all]')
  console.log('       node dev/session-log.mjs --recent [minutes]')
  process.exitCode = 1
} else {
  const files = argv.includes('--recent') ? list.map((item) => item.file) : [
    statSync(target).isDirectory() ? join(target, 'session.v4.jsonl.zstd') : target,
  ]
  for (const file of files) {
    const { events, frames } = readFrames(file)
    console.log(`=== ${file}  (${frames} frames, ${events.length} events, mtime ${statSync(file).mtime.toTimeString().slice(0, 8)})`)
    for (const line of events) {
      if (filter && !filter.test(line)) continue
      let event
      try {
        event = JSON.parse(line)
      } catch {
        console.log(`  <raw> ${line.slice(0, 200)}`)
        continue
      }
      const time = event.time === undefined ? '' : new Date(event.time).toTimeString().slice(0, 8)
      const body = JSON.stringify(event.data ?? event.payload ?? {})
      console.log(`  ${String(event.seq ?? '').padStart(4)} ${time} ${String(event.type).padEnd(30)} ${showAll ? body : body.slice(0, 190)}`)
    }
  }
}
