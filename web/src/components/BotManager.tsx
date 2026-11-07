import { useEffect, useState } from 'react'

type ManagedBot = { id: string; name: string; role: string; emoji: string; soul: string; archived: number; isChief: boolean }
export function BotManager({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [bots, setBots] = useState<ManagedBot[]>([])
  const [draft, setDraft] = useState<ManagedBot | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function load() {
    const r = await fetch('/api/bot-management')
    if (!r.ok) throw new Error('无法读取 bot 列表，请检查登录状态。')
    setBots(await r.json())
  }
  useEffect(() => { load().catch((e) => setError(String(e))) }, [])
  async function save(bot: ManagedBot, changes: object) {
    setBusy(true); setError('')
    try {
      const r = await fetch(`/api/bot-management/${encodeURIComponent(bot.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) })
      if (!r.ok) throw new Error((await r.json()).error || '操作失败')
      await load(); setDraft(null); onChanged()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  return <div className="modal-scrim"><section className="modal" style={{ width: 'min(850px, 95vw)', maxHeight: '90vh', overflowY: 'auto' }} role="dialog" aria-label="管理 bot">
    <div className="modal-title">管理 bot <button onClick={onClose} disabled={busy} style={{ float: 'right' }}>关闭</button></div>
    <p>归档保留历史、记忆和项目文件，暂停派工与定时任务；恢复后重新启用原定时任务。正在执行任务的 bot 请先停止再操作。</p>
    {error && <p role="alert" style={{ color: '#f99' }}>{error}</p>}
    {draft ? <form onSubmit={(e) => { e.preventDefault(); void save(draft, { name: draft.name, role: draft.role, emoji: draft.emoji, soul: draft.soul }) }}>
      <p>ID：{draft.id}（不可更改）</p>
      {(['name', 'emoji', 'role'] as const).map((k) => <label key={k} style={{ display: 'block', margin: '10px 0' }}>{({ name: '名称', emoji: '头像 emoji', role: '职责简介' })[k]}<input style={{ display: 'block', width: '100%' }} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} required={k === 'name'} /></label>)}
      <label>角色说明（Markdown；名称与简介以上方字段为准）<textarea style={{ width: '100%', minHeight: 260 }} value={draft.soul} onChange={(e) => setDraft({ ...draft, soul: e.target.value })} /></label>
      <button disabled={busy} type="submit">保存</button> <button disabled={busy} type="button" onClick={() => setDraft(null)}>取消</button>
    </form> : bots.map((bot) => <div key={bot.id} style={{ borderBottom: '1px solid #444', padding: '12px 0' }}>
      <strong>{bot.emoji} {bot.name}</strong> <small>{bot.id} · {bot.archived ? '已归档' : '使用中'}{bot.isChief ? ' · 团队协调者' : ''}</small>
      <p>{bot.role}</p>
      <button disabled={busy} onClick={() => setDraft({ ...bot })}>编辑</button>{' '}
      <button disabled={busy || (bot.isChief && !bot.archived)} onClick={() => {
        if (window.confirm(bot.archived ? `恢复 ${bot.name}？原启用的定时任务也会恢复。` : `归档 ${bot.name}？保留所有历史和文件，不再接受新任务。`)) void save(bot, { archived: !bot.archived })
      }}>{bot.archived ? '恢复' : '归档'}</button>
    </div>)}
  </section></div>
}
