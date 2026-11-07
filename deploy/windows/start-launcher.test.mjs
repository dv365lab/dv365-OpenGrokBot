import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const launcher = fileURLToPath(new URL('../../启动OpenGrokBot.bat', import.meta.url))
const desktopLauncher = fileURLToPath(new URL('./start-desktop.mjs', import.meta.url))

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
      writeFileSync(join(bin, 'node.cmd'), [
        '@echo off',
        'if "%1"=="-e" exit /b %LAUNCHER_TEST_NODE_EXIT%',
        'if not "%1"=="deploy\\windows\\start-desktop.mjs" exit /b 99',
        'echo start>> "%LAUNCHER_TEST_COMMANDS%"',
        'cd >> "%LAUNCHER_TEST_DIRECTORIES%"',
        'exit /b %LAUNCHER_TEST_START_EXIT%',
        '',
      ].join('\r\n'))
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

async function listen(port = 0) {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  return server
}

function close(server) {
  return new Promise((resolve) => server.close(resolve))
}

async function runDesktop(port, options = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'opengrokbot-ports-'))
  let child
  try {
    mkdirSync(join(temp, 'deploy', 'windows'), { recursive: true })
    mkdirSync(join(temp, 'gateway', 'dist'), { recursive: true })
    const entry = join(temp, 'deploy', 'windows', 'start-desktop.mjs')
    copyFileSync(desktopLauncher, entry)
    writeFileSync(join(temp, 'gateway', 'dist', 'main.js'), `
      const { createServer } = require('node:net')
      const { existsSync, writeFileSync } = require('node:fs')
      if (process.env.TEST_START_FAILURE) {
        console.error('test: unrelated gateway failure')
        process.exit(7)
      }
      const marker = ${JSON.stringify(join(temp, 'race-marker'))}
      if (process.env.TEST_BIND_RACE && !existsSync(marker)) {
        writeFileSync(marker, '')
        console.error('Error: listen EADDRINUSE: address already in use')
        process.exit(1)
      }
      const server = createServer()
      server.on('error', (error) => { console.error(error); process.exit(1) })
      server.listen(Number(process.env.OPENGROKBOT_PORT), process.env.OPENGROKBOT_HOST, () => {
        console.log('[gateway] listening on 127.0.0.1:' + server.address().port)
        console.log('test: cwd=' + process.cwd())
        console.log('test: model=' + process.env.OPENGROKBOT_MODEL)
        setTimeout(() => server.close(), 100)
      })
    `)
    child = spawn(process.execPath, [entry], {
      env: {
        SystemRoot: process.env.SystemRoot,
        OPENGROKBOT_HOST: '127.0.0.1',
        OPENGROKBOT_PORT: String(port),
        OPENGROKBOT_MODEL: 'keep-the-configured-model',
        TEST_START_FAILURE: options.fail ? '1' : '',
        TEST_BIND_RACE: options.race ? '1' : '',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk })
    const status = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Launcher timed out: ${output}`)), 10_000)
      child.once('error', (err) => { clearTimeout(timer); reject(err) })
      child.once('close', (code) => { clearTimeout(timer); resolve(code) })
    })
    const actualPort = Number(output.match(/\[gateway\] listening on 127\.0\.0\.1:(\d+)/)?.[1])
    if (status === 0) {
      assert.ok(output.includes(`test: cwd=${join(temp, 'gateway')}`), output)
      assert.match(output, /test: model=keep-the-configured-model/)
    }
    return { status, output, port: actualPort }
  } finally {
    if (child && child.exitCode === null) {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
    }
    rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

describe('Windows automatic port fallback', { skip: process.platform !== 'win32' }, () => {
  it('starts on the configured port when it is free', async () => {
    const reservation = await listen()
    const port = reservation.address().port
    await close(reservation)
    const result = await runDesktop(port)
    assert.equal(result.status, 0, result.output)
    assert.equal(result.port, port, result.output)
  })

  it('skips occupied ports without stopping their servers', async () => {
    const occupied = await listen()
    const port = occupied.address().port
    try {
      const result = await runDesktop(port)
      assert.equal(result.status, 0, result.output)
      assert.ok(result.port > port, result.output)
      assert.match(result.output, /already in use/i)
      assert.ok(occupied.listening)
    } finally { await close(occupied) }
  })

  it('retries when a port is taken between the check and actual startup', async () => {
    const reservation = await listen()
    const port = reservation.address().port
    await close(reservation)
    const result = await runDesktop(port, { race: true })
    assert.equal(result.status, 0, result.output)
    assert.ok(result.port > port, result.output)
    assert.doesNotMatch(result.output, /Error: listen EADDRINUSE/)
  })

  it('continues past consecutive occupied ports', async () => {
    let first
    let second
    // Reserve a consecutive pair without relying on a fixed port being free in CI.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      first = await listen()
      const port = first.address().port
      if (port < 65534) {
        try { second = await listen(port + 1); break } catch (error) {
          if (error.code !== 'EADDRINUSE') { await close(first); throw error }
        }
      }
      await close(first)
    }
    assert.ok(second, 'could not reserve two consecutive ports')
    try {
      const port = first.address().port
      const result = await runDesktop(port)
      assert.equal(result.status, 0, result.output)
      assert.ok(result.port >= port + 2, result.output)
      assert.ok(first.listening && second.listening)
    } finally { await Promise.all([close(first), close(second)]) }
  })

  it('preserves other startup failures without retrying them', async () => {
    const result = await runDesktop(0, { fail: true })
    assert.equal(result.status, 7, result.output)
    assert.match(result.output, /unrelated gateway failure/)
  })

  it('rejects an invalid port with a clear message', async () => {
    const result = await runDesktop(65536)
    assert.equal(result.status, 1, result.output)
    assert.match(result.output, /OPENGROKBOT_PORT/)
  })

  it('reports exhaustion instead of exceeding the TCP port range', async () => {
    let occupied
    try { occupied = await listen(65535) } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error
    }
    try {
      const result = await runDesktop(65535)
      assert.equal(result.status, 1, result.output)
      assert.match(result.output, /No available port remains/)
    } finally { if (occupied) await close(occupied) }
  })
})
