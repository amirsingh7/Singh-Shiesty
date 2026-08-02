import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeFakeSupabase } from './fakeSupabase'

let fake: ReturnType<typeof makeFakeSupabase>

vi.mock('@/lib/auth/supabaseBrowser', () => ({
  supabaseBrowser: () => fake,
}))

describe('tileStore per-user isolation (lib/tiles/tileStore.ts)', () => {
  beforeEach(async () => {
    fake = makeFakeSupabase()
    vi.resetModules()
  })

  it('saveData stamps the real user_id and a per-user tile_id, never a shared key', async () => {
    const { tileStore } = await import('@/lib/tiles/tileStore')
    await tileStore.saveData('user-a-uuid', 'train', [{ w: 100, r: 5 }])

    const upsert = fake.calls.find((c) => c.method === 'tile_data.upsert')
    expect(upsert).toBeTruthy()
    const [payload, opts] = upsert!.args as [Record<string, unknown>, { onConflict: string }]
    expect(payload.user_id).toBe('user-a-uuid')
    expect(payload.tile_id).toBe('user-a-uuid:train')
    expect(opts.onConflict).toBe('user_id,tile_id')
  })

  it('two different users saving the same tile id never collide on the same key', async () => {
    const { tileStore } = await import('@/lib/tiles/tileStore')
    await tileStore.saveData('user-a-uuid', 'train', [])
    await tileStore.saveData('user-b-uuid', 'train', [])

    const upserts = fake.calls.filter((c) => c.method === 'tile_data.upsert')
    const keys = upserts.map((c) => (c.args[0] as Record<string, unknown>).tile_id)
    expect(new Set(keys).size).toBe(2)
    expect(keys).toContain('user-a-uuid:train')
    expect(keys).toContain('user-b-uuid:train')
  })

  it('loadData filters by BOTH user_id and the per-user tile_id', async () => {
    const { tileStore } = await import('@/lib/tiles/tileStore')
    await tileStore.loadData('user-a-uuid', 'fuel')

    const eqCalls = fake.calls.filter((c) => c.method === 'tile_data.eq')
    const filtered = Object.fromEntries(eqCalls.map((c) => c.args as [string, unknown]))
    expect(filtered.user_id).toBe('user-a-uuid')
    expect(filtered.tile_id).toBe('user-a-uuid:fuel')
  })

  it('clearData filters the delete by user_id, not just tile_id', async () => {
    const { tileStore } = await import('@/lib/tiles/tileStore')
    await tileStore.clearData('user-a-uuid', 'vitals')

    expect(fake.calls.some((c) => c.method === 'tile_data.delete')).toBe(true)
    const eqCalls = fake.calls.filter((c) => c.method === 'tile_data.eq')
    const filtered = Object.fromEntries(eqCalls.map((c) => c.args as [string, unknown]))
    expect(filtered.user_id).toBe('user-a-uuid')
  })
})
