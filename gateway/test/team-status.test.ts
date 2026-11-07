import { describe, expect, it } from 'vitest'
import { buildTools } from '../src/tools.js'

describe('team status tool visibility', () => {
  const names = (opts: Parameters<typeof buildTools>[0]) => buildTools(opts).map((t) => t.function.name)
  it('is opt-in and needs no computer or shell', () => {
    expect(names({ hasComputer: false })).not.toContain('get_team_status')
    expect(names({ hasComputer: false, hasTeamStatus: true })).toContain('get_team_status')
  })
  it('remains available in read-only watch routines', () => {
    expect(names({ hasComputer: false, hasTeamStatus: true, watch: true })).toContain('get_team_status')
  })
})
