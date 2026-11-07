/** bot 转发 bot 的最大跳数：够一次分派 + 一次回话，再多就是回声。 */
export const MAX_HOPS = 2

export type A2ARules = { chiefId: string; pairs: [string, string][] }

/** 有向白名单；独立的 `*` 显式允许所有 bot（含以后新建的 bot）互通。默认仍关闭同级通信。 */
export function parseA2AAllow(spec: string, chiefId: string): A2ARules {
  const pairs: [string, string][] = []
  for (const item of spec.split(',')) {
    if (item.trim() === '*') {
      pairs.push(['*', '*'])
      continue
    }
    const [from, to] = item.split('>').map((s) => s.trim())
    if (from && to) pairs.push([from, to])
  }
  return { chiefId, pairs }
}

export function canMessage(rules: A2ARules, from: string, to: string): boolean {
  if (!from || !to || from === to) return false
  if (from === rules.chiefId || to === rules.chiefId) return true
  return rules.pairs.some(([a, b]) => (a === '*' && b === '*') || (a === from && b === to))
}

export function denyReason(rules: A2ARules, from: string, to: string): string {
  if (from === to) return 'You cannot message yourself.'
  return `Messaging ${to} is not allowlisted for you. Ask your operator to allow it, or route it through ${rules.chiefId}.`
}
