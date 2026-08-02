'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/auth/supabaseBrowser'

/**
 * Optional cross-device sync for tile data.
 *
 * The base is zero-backend by default: a tile's `Vitality.save()` data lives in
 * the browser (localStorage). If the forker adds their OWN Supabase project (two
 * public keys in Vercel), tile data is ALSO written to a single `tile_data` table
 * — so opening the same site on another device (their phone) loads the same data.
 *
 * Every row is scoped to the signed-in user (`user_id`, enforced by RLS —
 * `auth.uid() = user_id`) so this same table safely holds many users' data.
 * `userId` here is the authenticated session's real id, never a placeholder —
 * callers get it from useSession()/the Dashboard's userId prop. If the keys
 * are absent, everything here no-ops and the app stays purely local.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/** Whether cross-device sync is configured (both public keys present). */
export const syncEnabled = (): boolean => !!(url && anonKey)

function syncClient(): SupabaseClient | null {
  return supabaseBrowser()
}

/** Push a tile's data to the owner's Supabase. Best-effort; returns false on any failure. */
export async function syncSave(userId: string, tileId: string, data: unknown, isoNow: string): Promise<boolean> {
  const c = syncClient()
  if (!c) return false
  try {
    const { error } = await c
      .from('tile_data')
      .upsert({ user_id: userId, tile_id: tileId, data, updated_at: isoNow }, { onConflict: 'user_id,tile_id' })
    return !error
  } catch {
    return false
  }
}

/** Read a tile's data from Supabase, or null if unconfigured / missing / offline. */
export async function syncLoad(userId: string, tileId: string): Promise<unknown | null> {
  const c = syncClient()
  if (!c) return null
  try {
    const { data, error } = await c
      .from('tile_data')
      .select('data')
      .eq('user_id', userId)
      .eq('tile_id', tileId)
      .maybeSingle()
    if (error) return null
    return data?.data ?? null
  } catch {
    return null
  }
}

/** A tile document stored in the owner's Supabase (built from Claude via the MCP connector). */
export interface RemoteTile {
  html: string
  name: string | null
}

/**
 * Read every MCP-built tile from the owner's Supabase, keyed by slot. Returns an
 * empty object if sync is unconfigured / offline. The dashboard prefers these over
 * the static public/tiles files, so a tile made from Claude — on the laptop or the
 * phone — appears without a redeploy. Requires the `tiles` table (supabase/tiles.sql).
 */
export async function syncLoadTiles(userId: string): Promise<Record<string, RemoteTile>> {
  const c = syncClient()
  if (!c) return {}
  try {
    const { data, error } = await c.from('tiles').select('slot, html, name').eq('user_id', userId)
    if (error || !data) return {}
    const map: Record<string, RemoteTile> = {}
    for (const row of data as Array<{ slot: string; html: string; name: string | null }>) {
      if (row.slot && typeof row.html === 'string' && row.html.trim()) {
        map[row.slot] = { html: row.html, name: row.name ?? null }
      }
    }
    return map
  } catch {
    return {}
  }
}

/**
 * Write a tile into the owner's Supabase `tiles` table (the "+ New tile" button /
 * paste box). Same store the MCP connector writes to, so a tile made in the browser
 * and one made from Claude land in the same place. Returns false if unconfigured or
 * the write fails (e.g. tiles.sql not run yet).
 */
export async function syncSaveTile(userId: string, slot: string, html: string, name?: string): Promise<boolean> {
  const c = syncClient()
  if (!c) return false
  try {
    const { error } = await c
      .from('tiles')
      .upsert(
        { user_id: userId, slot, html, name: name ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,slot' },
      )
    return !error
  } catch {
    return false
  }
}

/**
 * Wipe the owner's cloud data — every tile's saved data AND every tile they built
 * (the connector / "+ New tile" store). Used by the dashboard's Reset button. No-op
 * if sync is unconfigured. Best-effort; never throws.
 */
export async function syncWipe(userId: string): Promise<void> {
  const c = syncClient()
  if (!c) return
  try {
    await c.from('tile_data').delete().eq('user_id', userId)
    await c.from('tiles').delete().eq('user_id', userId)
  } catch {
    /* best-effort */
  }
}
