'use client'

import { useCallback, useEffect, useRef } from 'react'
import { tileStore } from './tileStore'

/**
 * useTileHost is the host side of the Vitality bridge, fixed for MANY tiles.
 *
 * The bug it fixes: the BUILD71 host closed a single storage key over one
 * message listener, so ANY tile's save overwrote whatever the host last
 * pointed at. Render two tiles and they clobber each other.
 *
 * The fix: keep a live Window to tileId map keyed by each iframe's
 * contentWindow. That WindowProxy is a stable reference and it equals
 * event.source for messages that frame posts, so every save/load is routed to
 * the tile whose window actually sent it. N tiles on one page each resolve to
 * their own key. No clobber.
 *
 * register(win, tileId) is called from each iframe instance (see TilePreview),
 * which captures its own tileId, so a late onLoad can never bind a window to
 * the wrong tile. unregister(win) drops a window when its iframe unmounts.
 *
 * The map is reset whenever userId changes, so a stale window mapping from a
 * previous user can never route one user's data into another's namespace.
 */
export function useTileHost(
  userId: string,
  onActivity?: (info: { tileId: string; type: 'save' | 'load' | 'report'; count: number }) => void,
  /**
   * Injected handler for a tile's Vitality.report() stream (one numeric life-stream
   * into Vee). Passed in (not imported) so this hook stays decoupled from the
   * server action; the create page wires reportStream here. The host only routes
   * and forwards; the server action validates + RLS-writes.
   */
  onReport?: (stream: unknown, tileId: string) => void,
) {
  const reg = useRef<WeakMap<Window, string>>(new WeakMap())
  // Count of saveData() calls currently in flight (any tile). The actual
  // Supabase write happens HERE, in the host's own top-level window — a
  // sealed tile can't reach the network itself — so this is the one place
  // that can tell whether closing the tab right now would kill a write
  // mid-flight (see the beforeunload guard below).
  const pendingSaves = useRef(0)

  // reset the map synchronously when the user changes (before any new register)
  const lastUser = useRef(userId)
  if (lastUser.current !== userId) {
    reg.current = new WeakMap()
    lastUser.current = userId
  }

  const activity = useRef(onActivity)
  activity.current = onActivity

  const report = useRef(onReport)
  report.current = onReport

  const register = useCallback((win: Window | null, tileId: string) => {
    if (win) reg.current.set(win, tileId)
  }, [])

  const unregister = useCallback((win: Window | null) => {
    if (win) reg.current.delete(win)
  }, [])

  useEffect(() => {
    async function onMessage(e: MessageEvent) {
      const msg = e.data
      if (!msg || msg.source !== 'vitality-tile') return
      const src = e.source as Window | null
      if (!src) return

      // TikTok follower lookup — the host fetches on the sealed tile's behalf,
      // since tiles can't reach the network themselves. Keyless + public
      // (tikwm), returns only a follower COUNT, touches no user storage, so it
      // needs no tileId and runs before the registry gate. This is the demo's
      // zero-setup live-data door — no MCP connector, no /sweep required.
      if (msg.type === 'tiktok') {
        const handle = String(msg.handle || '').replace(/^@+/, '').trim()
        if (!handle) {
          src.postMessage({ source: 'vitality-host', type: 'tiktok:error', id: msg.id, reason: 'no_handle' }, '*')
          return
        }
        try {
          const r = await fetch('https://www.tikwm.com/api/user/info?unique_id=' + encodeURIComponent(handle))
          const j = await r.json()
          const count = j?.data?.stats?.followerCount
          if (typeof count === 'number' && count >= 0) {
            src.postMessage({ source: 'vitality-host', type: 'tiktok:result', id: msg.id, count }, '*')
          } else {
            src.postMessage({ source: 'vitality-host', type: 'tiktok:error', id: msg.id, reason: String(j?.msg || 'no_data') }, '*')
          }
        } catch {
          src.postMessage({ source: 'vitality-host', type: 'tiktok:error', id: msg.id, reason: 'fetch_failed' }, '*')
        }
        return
      }

      // YouTube subscribers — routed through /api/youtube/subs so the API key
      // stays server-side (YouTube is keyed, unlike TikTok). no_key → the tile
      // tells the user to add a free key.
      if (msg.type === 'youtube') {
        const handle = String(msg.handle || '').replace(/^@+/, '').trim()
        if (!handle) {
          src.postMessage({ source: 'vitality-host', type: 'youtube:error', id: msg.id, reason: 'no_handle' }, '*')
          return
        }
        try {
          const r = await fetch('/api/youtube/subs?handle=' + encodeURIComponent(handle))
          const j = await r.json()
          if (typeof j?.count === 'number') {
            src.postMessage({ source: 'vitality-host', type: 'youtube:result', id: msg.id, count: j.count }, '*')
          } else {
            src.postMessage({ source: 'vitality-host', type: 'youtube:error', id: msg.id, reason: String(j?.error || 'no_data') }, '*')
          }
        } catch {
          src.postMessage({ source: 'vitality-host', type: 'youtube:error', id: msg.id, reason: 'fetch_failed' }, '*')
        }
        return
      }

      // Stock price — routed through /api/finance/quote so the Finnhub key stays
      // server-side. Returns the latest price for one symbol.
      if (msg.type === 'stock') {
        const symbol = String(msg.symbol || '').toUpperCase().replace(/[^A-Z0-9.:\-]/g, '').trim()
        if (!symbol) {
          src.postMessage({ source: 'vitality-host', type: 'stock:error', id: msg.id, reason: 'no_symbol' }, '*')
          return
        }
        try {
          const r = await fetch('/api/finance/quote?symbol=' + encodeURIComponent(symbol))
          const j = await r.json()
          if (typeof j?.price === 'number') {
            src.postMessage({ source: 'vitality-host', type: 'stock:result', id: msg.id, price: j.price }, '*')
          } else {
            src.postMessage({ source: 'vitality-host', type: 'stock:error', id: msg.id, reason: String(j?.error || 'no_data') }, '*')
          }
        } catch {
          src.postMessage({ source: 'vitality-host', type: 'stock:error', id: msg.id, reason: 'fetch_failed' }, '*')
        }
        return
      }

      // Spotify — the tile has no network (opaque-origin sandboxed iframe), so
      // both OAuth and every playback call are proxied through the host, same
      // shape as tiktok/youtube/stock above.
      //
      // 'connect' is different from a normal proxy call: it has no `id` (the
      // tile sent it one-way, see tileBridge.ts) because completing an OAuth
      // login can take as long as the user takes on Spotify's site — far
      // longer than the bridge's 8s call() timeout. The host opens the OAuth
      // popup itself (only a real, non-sandboxed window can), polls for it to
      // close, then pushes an unsolicited `spotify:connected` message back
      // into the SAME tile window that asked (`src`, captured from this very
      // message event) so the tile knows to re-check its status.
      if (msg.type === 'spotify') {
        if (msg.action === 'connect') {
          const popup = window.open('/api/spotify/authorize', 'spotify-connect', 'width=480,height=720')
          if (!popup) return
          const iv = setInterval(() => {
            if (popup.closed) {
              clearInterval(iv)
              src.postMessage({ source: 'vitality-host', type: 'spotify:connected' }, '*')
            }
          }, 500)
          return
        }
        const { source: _s, type: _t, id, action, ...extra } = msg
        try {
          const r = await fetch('/api/spotify/player', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...extra }),
          })
          const j = await r.json()
          if (r.ok) {
            src.postMessage({ source: 'vitality-host', type: 'spotify:result', id: msg.id, data: j }, '*')
          } else {
            src.postMessage({ source: 'vitality-host', type: 'spotify:error', id: msg.id, reason: String(j?.error || 'spotify_failed') }, '*')
          }
        } catch {
          src.postMessage({ source: 'vitality-host', type: 'spotify:error', id: msg.id, reason: 'fetch_failed' }, '*')
        }
        return
      }

      // Cross-tile READ — the host hands a tile another slot's saved data so
      // tiles can react to each other client-side (e.g. Peak reshaping from the
      // Vitals recovery) with no /sweep and no connector. Read-only, the user's
      // OWN data, and whitelisted to the data slots (never 'vee' or internals).
      if (msg.type === 'read') {
        const slot = String(msg.slot || '')
        const READABLE = ['train', 'fuel', 'vitals', 'brand', 'peak', 'finance']
        if (!READABLE.includes(slot)) {
          src.postMessage({ source: 'vitality-host', type: 'read:error', id: msg.id, reason: 'slot_not_allowed' }, '*')
          return
        }
        const data = await tileStore.loadData(userId, slot)
        src.postMessage({ source: 'vitality-host', type: 'read:result', id: msg.id, data }, '*')
        return
      }

      // Cross-tile WRITE — a narrow, deliberate expansion of the sealed-tile
      // model (previously read-only). Velocity's "delete this day" needs to
      // mutate Train's saved split store. Scoped to WRITABLE only — never a
      // general capability. Always read-merge-write: Train's saved object
      // holds several keys in one blob (the split, the unit pref, per-lift
      // overload caches), so a blind overwrite here would silently wipe
      // whatever key the caller didn't send.
      if (msg.type === 'write') {
        const slot = String(msg.slot || '')
        const WRITABLE = ['train']
        if (!WRITABLE.includes(slot)) {
          src.postMessage({ source: 'vitality-host', type: 'write:error', id: msg.id, reason: 'slot_not_allowed' }, '*')
          return
        }
        const key = typeof msg.key === 'string' ? msg.key : ''
        if (!key) {
          src.postMessage({ source: 'vitality-host', type: 'write:error', id: msg.id, reason: 'no_key' }, '*')
          return
        }
        const current = await tileStore.loadData(userId, slot)
        const merged: Record<string, unknown> =
          current && typeof current === 'object' && !Array.isArray(current) ? { ...(current as Record<string, unknown>) } : {}
        merged[key] = msg.value
        pendingSaves.current++
        let result
        try {
          result = await tileStore.saveData(userId, slot, merged)
        } finally {
          pendingSaves.current--
        }
        if (!result.ok) {
          src.postMessage({ source: 'vitality-host', type: 'write:error', id: msg.id, reason: result.reason || 'unknown' }, '*')
          return
        }
        src.postMessage({ source: 'vitality-host', type: 'write:ok', id: msg.id }, '*')
        activity.current?.({ tileId: slot, type: 'save', count: 0 })
        return
      }

      const tileId = reg.current.get(src)
      if (!tileId) {
        // Sender is not in our registry (a race, or the registry was reset while
        // a tile was open). Still settle any id-bearing request so the tile's
        // `await window.Vitality.save/load(...)` can never hang forever.
        if (msg.id && msg.type === 'save') {
          src.postMessage({ source: 'vitality-host', type: 'save:error', id: msg.id, reason: 'unregistered_sender' }, '*')
        } else if (msg.id && msg.type === 'load') {
          src.postMessage({ source: 'vitality-host', type: 'load:result', id: msg.id, data: [] }, '*')
        }
        return
      }

      if (msg.type === 'save') {
        pendingSaves.current++
        let result
        try {
          result = await tileStore.saveData(userId, tileId, msg.data)
        } finally {
          pendingSaves.current--
        }
        if (!result.ok) {
          // the write was dropped — could be the per-tile cap, a storage quota,
          // or (if a Supabase project is configured) the tile_data table not
          // existing yet. Forward the REAL reason instead of one guessed string,
          // so a tile's error state can actually say what's wrong.
          src.postMessage({ source: 'vitality-host', type: 'save:error', id: msg.id, reason: result.reason || 'unknown' }, '*')
          return
        }
        // ack success so a tile's `await window.Vitality.save(...)` resolves truthfully
        // (tileStore.saveData already wrote through to Supabase above, when configured)
        src.postMessage({ source: 'vitality-host', type: 'save:ok', id: msg.id }, '*')
        const count = Array.isArray(msg.data) ? msg.data.length : 0
        activity.current?.({ tileId, type: 'save', count })
        return
      }

      if (msg.type === 'load') {
        // tileStore.loadData already reads from Supabase (when configured) so a
        // fresh device — the phone — gets the real data; falls back to this
        // browser's local copy otherwise.
        const data = await tileStore.loadData(userId, tileId)
        // reply to the exact sender, never a broadcast. targetOrigin stays '*'
        // because a sealed srcDoc tile has an opaque (null) origin; the sender
        // is already verified via the registered e.source, and the payload is
        // the tile's own data going back to it.
        src.postMessage({ source: 'vitality-host', type: 'load:result', id: msg.id, data }, '*')
        const count = Array.isArray(data) ? data.length : 0
        activity.current?.({ tileId, type: 'load', count })
        return
      }

      if (msg.type === 'report') {
        // One numeric life-stream into Vee. The host only forwards the raw stream
        // plus the SENDER's tileId (from our own registry, never the iframe's
        // claim) so the stream's per-tile identity is trustworthy; the injected
        // handler (the server action) validates it and RLS-writes it under the
        // session user. Fire-and-forget: a tile never blocks on Vee.
        report.current?.(msg.stream, tileId)
        activity.current?.({ tileId, type: 'report', count: 1 })
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [userId])

  // Closing the tab/app while a tile's save is still writing to Supabase kills
  // that request mid-flight with no error surfaced anywhere — the tile that
  // triggered it (and the user) is already gone. The save path already
  // retries and force-flushes on backgrounding (see train.html's __flush),
  // but nothing stops the user from leaving before that flush lands. This is
  // the backstop: browsers show a native "leave site?" prompt only while
  // pendingSaves is actually nonzero, so the vast majority of navigations
  // (nothing in flight) are completely unaffected.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (pendingSaves.current > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  return { register, unregister }
}
