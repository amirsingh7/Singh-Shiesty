import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeFakeSupabase } from './fakeSupabase'

let fake: ReturnType<typeof makeFakeSupabase>

vi.mock('@/lib/auth/supabaseBrowser', () => ({
  supabaseBrowser: () => fake,
}))

describe('cross-device sync per-user isolation (lib/sync.ts)', () => {
  beforeEach(async () => {
    fake = makeFakeSupabase()
    vi.resetModules()
  })

  it('syncSave stamps user_id and conflicts on (user_id, tile_id), not tile_id alone', async () => {
    const { syncSave } = await import('@/lib/sync')
    await syncSave('user-a-uuid', 'profile', { name: 'A' }, new Date().toISOString())

    const upsert = fake.calls.find((c) => c.method === 'tile_data.upsert')
    const [payload, opts] = upsert!.args as [Record<string, unknown>, { onConflict: string }]
    expect(payload.user_id).toBe('user-a-uuid')
    expect(payload.tile_id).toBe('profile')
    expect(opts.onConflict).toBe('user_id,tile_id')
  })

  it('syncLoad filters by user_id — the old bare-tile_id-only lookup would leak across accounts', async () => {
    const { syncLoad } = await import('@/lib/sync')
    await syncLoad('user-a-uuid', 'profile')

    const eqCalls = fake.calls.filter((c) => c.method === 'tile_data.eq')
    const filtered = Object.fromEntries(eqCalls.map((c) => c.args as [string, unknown]))
    expect(filtered.user_id).toBe('user-a-uuid')
    expect(filtered.tile_id).toBe('profile')
  })

  it('syncLoadTiles scopes the tiles table read to one user_id', async () => {
    const { syncLoadTiles } = await import('@/lib/sync')
    await syncLoadTiles('user-a-uuid')

    const eqCalls = fake.calls.filter((c) => c.method === 'tiles.eq')
    expect(eqCalls.some((c) => c.args[0] === 'user_id' && c.args[1] === 'user-a-uuid')).toBe(true)
  })

  it('syncWipe only deletes the calling user_id\'s own rows, never an unfiltered wipe', async () => {
    const { syncWipe } = await import('@/lib/sync')
    await syncWipe('user-a-uuid')

    const tileDataEq = fake.calls.filter((c) => c.method === 'tile_data.eq')
    const tilesEq = fake.calls.filter((c) => c.method === 'tiles.eq')
    expect(tileDataEq.some((c) => c.args[0] === 'user_id' && c.args[1] === 'user-a-uuid')).toBe(true)
    expect(tilesEq.some((c) => c.args[0] === 'user_id' && c.args[1] === 'user-a-uuid')).toBe(true)
  })
})
