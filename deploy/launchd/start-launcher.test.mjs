import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const launcher = fileURLToPath(new URL('../../启动OpenGrokBot.command', import.meta.url))

function runLauncher({ nodeExit = 0, failStep = '' } = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'opengrokbot-launcher-'))
  const repo = join(temp, '中文 project (one click) & !')
  const bin = join(temp, 'bin')
  const commands = join(temp, 'commands')
  try {
    mkdirSync(repo)
    mkdirSync(bin)
    const entry = join(repo, '启动OpenGrokBot.command')
    copyFileSync(launcher, entry)
    chmodSync(entry, 0o755)
    for (const [name, script] of Object.entries({
      node: `#!/bin/bash\nexit ${nodeExit}\n`,
      pnpm: '#!/bin/bash\nprintf "%s:%s\\n" "$PWD" "$*" >> "$COMMANDS"\n[[ "$1" != "$FAIL_STEP" ]] || exit 7\n',
    })) {
      writeFileSync(join(bin, name), script, { mode: 0o755 })
    }
    const result = spawnSync(entry, [], {
      cwd: temp,
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, COMMANDS: commands, FAIL_STEP: failStep },
      encoding: 'utf8',
      timeout: 10_000,
    })
    assert.ifError(result.error)
    const calls = (() => {
      try { return readFileSync(commands, 'utf8').trim().split('\n') } catch (err) {
        if (err.code === 'ENOENT') return []
        throw err
      }
    })()
    for (const call of calls) assert.ok(call.startsWith(`${repo}:`), call)
    return { ...result, calls: calls.map(call => call.slice(repo.length + 1)) }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

describe('macOS double-click launcher', { skip: process.platform === 'win32' }, () => {
  it('installs, builds and starts from the checkout, not the caller directory', () => {
    const result = runLauncher()
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(result.calls, ['install --frozen-lockfile', 'build', 'start'])
  })

  it('rejects unsupported Node before installing dependencies', () => {
    const result = runLauncher({ nodeExit: 1 })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Node.js 22/)
    assert.deepEqual(result.calls, [])
  })

  for (const [failStep, calls] of [
    ['install', ['install --frozen-lockfile']],
    ['build', ['install --frozen-lockfile', 'build']],
    ['start', ['install --frozen-lockfile', 'build', 'start']],
  ]) {
    it(`stops on ${failStep} failure and preserves the exit code`, () => {
      const result = runLauncher({ failStep })
      assert.equal(result.status, 7)
      assert.match(result.stderr, /\[ERROR\]/)
      assert.deepEqual(result.calls, calls)
    })
  }
})
