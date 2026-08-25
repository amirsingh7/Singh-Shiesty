'use client'

import { cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CORE_TILES, type CoreTileId } from '@/lib/tiles/coreTiles'
import { withBridge } from '@/lib/tiles/tileBridge'
import { initVeeTiles } from '@/components/veeTilesAnim'
import '@/components/veeTiles.css'

/**
 * The public equation-board view: the same tile visuals as the owner's real
 * dashboard (app/app/DashboardGrid.tsx), trimmed to the three tiles that make
 * sense for a stranger to see (Train, Velocity, Symphony).
 *
 * Deliberately does NOT use the shared useTileHost/tileStore path at all —
 * load/save/read/write here are answered locally, in this file, and never
 * reach Supabase. That's stronger than relying on RLS alone (which already
 * blocks an anonymous visitor from reading/writing any user's row): it means
 * this view makes zero database calls for tile data, period, so there is no
 * live path back to the owner's real account no matter how the backend
 * changes later. Velocity reads Train's history to chart compound-lift
 * progress (window.Vitality.read('train')) — real accounts have no history
 * here, so it's handed a small built-in sample split instead of an empty
 * result, so the tile shows something worth looking at rather than its
 * "log a session in Train first" dead end. tiktok/youtube/stock don't apply
 * to these three tiles, so they're not wired up. Spotify IS real — but it's
 * the VISITOR's own account, not the profile owner's: 'connect' opens
 * /api/spotify/authorize?board=1, which routes through the board branch of
 * callback/route.ts and hands back a cookie scoped to that browser
 * (app/api/spotify/shared.ts), never Supabase, never any Vitality account.
 * Every other action proxies to /api/spotify/board/player, the cookie-only
 * sibling of the owner's ../../player route — so "Connect Spotify" here is a
 * genuine try-it-yourself demo, safe for a stranger clicking in from a shared
 * link, with zero path back to the owner's real Spotify. Mentor chat, by
 * contrast, is answered locally (see MENTOR_DEMO_REPLY below) rather than
 * given the same per-visitor treatment — Gobind's context is the owner's
 * data/goals, which a visitor's own session has no equivalent of.
 */
const BOARD_TILE_IDS: CoreTileId[] = ['train', 'velocity', 'symphony']

const MOCK_TRAIN_DATA = {
  'vitality.logger.unit': 'kg',
  'vitality.logger.v4': JSON.stringify({
    days: [
      {
        name: 'Day 1',
        lifts: [
          {
            id: 'squat',
            name: 'Squat',
            tier: 1,
            history: [
              { w: 100, r: 5, sets: 3, date: '2026-03-02' },
              { w: 102.5, r: 5, sets: 3, date: '2026-03-30' },
              { w: 107.5, r: 5, sets: 3, date: '2026-04-27' },
              { w: 112.5, r: 5, sets: 3, date: '2026-05-25' },
              { w: 117.5, r: 5, sets: 3, date: '2026-06-22' },
              { w: 122.5, r: 3, sets: 3, date: '2026-07-20' },
              { w: 130, r: 1, sets: 1, date: '2026-08-10' },
            ],
          },
          {
            id: 'bench',
            name: 'Bench Press',
            tier: 1,
            history: [
              { w: 65, r: 5, sets: 3, date: '2026-03-02' },
              { w: 67.5, r: 5, sets: 3, date: '2026-03-30' },
              { w: 70, r: 5, sets: 3, date: '2026-04-27' },
              { w: 72.5, r: 5, sets: 3, date: '2026-05-25' },
              { w: 75, r: 5, sets: 3, date: '2026-06-22' },
              { w: 77.5, r: 3, sets: 3, date: '2026-07-20' },
              { w: 82.5, r: 1, sets: 1, date: '2026-08-10' },
            ],
          },
          {
            id: 'deadlift',
            name: 'Deadlift',
            tier: 1,
            history: [
              { w: 130, r: 5, sets: 3, date: '2026-03-02' },
              { w: 135, r: 5, sets: 3, date: '2026-03-30' },
              { w: 140, r: 5, sets: 3, date: '2026-04-27' },
              { w: 145, r: 3, sets: 3, date: '2026-05-25' },
              { w: 150, r: 3, sets: 3, date: '2026-06-22' },
              { w: 157.5, r: 2, sets: 3, date: '2026-07-20' },
              { w: 167.5, r: 1, sets: 1, date: '2026-08-10' },
            ],
          },
        ],
      },
    ],
  }),
}

/** Per-tile CSS injected only into the public board's copy of that tile's
 *  HTML (never touches public/tiles/*.html itself, so the owner's real
 *  dashboard is unaffected). Velocity's "Style this chat box" panel lets the
 *  OWNER restyle their own chat box and persist it — meaningless for a
 *  visitor on a demo tile, so it's hidden here. */
const BOARD_TILE_CSS_OVERRIDES: Partial<Record<CoreTileId, string>> = {
  velocity: '#coachStyleBtn,#coachPanel{display:none!important}',
}

function applyBoardOverrides(id: CoreTileId, html: string): string {
  const css = BOARD_TILE_CSS_OVERRIDES[id]
  if (!css) return html
  const tag = `<style>${css}</style>`
  return html.includes('</head>') ? html.replace('</head>', `${tag}</head>`) : tag + html
}

type FilledMap = Partial<Record<CoreTileId, string>>

/** Gobind can't actually chat for an anonymous visitor — the real endpoint
 *  requires the owner's own signed-in session, and forwarding to it just
 *  surfaces a raw "Sign in to chat with Gobind" error in the tile, which
 *  looks broken to a stranger clicking in from a shared link (e.g. LinkedIn).
 *  So, like Train's MOCK_TRAIN_DATA above, mentor chat on the public board
 *  is answered locally with a fixed demo reply — no network call, no auth
 *  error ever reaches the tile. */
const MENTOR_DEMO_REPLY =
  "This is a shared, read-only view of the board — Gobind's live chat only runs for the account owner. Everything else here is real."

async function proxyNetworkMessage(msg: { type: string; id?: string; [k: string]: unknown }, src: Window) {
  if (msg.type === 'mentor') {
    const message = String(msg.message || '').slice(0, 2000)
    if (!message) {
      src.postMessage({ source: 'vitality-host', type: 'mentor:error', id: msg.id, reason: 'no_message' }, '*')
      return
    }
    src.postMessage(
      { source: 'vitality-host', type: 'mentor:result', id: msg.id, data: { reply: MENTOR_DEMO_REPLY, mood: 'neutral' } },
      '*',
    )
    return
  }

  if (msg.type === 'spotify') {
    if (msg.action === 'connect') {
      // ?board=1 tells /api/spotify/authorize + callback to skip Supabase
      // entirely and hand back a cookie scoped to THIS visitor's browser
      // (see app/api/spotify/shared.ts) — so anyone opening the public board
      // can try Symphony with their own Spotify, not the profile owner's.
      // Same popup+poll pattern as the real dashboard's host
      // (lib/tiles/useTileHost.ts) — a sandboxed tile iframe can't open one.
      // ?return= is this page's own URL — on mobile, window.open() routinely
      // becomes a plain tab that script can't close, so the callback falls
      // back to redirecting that tab back here once connected (see
      // app/api/spotify/callback/route.ts), rather than stranding the
      // visitor on a blank "connected" page with the poll below never firing.
      // view=board&open=symphony (read by ViewTabs.tsx / this component) put
      // that redirect back on the Tiles tab with Symphony reopened, instead
      // of the default Profile tab with the board (and the tile the visitor
      // was just using) closed.
      const returnParams = new URLSearchParams(window.location.search)
      returnParams.set('view', 'board')
      returnParams.set('open', 'symphony')
      const returnTo = encodeURIComponent(`${window.location.pathname}?${returnParams.toString()}`)
      const popup = window.open(`/api/spotify/authorize?board=1&return=${returnTo}`, 'spotify-connect', 'width=480,height=720')
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
      const r = await fetch('/api/spotify/board/player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const j = await r.json()
      if (r.ok) {
        src.postMessage({ source: 'vitality-host', type: 'spotify:result', id, data: j }, '*')
      } else {
        src.postMessage({ source: 'vitality-host', type: 'spotify:error', id, reason: String(j?.error || 'spotify_failed') }, '*')
      }
    } catch {
      src.postMessage({ source: 'vitality-host', type: 'spotify:error', id: msg.id, reason: 'fetch_failed' }, '*')
    }
  }
}

/** The local, Supabase-free bridge host for the Board demo. */
function useBoardTileHost() {
  const reg = useRef<WeakMap<Window, CoreTileId>>(new WeakMap())

  const register = useCallback((win: Window | null, tileId: string) => {
    if (win) reg.current.set(win, tileId as CoreTileId)
  }, [])
  const unregister = useCallback((win: Window | null) => {
    if (win) reg.current.delete(win)
  }, [])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const msg = e.data
      if (!msg || msg.source !== 'vitality-tile') return
      const src = e.source as Window | null
      if (!src || !reg.current.has(src)) return

      if (msg.type === 'load') {
        src.postMessage({ source: 'vitality-host', type: 'load:result', id: msg.id, data: [] }, '*')
        return
      }
      if (msg.type === 'read') {
        const data = msg.slot === 'train' ? MOCK_TRAIN_DATA : null
        src.postMessage({ source: 'vitality-host', type: 'read:result', id: msg.id, data }, '*')
        return
      }
      if (msg.type === 'save') {
        src.postMessage({ source: 'vitality-host', type: 'save:error', id: msg.id, reason: 'demo_read_only' }, '*')
        return
      }
      if (msg.type === 'write') {
        src.postMessage({ source: 'vitality-host', type: 'write:error', id: msg.id, reason: 'demo_read_only' }, '*')
        return
      }
      if (msg.type === 'mentor' || msg.type === 'spotify') {
        proxyNetworkMessage(msg, src)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return { register, unregister }
}

function OpenTileOverlay({
  id,
  label,
  html,
  register,
  unregister,
  onClose,
}: {
  id: string
  label: string
  html: string
  register: (w: Window | null, id: string) => void
  unregister: (w: Window | null) => void
  onClose: () => void
}) {
  const winRef = useRef<Window | null>(null)
  return (
    <div className="openOverlay openFull" role="dialog" aria-modal="true" aria-label={label}>
      <div className="openCard">
        <div className="openTop">
          <button type="button" className="openBack" onClick={onClose}>
            <span aria-hidden="true">←</span> Tiles
          </button>
          <span className="openSlotName">{label}</span>
        </div>
        <div className="openStage">
          <iframe
            ref={(el) => {
              if (el) {
                winRef.current = el.contentWindow
                register(el.contentWindow, id)
              } else if (winRef.current) {
                unregister(winRef.current)
                winRef.current = null
              }
            }}
            onLoad={(e) => {
              winRef.current = e.currentTarget.contentWindow
              register(e.currentTarget.contentWindow, id)
            }}
            className="openFrame"
            srcDoc={withBridge(html)}
            sandbox="allow-scripts"
            title={label}
          />
        </div>
      </div>
    </div>
  )
}

export default function BoardView() {
  const ref = useRef<HTMLDivElement>(null)
  const [filled, setFilled] = useState<FilledMap>({})
  const [loaded, setLoaded] = useState(false)
  const [openId, setOpenId] = useState<CoreTileId | null>(null)
  const { register, unregister } = useBoardTileHost()
  const searchParams = useSearchParams()

  useEffect(() => {
    let alive = true
    ;(async () => {
      const pairs = await Promise.all(
        BOARD_TILE_IDS.map(async (id) => {
          try {
            const res = await fetch(`/tiles/${id}.html`, { cache: 'no-store' })
            if (!res.ok) return null
            const html = await res.text()
            return html.trim() ? ([id, applyBoardOverrides(id, html)] as const) : null
          } catch {
            return null
          }
        }),
      )
      if (!alive) return
      const map: FilledMap = {}
      for (const p of pairs) if (p) map[p[0]] = p[1]
      setFilled(map)
      setLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  // ?open=<tileId> — the Spotify connect flow's mobile redirect-back
  // (proxyNetworkMessage below / callback/route.ts) lands here wanting the
  // tile the visitor was using reopened, not the closed board they'd see by
  // default.
  useEffect(() => {
    if (!loaded) return
    const wanted = searchParams.get('open') as CoreTileId | null
    if (wanted && filled[wanted]) setOpenId(wanted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  useEffect(() => {
    if (!ref.current || !loaded) return
    return initVeeTiles(ref.current, { score: null, showNumber: false })
  }, [loaded, filled])

  useEffect(() => {
    if (!openId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId])

  const rowIds = BOARD_TILE_IDS.filter((id) => filled[id])

  return (
    <div className="veeTiles" ref={ref}>
      {loaded && rowIds.length === 0 && (
        <p style={{ color: 'var(--muted, #8a8f98)', fontSize: 13.5, textAlign: 'center', padding: '40px 0' }}>
          No board tiles installed yet.
        </p>
      )}

      <div
        style={{
          display: 'flex',
          gap: 16,
          overflowX: 'auto',
          paddingBottom: 14,
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0, #000 18px, #000 calc(100% - 64px), transparent 100%)',
          maskImage: 'linear-gradient(to right, transparent 0, #000 18px, #000 calc(100% - 64px), transparent 100%)',
          padding: '4px 18px 14px',
          margin: '0 -18px',
        }}
      >
        {rowIds.map((id) => {
          const core = CORE_TILES[id]
          return (
            <div key={id} style={{ flex: '0 0 auto' }}>
              <div
                data-orb={core.orb?.mode}
                data-roam={core.orb?.roam}
                data-pt={core.orb?.pt}
                className={`tile${core.variant ? ' ' + core.variant : ''}`}
                style={{ position: 'relative', width: 300, height: 340 }}
              >
                <div className="aurora" />
                {core.art}
                <span className="index">{core.index}</span>
                <span className="glyph">{core.glyph}</span>
                {/* the same large, faint centered glyph the real dashboard shows
                    behind each tile's title (app/app/DashboardGrid.tsx TileFace) */}
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: 52,
                    left: 0,
                    right: 0,
                    zIndex: 5,
                    display: 'flex',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    color: 'rgba(255,255,255,.22)',
                  }}
                >
                  {isValidElement(core.glyph)
                    ? cloneElement(core.glyph as React.ReactElement<{ width?: number; height?: number }>, { width: 44, height: 44 })
                    : null}
                </span>
                <div className="cap">
                  <span className="label">{core.label}</span>
                </div>
                <span className="arrow">→</span>
                <button
                  type="button"
                  className="hit"
                  aria-label={`Open ${core.label}`}
                  onClick={() => setOpenId(id)}
                />
              </div>
            </div>
          )
        })}
      </div>

      <p style={{ color: 'var(--muted, #8a8f98)', fontSize: 11.5, textAlign: 'center', marginTop: 4 }}>
        Sample board tiles — placeholder data only, not this account&apos;s real data.
      </p>

      {openId && filled[openId] && (
        <OpenTileOverlay
          key={openId}
          id={openId}
          label={CORE_TILES[openId].label}
          html={filled[openId]!}
          register={register}
          unregister={unregister}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}
