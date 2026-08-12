'use client'

import { useEffect, useRef, useState } from 'react'
import { CORE_TILES, type CoreTileId } from '@/lib/tiles/coreTiles'
import { useTileHost } from '@/lib/tiles/useTileHost'
import { withBridge } from '@/lib/tiles/tileBridge'
import { initVeeTiles } from '@/components/veeTilesAnim'
import '@/components/veeTiles.css'

/**
 * The public equation-board view: the same tile visuals as the owner's real
 * dashboard (app/app/DashboardGrid.tsx), trimmed to the three tiles that make
 * sense for a stranger to see (Train, Velocity, Symphony) and — deliberately —
 * never touching the owner's real data.
 *
 * A visitor's browser here has no Supabase session, so useTileHost's
 * save/load calls run with auth.uid() = null. RLS (`auth.uid() = user_id`)
 * already blocks both directions for ANY userId, including the owner's real
 * one — but a fixed, obviously-fake id is used anyway as a second, explicit
 * guarantee that this view can never address the owner's row even if RLS
 * were ever loosened. Every open tile therefore renders its own baked-in
 * placeholder state (the same "demo numbers" a fresh, never-saved tile shows
 * anyone), never a real save landing anywhere.
 */
const BOARD_USER_ID = 'public-board-demo'
const BOARD_TILE_IDS: CoreTileId[] = ['train', 'velocity', 'symphony']

type FilledMap = Partial<Record<CoreTileId, string>>

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
            <span aria-hidden="true">←</span> Board
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
  const { register, unregister } = useTileHost(BOARD_USER_ID)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const pairs = await Promise.all(
        BOARD_TILE_IDS.map(async (id) => {
          try {
            const res = await fetch(`/tiles/${id}.html`, { cache: 'no-store' })
            if (!res.ok) return null
            const html = await res.text()
            return html.trim() ? ([id, html] as const) : null
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
