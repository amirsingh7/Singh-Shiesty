'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'
import GobindAvatar, { type GobindAvatarHandle, type GobindExpression } from '@/components/GobindAvatar'
import { CORE_TILES, type CoreTileId } from '@/lib/tiles/coreTiles'
import { tileStore } from '@/lib/tiles/tileStore'
import { useSession } from '@/lib/auth/AuthProvider'
import { syncEnabled } from '@/lib/sync'
import { profile } from '@/lib/tiles/profile'
import {
  allGoals,
  activeGoalId,
  setActiveGoalId,
  goals,
  saveGoals,
  noticedFeed,
  tileIdeas,
  type Goal,
} from '@/lib/tiles/weights'

/**
 * Gobind's chat — a real inline reply from app/api/mentor/chat (see that
 * route for why: a deliberate, owner-chosen exception to CLAUDE.md's "no AI
 * keys in the app, ever"). Gobind is a GENERAL mentor: buildFullDashboardContext
 * below gathers every tile the user has data in — not just Train/Fuel — so it
 * can answer about any part of the dashboard, always grounded in real numbers.
 */
const MENTOR_CHAT_KEY = 'vitality:mentorChat:v2'

interface ChatEntry {
  id: string
  role: 'user' | 'gobind'
  text: string
  mood?: GobindExpression
  ts: number
}

const SUGGESTED_PROMPTS = [
  'How am I doing across everything this week?',
  'Analyze today’s workout',
  'Review today’s calories and macros',
  'What’s the one thing I should fix today?',
  'Am I showing signs of a plateau?',
  'Compare this week with last week',
]

// the cozy loader's rotating "thinking" line — general-mentor phrasing, no
// workout/nutrition-specific wording, one picked at random per send.
const CZ_TAGS = ['Thinking', 'One sec', 'On it']
const CZ_LINES = [
  { text: 'Reading your whole dashboard.', hl: 'whole dashboard' },
  { text: 'Finding the one move that matters most right now.', hl: 'one move' },
  { text: 'Keeping it honest and something you can do today.', hl: 'do today' },
]

function loadChatHistory(): ChatEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(MENTOR_CHAT_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
function saveChatHistory(list: ChatEntry[]): void {
  try {
    window.localStorage.setItem(MENTOR_CHAT_KEY, JSON.stringify(list))
  } catch {
    /* quota / blocked — chat still works this session, just won't persist */
  }
}

/** Same shape train.html writes: { days: [{ name, lifts: [{ name, weight, targetReps, history }] }] }. */
function summarizeWorkoutData(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const days = (data as { days?: unknown }).days
  if (!Array.isArray(days)) return ''
  const lines: string[] = []
  let liftCount = 0
  for (const day of days) {
    if (liftCount >= 5) break
    const lifts = (day as { lifts?: unknown })?.lifts
    if (!Array.isArray(lifts)) continue
    for (const lift of lifts) {
      if (liftCount >= 5) break
      const l = lift as { name?: string; weight?: number; targetReps?: number; history?: Array<{ w?: number; r?: number; date?: string }> }
      const hist = Array.isArray(l.history) ? l.history : []
      if (!hist.length) continue
      const sorted = hist.slice().sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
      const last = sorted[sorted.length - 1]
      const prev = sorted[sorted.length - 2]
      let best: { w: number; r: number } | null = null
      sorted.forEach((h) => {
        const w = h.w ?? 0,
          r = h.r ?? 0
        if (!best || w > best.w || (w === best.w && r > best.r)) best = { w, r }
      })
      let line = `${l.name}: last ${last?.w ?? '?'}×${last?.r ?? '?'} on ${last?.date ?? '?'}`
      if (prev) line += `, before that ${prev.w ?? '?'}×${prev.r ?? '?'}`
      if (best) line += `, all-time best ${(best as { w: number; r: number }).w}×${(best as { w: number; r: number }).r}`
      lines.push(line)
      liftCount++
    }
  }
  return lines.length ? 'Recent lifts (real, from your log):\n' + lines.join('\n') : ''
}

function summarizeRecoveryData(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const recovery = (data as { recovery?: Record<string, { sleep?: string; soreness?: string; stress?: string; skipped?: boolean }> }).recovery
  if (!recovery || typeof recovery !== 'object') return ''
  const todayKey = new Date().toISOString().slice(0, 10)
  const rec = recovery[todayKey]
  if (!rec || rec.skipped) return ''
  const parts: string[] = []
  if (rec.sleep) parts.push(`sleep ${rec.sleep}`)
  if (rec.soreness) parts.push(`soreness ${rec.soreness}`)
  if (rec.stress) parts.push(`stress ${rec.stress}`)
  return parts.length ? `Today's recovery check-in: ${parts.join(', ')}.` : ''
}

/** Same shape fuel.html writes: { profile, targets, meals: { 'YYYY-MM-DD': [...] } }. */
function summarizeNutritionData(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const d = data as {
    profile?: { goalShape?: string }
    targets?: { calories?: number; protein?: number; carbs?: number; fat?: number }
    meals?: Record<string, Array<{ cal?: number; p?: number; c?: number; f?: number }>>
  }
  const lines: string[] = []
  if (d.profile?.goalShape) lines.push(`Nutrition goal: ${d.profile.goalShape}.`)
  if (d.targets) lines.push(`Daily targets: ${d.targets.calories ?? '?'} cal, ${d.targets.protein ?? '?'}p/${d.targets.carbs ?? '?'}c/${d.targets.fat ?? '?'}f.`)
  if (d.meals && typeof d.meals === 'object') {
    const days = Object.keys(d.meals).sort().reverse().slice(0, 3)
    for (const day of days) {
      const meals = d.meals[day]
      if (!Array.isArray(meals) || !meals.length) continue
      const tot = meals.reduce(
        (a: { cal: number; p: number; c: number; f: number }, m) => ({
          cal: a.cal + (m.cal ?? 0),
          p: a.p + (m.p ?? 0),
          c: a.c + (m.c ?? 0),
          f: a.f + (m.f ?? 0),
        }),
        { cal: 0, p: 0, c: 0, f: 0 },
      )
      lines.push(`${day}: ${Math.round(tot.cal)} cal, ${Math.round(tot.p)}p/${Math.round(tot.c)}c/${Math.round(tot.f)}f logged.`)
    }
  }
  return lines.join('\n')
}

/** Any other tile's saved data — no bespoke parser, just a bounded raw dump.
 *  Skips empty arrays/objects/null so an untouched tile stays silent. */
function summarizeGeneric(label: string, data: unknown): string {
  if (data == null) return ''
  if (Array.isArray(data) && data.length === 0) return ''
  if (typeof data === 'object' && !Array.isArray(data) && Object.keys(data as object).length === 0) return ''
  const json = JSON.stringify(data)
  if (!json || json === '{}' || json === '[]') return ''
  return `${label} data: ${json.slice(0, 900)}`
}

/**
 * Gobind is a GENERAL mentor — this gathers the WHOLE dashboard, not just
 * training/nutrition: the active goal, the body profile, then every
 * pre-installed tile and every tile the user built, whichever have data.
 * Train/Fuel keep their nicer bespoke summaries (real workout history, real
 * macros); everything else gets a bounded raw-JSON block so a new tile is
 * automatically visible to Gobind with zero code changes. Real data only —
 * never fabricated, and the whole block is capped so a single request can't
 * balloon token spend.
 */
async function buildFullDashboardContext(userId: string, goalTitle: string | undefined): Promise<string> {
  const blocks: string[] = []
  if (goalTitle) blocks.push(`My current goal: ${goalTitle}.`)

  const p = profile()
  const bits: string[] = []
  if (p.name) bits.push(`name ${p.name}`)
  if (p.age) bits.push(`age ${p.age}`)
  if (p.heightCm) bits.push(`height ${p.heightCm}cm`)
  if (p.weightKg) bits.push(`weight ${p.weightKg}kg`)
  if (p.goalShape) bits.push(`goal shape ${p.goalShape}`)
  if (bits.length) blocks.push(`Profile: ${bits.join(', ')}.`)

  const train = await tileStore.loadData(userId, 'train')
  const w = summarizeWorkoutData(train)
  if (w) blocks.push(w)
  const r = summarizeRecoveryData(train)
  if (r) blocks.push(r)

  const fuel = await tileStore.loadData(userId, 'fuel')
  const n = summarizeNutritionData(fuel)
  if (n) blocks.push(n)

  const otherCoreIds = (Object.keys(CORE_TILES) as CoreTileId[]).filter((id) => id !== 'train' && id !== 'fuel')
  for (const id of otherCoreIds) {
    const data = await tileStore.loadData(userId, id)
    const s = summarizeGeneric(CORE_TILES[id].label, data)
    if (s) blocks.push(s)
  }

  for (const tile of tileStore.listTiles(userId)) {
    const data = await tileStore.loadData(userId, tile.id)
    const s = summarizeGeneric(tile.name, data)
    if (s) blocks.push(s)
  }

  return blocks.join('\n').slice(0, 9000)
}

/**
 * The Mentor — the equation, minimal. When the mentor is clicked everything
 * else fades away and this remains:
 *
 *        ───────── ai mentor ─────────      (top centre, big, animated in)
 *            [ pick your goal ]             (easy in and out)
 *        x% + x% + x% + x%                  (the tiles, no borders, rolling)
 *        results · progress · advice = y    (the bottom line)
 *
 * Every number is DATA, pre-written by the mentor (Claude Code) from data
 * sweeps — analytics, manual logs, wearables. The app never guesses.
 */

const label = (tile: string) => CORE_TILES[tile as keyof typeof CORE_TILES]?.label ?? tile

/* ── a number that rolls like a ticker ── */
function Roll({ value, color, size }: { value: number; color: string; size: number }) {
  const [shown, setShown] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    const from = prev.current
    prev.current = value
    if (from === value) return
    const t0 = performance.now()
    const dur = 900
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(from + (value - from) * e))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return (
    <span
      style={{
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: size,
        fontWeight: 300,
        fontVariantNumeric: 'tabular-nums',
        color,
        textShadow: `0 0 30px ${color}55`,
        transition: 'color .8s ease, text-shadow .8s ease',
      }}
    >
      {shown}%
    </span>
  )
}

export default function MentorPage({
  overlay = false,
  onClose,
}: {
  /** true when the mentor "comes alive" over the board (no page load) */
  overlay?: boolean
  onClose?: () => void
}) {
  const router = useRouter()
  const { user, loading: sessionLoading } = useSession()
  const userId = user?.id ?? 'me'
  const [mounted, setMounted] = useState(false)
  const [list, setList] = useState<Goal[]>([])
  const [active, setActive] = useState('')
  const [draft, setDraft] = useState('')
  const [ideasOpen, setIdeasOpen] = useState(false) // the +: blueprints for tiles you're missing
  const gemRef = useRef<HTMLDivElement | null>(null)
  const avatarRef = useRef<GobindAvatarHandle | null>(null)

  // Gobind's live chat — see app/api/mentor/chat/route.ts. buildFullDashboardContext
  // above does the real-data gathering (every tile, not just Train/Fuel); this
  // just holds the conversation.
  const [chatHistory, setChatHistory] = useState<ChatEntry[]>([])
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [chatError, setChatError] = useState('')
  const [thinkingLine, setThinkingLine] = useState({ tag: CZ_TAGS[0], ...CZ_LINES[0] })

  useEffect(() => {
    if (sessionLoading) return
    // Only a bare page load (not the board's overlay, which is already behind
    // app/page.tsx's own gate) needs to check this itself.
    if (!overlay && syncEnabled() && !user) {
      router.replace('/login')
      return
    }
    setMounted(true)
    setList(allGoals())
    setActive(activeGoalId())
    setChatHistory(loadChatHistory())
  }, [sessionLoading, user, overlay, router])

  // Pulse the gem when the goal changes — WAAPI on the wrapper, NO remount.
  // (Remounting would re-init the WebGL gem: heavy, and it visibly glitches.)
  useEffect(() => {
    const el = gemRef.current
    if (!el || !active) return
    const s = active === 'overall' ? 1.16 : 1
    el.animate(
      [
        { transform: `scale(${s * 0.92})` },
        { transform: `scale(${s * 1.12}) rotate(-3deg)` },
        { transform: `scale(${s})` },
      ],
      { duration: 750, easing: 'cubic-bezier(.34,1.56,.64,1)' },
    )
  }, [active])

  if (!mounted) return null

  const act = list.find((g) => g.id === active) ?? list[0]
  const accent = act?.accent ?? '#2554E8'
  const entries = Object.entries(act?.weights ?? {}).sort((a, b) => b[1] - a[1])
  const advice = noticedFeed()[0]

  const switchGoal = (id: string) => {
    setActiveGoalId(id)
    setActive(id)
  }

  const addGoal = () => {
    const raw = draft.trim()
    if (!raw) return
    const id = 'g-' + raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)
    saveGoals([...goals(), { id, title: raw, weights: {}, pending: true } as Goal])
    setList(allGoals())
    setDraft('')
  }

  const askMentor = async (text: string) => {
    const q = text.trim()
    if (!q || asking) return
    setAsking(true)
    setChatError('')
    setThinkingLine({
      tag: CZ_TAGS[Math.floor(Math.random() * CZ_TAGS.length)],
      ...CZ_LINES[Math.floor(Math.random() * CZ_LINES.length)],
    })
    const userEntry: ChatEntry = { id: 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), role: 'user', text: q, ts: Date.now() }
    const withUser = [...chatHistory, userEntry]
    setChatHistory(withUser)
    saveChatHistory(withUser)
    setQuestion('')
    avatarRef.current?.setExpression('surprised')
    try {
      const context = await buildFullDashboardContext(userId, act?.title)
      setTimeout(() => avatarRef.current?.setExpression('thinking'), 500)
      const res = await fetch('/api/mentor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: q,
          context,
          goalTitle: act?.title,
          history: withUser.slice(-9, -1).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setChatError(typeof data?.error === 'string' ? data.error : 'Gobind is unreachable right now — try again in a moment.')
        avatarRef.current?.setExpression('sad', 3)
        return
      }
      const mood: GobindExpression = data.mood ?? 'happy'
      const replyEntry: ChatEntry = {
        id: 'g-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        role: 'gobind',
        text: data.reply,
        mood,
        ts: Date.now(),
      }
      const withReply = [...withUser, replyEntry]
      setChatHistory(withReply)
      saveChatHistory(withReply)
      avatarRef.current?.setExpression(mood, 4)
    } catch {
      setChatError('Gobind is unreachable right now — check your connection and try again.')
      avatarRef.current?.setExpression('sad', 3)
    } finally {
      setAsking(false)
    }
  }

  const deleteMessage = (id: string) => {
    const next = chatHistory.filter((m) => m.id !== id)
    setChatHistory(next)
    saveChatHistory(next)
  }

  const clearChat = () => {
    if (!chatHistory.length) return
    if (!window.confirm('Clear your whole mentor chat history? This only removes what you asked — none of your workout or nutrition data is touched.')) return
    setChatHistory([])
    saveChatHistory([])
  }

  const mono: React.CSSProperties = {
    fontFamily: 'ui-monospace, Menlo, monospace',
    letterSpacing: '.16em',
    textTransform: 'uppercase',
  }

  return (
    <main className="grain-overlay" style={{ minHeight: '100vh', position: 'relative', ['--wall-accent' as string]: accent }}>
      {/* entrance: the mentor rises to the top centre and everything fades in under it */}
      <style>{`
        @keyframes mentorIn { from { opacity: 0; transform: translateY(26px) scale(.86) } to { opacity: 1; transform: none } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
        @keyframes mentorPulse { 0% { transform: scale(1) } 40% { transform: scale(1.16) rotate(-2deg) } 100% { transform: scale(1) } }
        @keyframes bpVeil { from { opacity: 0 } to { opacity: 1 } }
        @keyframes bpIn { from { opacity: 0; transform: translateY(22px) scale(.94) } to { opacity: 1; transform: none } }
        @keyframes bpRow { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
      `}</style>
      {!overlay && <WelcomeBackdrop />}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          background: `radial-gradient(60% 45% at 50% 0%, ${accent}24, transparent 70%)`,
          transition: 'background 1.2s ease',
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 5,
          width: 'min(880px, calc(100vw - 40px))',
          margin: '0 auto',
          // Clears the status bar / Dynamic Island on iPhone (0 inset on desktop) —
          // this page (and its board-overlay variant) has no other top chrome.
          padding: 'calc(26px + env(safe-area-inset-top)) 0 90px',
          textAlign: 'center',
        }}
      >
        {overlay ? (
          <button
            type="button"
            onClick={onClose}
            style={{
              float: 'left',
              color: 'var(--muted, #8a8f98)',
              fontSize: 13,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ← board
          </button>
        ) : (
          <a href="/" style={{ float: 'left', color: 'var(--muted, #8a8f98)', fontSize: 13, textDecoration: 'none' }}>
            ← Dashboard
          </a>
        )}

        {/* ───────── ai mentor ───────── */}
        <div style={{ clear: 'both', paddingTop: 44, animation: 'mentorIn .9s cubic-bezier(.22,1,.36,1) both' }}>
          {/* Gobind — one persistent WebGL instance (never remounted; remounting
              would re-init Three.js and glitch). Travels in on load, pulses on
              every goal switch (WAAPI), scales up for the main goal, glows the
              goal's color, and reacts live to the chat below via avatarRef. */}
          <div aria-hidden style={{ height: 160, display: 'grid', placeItems: 'center', marginBottom: 4 }}>
            <div
              ref={gemRef}
              style={{
                width: 132,
                height: 132,
                transform: act?.id === 'overall' ? 'scale(1.16)' : 'scale(1)',
                transition: 'transform .7s cubic-bezier(.34,1.56,.64,1), filter .8s ease',
                filter: `drop-shadow(0 0 ${act?.id === 'overall' ? 44 : 30}px ${accent}66)`,
              }}
            >
              <GobindAvatar ref={avatarRef} size={132} />
            </div>
          </div>
          <p style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontStyle: 'italic', fontSize: 20, color: 'var(--fg, #fff)', margin: '2px 0 0' }}>Gobind</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center', marginTop: 8 }}>
            <span aria-hidden style={{ flex: 1, maxWidth: 180, height: 1, background: `linear-gradient(to right, transparent, ${accent}55)`, transition: 'background .8s ease' }} />
            <h1 style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontStyle: 'normal', fontWeight: 700, fontSize: 'clamp(30px, 4.6vw, 44px)', color: 'var(--fg, #fff)', margin: 0 }}>
              ai mentor
            </h1>
            <span aria-hidden style={{ flex: 1, maxWidth: 180, height: 1, background: `linear-gradient(to left, transparent, ${accent}55)`, transition: 'background .8s ease' }} />
          </div>
          <p style={{ ...mono, fontSize: 10.5, color: accent, margin: '10px 0 0', transition: 'color .8s ease' }}>notices everything · runs the math</p>
        </div>

        {/* the goal — easy in, easy out */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 34, animation: 'fadeUp .8s ease .25s both' }}>
          {list.map((g) => {
            const on = g.id === active
            const gA = g.accent ?? '#2554E8'
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => switchGoal(g.id)}
                style={{
                  ...mono,
                  fontSize: 11,
                  color: on ? gA : 'var(--muted, #8a8f98)',
                  background: on ? `${gA}12` : 'transparent',
                  border: `1px solid ${on ? gA + '59' : 'var(--border, #262626)'}`,
                  borderRadius: 10,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  transition: 'color .6s ease, border-color .6s ease, background .6s ease',
                }}
              >
                {g.id === 'overall' ? '★ ' : ''}
                {g.title}
                {g.id === 'overall' ? ' ★' : ''}
              </button>
            )
          })}
        </div>

        {/* x + x + x — the tiles, no borders, just the numbers */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'clamp(14px, 3vw, 30px)',
            flexWrap: 'wrap',
            marginTop: 46,
            animation: 'fadeUp .8s ease .4s both',
          }}
        >
          {entries.map(([tile, w], i) => (
            <div key={tile} style={{ display: 'flex', alignItems: 'center', gap: 'clamp(14px, 3vw, 30px)' }}>
              {i > 0 && (
                <span aria-hidden style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 30, fontWeight: 300, color: `${accent}66`, transition: 'color .8s ease' }}>
                  +
                </span>
              )}
              <div>
                <Roll value={w} color={accent} size={Math.max(30, 56 - entries.length * 3)} />
                <p style={{ ...mono, fontSize: 10, color: 'var(--muted, #8a8f98)', margin: '4px 0 0' }}>{label(tile)}</p>
              </div>
            </div>
          ))}

          {/* the +: what you're NOT tracking — the mentor's blueprints */}
          <button
            type="button"
            onClick={() => setIdeasOpen(true)}
            aria-label="What am I missing?"
            title="What am I missing?"
            style={{
              width: 54,
              height: 54,
              borderRadius: 999,
              border: `1px dashed ${accent}59`,
              background: 'transparent',
              color: accent,
              fontSize: 26,
              fontWeight: 300,
              cursor: 'pointer',
              transition: 'border-color .6s ease, color .6s ease',
            }}
          >
            +
          </button>
        </div>

        {ideasOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Blueprints — tiles you're missing"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setIdeasOpen(false)
            }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 96,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              background: 'rgba(0,0,0,.72)',
              backdropFilter: 'blur(12px)',
              animation: 'bpVeil .35s ease both',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 'min(480px, 100%)',
                maxHeight: '84vh',
                overflow: 'auto',
                textAlign: 'center',
                padding: '12px 8px',
                animation: 'bpIn .55s cubic-bezier(.34,1.56,.64,1) both',
              }}
            >
              <p style={{ ...mono, fontSize: 9.5, color: accent, letterSpacing: '.2em', margin: '0 0 8px' }}>
                THE MENTOR SEES A GAP
              </p>
              <span style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontStyle: 'normal', fontSize: 24, color: 'var(--fg, #fff)' }}>
                You&apos;re not tracking everything.
              </span>

              <div style={{ margin: '30px 0 6px' }}>
                {tileIdeas(act?.id ?? 'overall').map((idea, i) => (
                  <div
                    key={idea.title}
                    style={{ padding: '18px 0', animation: `bpRow .6s cubic-bezier(.22,1,.36,1) ${0.12 + i * 0.09}s both` }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 14 }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-serif), Georgia, serif',
                          fontStyle: 'normal',
                          fontSize: 'clamp(30px, 5vw, 40px)',
                          fontWeight: 700,
                          color: 'var(--fg, #fff)',
                        }}
                      >
                        {idea.word ?? idea.title.split(/[\s/]/)[0]}
                      </span>
                      <span style={{ ...mono, fontSize: 13, color: accent }}>≈ {idea.estWeight}%</span>
                    </div>
                    <p style={{ ...mono, fontSize: 10, color: 'var(--muted, #8a8f98)', margin: '7px 0 0', letterSpacing: '.08em' }}>
                      {idea.title.toLowerCase()} · {idea.tracks}
                    </p>
                  </div>
                ))}
              </div>

              <p
                style={{
                  ...mono,
                  fontSize: 10,
                  color: 'var(--muted, #8a8f98)',
                  margin: '18px 0 0',
                  animation: 'bpRow .6s ease .4s both',
                }}
              >
                want one? tell the mentor — <i style={{ color: 'var(--fg, #fff)', fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 13 }}>“build me water”</i>
              </p>
            </div>
          </div>
        )}

        {/* = y — results, progress, advice */}
        <div style={{ marginTop: 52, animation: 'fadeUp .8s ease .55s both' }}>
          <span aria-hidden style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 34, fontWeight: 300, color: `${accent}88`, transition: 'color .8s ease' }}>
            =
          </span>
          <h2 style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontStyle: 'normal', fontWeight: 700, fontSize: 'clamp(24px, 3.6vw, 34px)', color: 'var(--fg, #fff)', margin: '10px 0 0' }}>
            {act?.title}
          </h2>

          {/* progress — computed by the mentor's data sweeps */}
          <div style={{ width: 'min(520px, 100%)', margin: '26px auto 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ ...mono, fontSize: 10, color: 'var(--muted, #8a8f98)' }}>how far you&apos;ve come</span>
              <Roll value={act?.progress ?? 0} color={accent} size={22} />
            </div>
            <div style={{ height: 5, borderRadius: 999, background: `${accent}1c`, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${act?.progress ?? 0}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: accent,
                  transition: 'width 1s cubic-bezier(.22,1,.36,1), background .8s ease',
                }}
              />
            </div>
          </div>

          {/* mentor notices — bullets, the key words bold */}
          {advice && (
            <div style={{ width: 'min(560px, 100%)', margin: '30px auto 0', textAlign: 'left' }}>
              <p style={{ ...mono, fontSize: 10.5, color: accent, margin: '0 0 10px', transition: 'color .8s ease' }}>
                mentor notices
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {(advice.points ?? [advice.text]).map((pt, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 10,
                      color: 'var(--muted, #b9c4be)',
                      fontSize: 13.5,
                      lineHeight: 1.65,
                      margin: '7px 0',
                    }}
                  >
                    <span aria-hidden style={{ color: accent, transition: 'color .8s ease' }}>◆</span>
                    <span>
                      {pt.split(/\*\*(.+?)\*\*/g).map((part, j) =>
                        j % 2 ? (
                          <strong key={j} style={{ color: 'var(--fg, #fff)', fontWeight: 600 }}>
                            {part}
                          </strong>
                        ) : (
                          part
                        ),
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p style={{ ...mono, fontSize: 9.5, color: 'var(--muted, #8a8f98)', margin: '18px 0 0' }}>
            results · progress · advice — swept and computed by the mentor, always
          </p>
        </div>

        {/* write a new goal — the mentor shapes it */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            width: 'min(560px, 100%)',
            margin: '54px auto 0',
            border: '1px dashed var(--border, #333)',
            borderRadius: 10,
            padding: '6px 8px 6px 18px',
            animation: 'fadeUp .8s ease .7s both',
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addGoal()
            }}
            placeholder="Write a goal, raw — the mentor shapes and weighs it."
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg, #fff)', fontSize: 13.5 }}
          />
          <button
            type="button"
            onClick={addGoal}
            style={{
              flex: '0 0 auto',
              background: accent,
              color: '#f4f6ff',
              border: 'none',
              borderRadius: 10,
              padding: '9px 16px',
              fontWeight: 600,
              fontSize: 12.5,
              cursor: 'pointer',
              transition: 'background .8s ease',
            }}
          >
            Give it to the mentor
          </button>
        </div>

        {/* chat with gobind — a real inline reply, server-side (see
            app/api/mentor/chat/route.ts). A deliberate exception to the base's
            "no AI keys" rule, made by choice — this bills the deployment's own
            ANTHROPIC_API_KEY per message, a fraction of a cent on Sonnet. */}
        <div style={{ width: 'min(620px, 100%)', margin: '60px auto 0', textAlign: 'left', animation: 'fadeUp .8s ease .8s both' }}>
          <p style={{ ...mono, fontSize: 10.5, color: accent, margin: '0 0 4px', transition: 'color .8s ease' }}>chat with gobind</p>
          <p style={{ fontSize: 12, color: 'var(--muted, #8a8f98)', margin: '0 0 14px', lineHeight: 1.5 }}>
            A real reply, inline — Gobind reads your whole dashboard, every tile you have data in, never guesses. Informational only, not medical advice.
          </p>

          {chatHistory.length === 0 && (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={asking}
                  onClick={() => askMentor(p)}
                  style={{
                    fontSize: 11.5,
                    color: 'var(--muted-strong, #b9c4be)',
                    background: 'transparent',
                    border: '1px solid var(--border, #262626)',
                    borderRadius: 10,
                    padding: '7px 13px',
                    cursor: asking ? 'default' : 'pointer',
                    opacity: asking ? 0.5 : 1,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {(chatHistory.length > 0 || asking) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14, maxHeight: 440, overflowY: 'auto', paddingRight: 4 }}>
              {chatHistory.map((m) => (
                <div key={m.id} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 6, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      maxWidth: '86%',
                      padding: '10px 14px',
                      borderRadius: 14,
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      color: 'var(--fg, #fff)',
                      background: m.role === 'user' ? 'rgba(255,255,255,.05)' : `${accent}0f`,
                      border: `1px solid ${m.role === 'user' ? 'var(--border, #262626)' : accent + '3d'}`,
                      borderLeft: m.role === 'gobind' ? `3px solid ${accent}` : undefined,
                      textAlign: 'left',
                    }}
                  >
                    {m.role === 'gobind' && (
                      <span
                        style={{
                          ...mono,
                          display: 'inline-block',
                          fontSize: 9,
                          fontWeight: 700,
                          color: '#04140d',
                          background: accent,
                          padding: '2px 8px',
                          borderRadius: 999,
                          marginBottom: 6,
                        }}
                      >
                        gobind
                      </span>
                    )}
                    <p style={{ margin: 0 }}>{m.text}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteMessage(m.id)}
                    aria-label="Delete this message"
                    title="Delete"
                    style={{ flex: 'none', background: 'none', border: 'none', color: 'var(--muted, #8a8f98)', fontSize: 14, cursor: 'pointer', padding: 4, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {asking && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div className="cz-lite" style={{ ['--tone' as string]: accent }}>
                    <div className="cz-lite-bar">
                      <span />
                    </div>
                    <div className="cz-lite-body">
                      <span className="cz-lite-tag">{thinkingLine.tag}</span>
                      <span className="cz-lite-text">
                        {thinkingLine.text.split(thinkingLine.hl).map((part, i, arr) => (
                          <span key={i}>
                            {part}
                            {i < arr.length - 1 && <b style={{ color: accent }}>{thinkingLine.hl}</b>}
                          </span>
                        ))}
                      </span>
                      <span className="cz-lite-dots">
                        <i /><i /><i />
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {chatError && (
            <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 12px', lineHeight: 1.5 }}>⚠ {chatError}</p>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              border: '1px dashed var(--border, #333)',
              borderRadius: 18,
              padding: 14,
            }}
          >
            <textarea
              className="mentorChatBox"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) askMentor(question)
              }}
              placeholder="Ask Gobind about your workout, nutrition, recovery, or progress…"
              aria-label="Ask Gobind"
              rows={3}
              style={{
                resize: 'vertical',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--fg, #fff)',
                fontSize: 13.5,
                fontFamily: 'inherit',
                lineHeight: 1.5,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => askMentor(question)}
                disabled={asking || !question.trim()}
                aria-label="Send to Gobind"
                style={{
                  background: asking || !question.trim() ? 'var(--border, #262626)' : accent,
                  color: asking || !question.trim() ? 'var(--muted, #8a8f98)' : '#f4f6ff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '9px 18px',
                  fontWeight: 600,
                  fontSize: 12.5,
                  cursor: asking || !question.trim() ? 'default' : 'pointer',
                  transition: 'background .3s ease',
                }}
              >
                {asking ? 'thinking…' : 'Send'}
              </button>
            </div>
          </div>

          {chatHistory.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                type="button"
                onClick={clearChat}
                style={{
                  ...mono,
                  fontSize: 9.5,
                  color: 'var(--muted, #8a8f98)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                clear conversation
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .mentorChatBox:focus-visible { outline: 2px solid ${accent}; outline-offset: 2px; border-radius: 8px; }
        .cz-lite { --tone-soft: color-mix(in srgb, var(--tone) 28%, transparent); display: flex; gap: 10px; align-items: flex-start;
          border: 1px solid var(--tone-soft); background: rgba(255,255,255,.02); border-radius: 12px; padding: 10px 14px; max-width: 320px; }
        .cz-lite-bar { width: 34px; height: 4px; border-radius: 999px; background: rgba(255,255,255,.16); overflow: hidden; flex: none; margin-top: 4px; }
        .cz-lite-bar span { display: block; height: 100%; width: 60%; border-radius: 999px; background: linear-gradient(90deg, transparent, var(--tone), transparent); animation: czLiteSlide 1.3s cubic-bezier(.16,1,.3,1) infinite; }
        .cz-lite-body { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .cz-lite-tag { font-family: ui-monospace, monospace; font-size: 9px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #04140d; background: var(--tone); border-radius: 999px; padding: 2px 8px; animation: czLiteTagPop .5s cubic-bezier(.34,1.56,.64,1); }
        .cz-lite-text { font-size: 12.5px; color: var(--fg, #fff); }
        .cz-lite-dots { display: flex; gap: 4px; }
        .cz-lite-dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--tone); opacity: .4; animation: czLiteDot 1.1s ease-in-out infinite; display: block; }
        .cz-lite-dots i:nth-child(2) { animation-delay: .18s } .cz-lite-dots i:nth-child(3) { animation-delay: .36s }
        @keyframes czLiteTagPop { 0% { opacity: 0; transform: scale(.6) rotate(-6deg) } 100% { opacity: 1; transform: scale(1) rotate(0) } }
        @keyframes czLiteDot { 0%, 100% { opacity: .35; transform: scale(1) } 50% { opacity: 1; transform: scale(1.5) } }
        @keyframes czLiteSlide { from { transform: translateX(-120%) } to { transform: translateX(320%) } }
        @media (prefers-reduced-motion: reduce) { .cz-lite-bar span, .cz-lite-dots i, .cz-lite-tag { animation: none !important } }
      `}</style>
    </main>
  )
}
