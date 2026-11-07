import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createServer } from 'node:net'
import { it } from 'node:test'
import { retryOccupiedPort } from '../../gateway/src/port-retry.ts'

const busy = () => Object.assign(new Error('occupied'), { code: 'EADDRINUSE' })

function fakeServer(port = 4747) {
  const server = new EventEmitter()
  const attempts = []
  const messages = []
  server.listen = options => attempts.push(options)
  retryOccupiedPort(server, { port, host: '127.0.0.1', log: message => messages.push(message) })
  return { server, attempts, messages }
}

it('keeps trying consecutive ports when multiple ports are occupied', () => {
  const { server, attempts, messages } = fakeServer()
  server.emit('error', busy())
  server.emit('error', busy())
  assert.deepEqual(attempts, [
    { port: 4748, host: '127.0.0.1' },
    { port: 4749, host: '127.0.0.1' },
  ])
  assert.match(messages[0], /4747.*4748/)
  server.emit('listening')
  assert.equal(server.listenerCount('error'), 0)
})

it('uses OS allocation when the last port is occupied', () => {
  const { server, attempts } = fakeServer(65535)
  server.emit('error', busy())
  assert.deepEqual(attempts, [{ port: 0, host: '127.0.0.1' }])
})

it('does not retry permission, host or other startup errors', () => {
  const { server, attempts } = fakeServer()
  const error = Object.assign(new Error('permission denied'), { code: 'EACCES' })
  assert.throws(() => server.emit('error', error), error)
  assert.deepEqual(attempts, [])
})

it('does not retry an unexpected failure of OS port allocation', () => {
  const { server, attempts } = fakeServer(0)
  assert.throws(() => server.emit('error', busy()), /occupied/)
  assert.deepEqual(attempts, [])
})

it('actually binds another port without disrupting the existing listener', { timeout: 5000 }, async t => {
  const occupied = createServer()
  const gateway = createServer()
  t.after(() => { occupied.close(); gateway.close() })
  await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve))
  const port = occupied.address().port
  const messages = []
  retryOccupiedPort(gateway, { port, host: '127.0.0.1', log: message => messages.push(message) })
  await new Promise(resolve => gateway.listen(port, '127.0.0.1', resolve))
  assert.notEqual(gateway.address().port, port)
  assert.equal(occupied.listening, true)
  assert.ok(messages.length >= 1)
  assert.equal(gateway.listenerCount('error'), 0)
})
