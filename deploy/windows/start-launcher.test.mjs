import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const launcher = fileURLToPath(new URL('../../启动OpenGrokBot.bat', import.meta.url))

// Run the real batch file with command shims: no downloads or long-running server.
function runLauncher(options = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'opengrokbot-launcher-'))
  const repo = join(temp, '中文 project (one click) & !')
  const bin = join(temp, 'bin')
  const caller = join(temp, 'caller')
  const commands = join(temp, 'commands.txt')
  const directories = join(temp, 'directories.txt')
  const restored = join(temp, 'restored.txt')
  try {
    for (const dir of [repo, bin, caller]) mkdirSync(dir)
    copyFileSync(launcher, join(repo, '启动OpenGrokBot.bat'))
    if (!options.noNode) {
      writeFileSync(join(bin, 'node.cmd'), '@echo off\r\nexit /b %LAUNCHER_TEST_NODE_EXIT%\r\n')
    }
    if (!options.noPnpm) {
      writeFileSync(join(bin, 'pnpm.cmd'), [
        '@echo off',
        'echo %*>> "%LAUNCHER_TEST_COMMANDS%"',
        'cd >> "%LAUNCHER_TEST_DIRECTORIES%"',
        'if "%1"=="install" exit /b %LAUNCHER_TEST_INSTALL_EXIT%',
        'if "%1"=="build" exit /b %LAUNCHER_TEST_BUILD_EXIT%',
        'if "%1"=="start" exit /b %LAUNCHER_TEST_START_EXIT%',
        'exit /b 99',
        '',
      ].join('\r\n'))
    }
    writeFileSync(join(caller, 'run.cmd'), [
      '@echo off',
      'setlocal DisableDelayedExpansion',
      'call "%LAUNCHER_TEST_ENTRY%"',
      'set "LAUNCHER_TEST_EXIT=%errorlevel%"',
      'cd > "%LAUNCHER_TEST_RESTORED%"',
      'exit /b %LAUNCHER_TEST_EXIT%',
      '',
    ].join('\r\n'))
    const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'run.cmd'], {
      cwd: caller,
      env: {
        SystemRoot: process.env.SystemRoot,
        ComSpec: process.env.ComSpec,
        PATH: `${bin};${join(process.env.SystemRoot, 'System32')}`,
        PATHEXT: '.COM;.EXE;.BAT;.CMD',
        LAUNCHER_TEST_ENTRY: join(repo, '启动OpenGrokBot.bat'),
        LAUNCHER_TEST_COMMANDS: commands,
        LAUNCHER_TEST_DIRECTORIES: directories,
        LAUNCHER_TEST_RESTORED: restored,
        LAUNCHER_TEST_NODE_EXIT: String(options.nodeExit || 0),
        LAUNCHER_TEST_INSTALL_EXIT: String(options.installExit || 0),
        LAUNCHER_TEST_BUILD_EXIT: String(options.buildExit || 0),
        LAUNCHER_TEST_START_EXIT: String(options.startExit || 0),
      },
      input: '\r\n',
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
    })
    assert.ifError(result.error)
    const lines = (path) => {
      try { return readFileSync(path, 'utf8').trim().split(/\r?\n/) } catch (err) {
        if (err.code === 'ENOENT') return []
        throw err
      }
    }
    assert.deepEqual(lines(restored), [caller], 'restore the caller directory')
    for (const directory of lines(directories)) assert.equal(directory, repo)
    return { status: result.status, output: result.stdout + result.stderr, commands: lines(commands) }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

describe('Windows double-click launcher', { skip: process.platform !== 'win32' }, () => {
  it('installs, builds and starts from a checkout with Chinese, spaces and shell metacharacters', () => {
    const result = runLauncher()
    assert.equal(result.status, 0, result.output)
    assert.deepEqual(result.commands, ['install --frozen-lockfile', 'build', 'start'])
  })

  it('explains how to install Node when it is missing', () => {
    const result = runLauncher({ noNode: true })
    assert.equal(result.status, 1, result.output)
    assert.match(result.output, /Node\.js 22/)
    assert.deepEqual(result.commands, [])
  })

  it('rejects an unsupported Node version before installing dependencies', () => {
    const result = runLauncher({ nodeExit: 1 })
    assert.equal(result.status, 1, result.output)
    assert.match(result.output, /Node\.js 22/)
    assert.deepEqual(result.commands, [])
  })

  it('explains how to install pnpm when it is missing', () => {
    const result = runLauncher({ noPnpm: true })
    assert.equal(result.status, 1, result.output)
    assert.match(result.output, /npm install -g pnpm@10\.33\.2/)
    assert.deepEqual(result.commands, [])
  })

  for (const [option, commands] of [
    ['installExit', ['install --frozen-lockfile']],
    ['buildExit', ['install --frozen-lockfile', 'build']],
    ['startExit', ['install --frozen-lockfile', 'build', 'start']],
  ]) {
    it(`stops on ${option} failure, keeps the error visible and preserves the exit code`, () => {
      const result = runLauncher({ [option]: 7 })
      assert.equal(result.status, 7, result.output)
      assert.match(result.output, /\[ERROR\]/)
      assert.match(result.output, /Press any key/i)
      assert.deepEqual(result.commands, commands)
    })
  }
})
