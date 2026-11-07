// Used only by the Windows .bat launcher; other platforms keep their existing entry points.
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const gatewayDir = fileURLToPath(new URL('../../gateway/', import.meta.url))
const host = process.env.OPENGROKBOT_HOST || '127.0.0.1'
const configuredPort = process.env.OPENGROKBOT_PORT?.trim() || '4747'

function probePort(port) {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen({ host, port, exclusive: true }, () => {
      const actualPort = server.address().port
      server.close((error) => error ? reject(error) : resolve(actualPort))
    })
  })
}

function runGateway(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['dist/main.js'], {
      cwd: gatewayDir,
      env: { ...process.env, OPENGROKBOT_PORT: String(port) },
      windowsHide: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    })
    let started = false
    let stopping = false
    let startupOutput = ''
    let startupErrors = ''
    const stop = (signal) => {
      stopping = true
      // Windows delivers console Ctrl+C to the child too. Let its shutdown handler finish.
      if (process.platform !== 'win32') child.kill(signal)
    }
    const interrupt = () => stop('SIGINT')
    const terminate = () => { stopping = true; child.kill('SIGTERM') }
    process.on('SIGINT', interrupt)
    process.on('SIGTERM', terminate)
    const cleanup = () => {
      process.off('SIGINT', interrupt)
      process.off('SIGTERM', terminate)
    }
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      process.stdout.write(chunk)
      if (!started) {
        startupOutput = (startupOutput + chunk).slice(-8192)
        if (startupOutput.includes('[gateway] listening on ')) {
          started = true
          process.stderr.write(startupErrors)
          startupErrors = ''
        }
      }
    })
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      if (started) process.stderr.write(chunk)
      else startupErrors += chunk
    })
    child.once('error', (error) => { cleanup(); reject(error) })
    child.once('close', (code) => {
      cleanup()
      const retry = !started && !stopping && code !== 0 && /\bEADDRINUSE\b/.test(startupErrors)
      if (!retry) process.stderr.write(startupErrors)
      resolve({ retry, code: code ?? 1 })
    })
  })
}

async function start() {
  let port = Number(configuredPort)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('OPENGROKBOT_PORT must be an integer between 0 and 65535.')
  }
  while (port <= 65535) {
    try {
      port = await probePort(port)
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error
      console.log(`[launcher] Port ${port} is already in use; trying the next port...`)
      port += 1
      continue
    }
    console.log(`[launcher] Starting OpenGrokBot on port ${port}...`)
    const result = await runGateway(port)
    if (!result.retry) return result.code
    // Another launch can win the race after the probe closes. Retry the actual bind too.
    console.log(`[launcher] Port ${port} was taken during startup; trying the next port...`)
    port += 1
  }
  throw new Error('No available port remains up to 65535. Set OPENGROKBOT_PORT to a lower starting port.')
}

try {
  process.exitCode = await start()
} catch (error) {
  console.error(`[ERROR] ${error.message}`)
  process.exitCode = 1
}
