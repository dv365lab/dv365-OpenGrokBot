import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { openDb, insertMessage, listConversations } from '../src/db.js'
import { seedTeammates } from '../src/seed.js'
import { createApp } from '../src/server.js'

describe('bot management', () => {
  it('edits persist after reseeding; archive/restore preserve histories and shared project', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ogb-manage-'))
    const db = openDb(':memory:')
    try {
      mkdirSync(join(dir, 'teammates', 'worker'), { recursive: true })
      writeFileSync(join(dir, 'teammates', 'worker', 'SOUL.md'), '# Worker\nOriginal role\n')
      mkdirSync(join(dir, 'project'))
      writeFileSync(join(dir, 'project', 'proof'), 'keep')
      mkdirSync(join(dir, 'workspaces'))
      symlinkSync(join(dir, 'project'), join(dir, 'workspaces', 'worker'))
      seedTeammates(db, join(dir, 'teammates'))
      insertMessage(db, { threadId: 'dm:worker', sender: 'user', kind: 'text', content: 'history' })
      const { app } = createApp({ db, dataDir: dir, llm: { chat: async () => { throw Error('should not run') } } })
      const patch = (body: unknown) => app.request('/api/bot-management/worker', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      expect((await patch({ name: '编辑者', role: 'write', emoji: '✍️', soul: '# Old\nNew persona' })).status).toBe(200)
      seedTeammates(db, join(dir, 'teammates'))
      expect(listConversations(db)[0]?.title).toBe('编辑者')
      expect((await patch({ archived: true })).status).toBe(200)
      seedTeammates(db, join(dir, 'teammates'))
      expect(listConversations(db)).toHaveLength(0)
      const roster = await (await app.request('/api/bot-management')).json()
      expect(roster[0].archived).toBe(1)
      expect((await patch({ archived: false })).status).toBe(200)
      expect(listConversations(db)[0]?.last_message?.content).toBe('history')
      expect(readFileSync(join(dir, 'project', 'proof'), 'utf8')).toBe('keep')
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
  })
  it('does not allow archiving the active coordinator', async () => {
    const db = openDb(':memory:')
    const dir = mkdtempSync(join(tmpdir(), 'ogb-chief-'))
    try {
      mkdirSync(join(dir, 'chief'))
      writeFileSync(join(dir, 'chief', 'SOUL.md'), '# Chief')
      seedTeammates(db, dir)
      const { app } = createApp({ db, dataDir: dir, llm: { chat: async () => { throw Error('unused') } } })
      const r = await app.request('/api/bot-management/chief', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true }) })
      expect(r.status).toBe(409)
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
  })
})
