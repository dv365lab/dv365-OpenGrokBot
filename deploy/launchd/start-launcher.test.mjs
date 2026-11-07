import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const launcher = fileURLToPath(new URL('../../启动OpenGrokBot.command', import.meta.url))

function runLauncher({ nodeExit = 0, failStep = '', noPnpm = false, noNpm = false, npmExit = 0 } = {}) {
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
    symlinkSync('/usr/bin/dirname', join(bin, 'dirname'))
    const record = 'printf "%s:%s\\n" "$PWD" "$*" >> "$COMMANDS"\n'
    const checkRetry = 'if [[ "$1" == start && "$OPENGROKBOT_PORT_RETRY" != 1 ]]; then exit 99; fi\n'
    const scripts = { node: `#!/bin/bash\nexit ${nodeExit}\n` }
    if (!noPnpm) scripts.pnpm = `#!/bin/bash\n${record}${checkRetry}[[ "$1" != "$FAIL_STEP" ]] || exit 7\n`
    if (!noNpm) scripts.npm = `#!/bin/bash\n${record}[[ "$NPM_EXIT" == 0 ]] || exit "$NPM_EXIT"\nshift 5\n${checkRetry}[[ "$1" != "$FAIL_STEP" ]] || exit 7\n`
    for (const [name, script] of Object.entries(scripts)) {
      writeFileSync(join(bin, name), script, { mode: 0o755 })
    }
    const result = spawnSync(entry, [], {
      cwd: temp,
      env: { ...process.env, PATH: bin, COMMANDS: commands, FAIL_STEP: failStep, NPM_EXIT: String(npmExit) },
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

  it('automatically runs pinned pnpm through npm when pnpm is missing', () => {
    const result = runLauncher({ noPnpm: true })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(result.calls, ['install --frozen-lockfile', 'build', 'start'].map(
      args => `exec --yes --package=pnpm@10.33.2 -- pnpm ${args}`,
    ))
  })

  it('explains how to fix missing npm and pnpm', () => {
    const result = runLauncher({ noPnpm: true, noNpm: true })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /npm.*Node.js 22/)
    assert.deepEqual(result.calls, [])
  })

  it('stops if the automatic pnpm download fails', () => {
    const result = runLauncher({ noPnpm: true, npmExit: 9 })
    assert.equal(result.status, 9)
    assert.match(result.stderr, /Dependency installation failed/)
    assert.equal(result.calls.length, 1)
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
