'use client'

import { useEffect, useRef, useState } from 'react'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'
import DashboardHeaderGem from '@/app/app/DashboardHeaderGem'
import { CORE_TILES } from '@/lib/tiles/coreTiles'
import { tileStore } from '@/lib/tiles/tileStore'
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
 * Mentor Chat — Claude-native (see CLAUDE.md: "No AI keys in the app, ever").
 * There is no backend AI route here: Send opens claude.ai in a new tab with
 * the question plus a compact, real summary of the user's own Train/Fuel
 * data baked in, exactly like Train's rest-coach "Ask Claude" pill. This app
 * only remembers WHAT was asked (for history/delete/clear) — it never
 * fabricates or stores an assistant reply, since it never receives one back.
 */
const MENTOR_CHAT_KEY = 'vitality:mentorChat'
const MENTOR_PREFS_KEY = 'vitality:mentorChat:prefs'

interface ChatEntry {
  id: string
  text: string
  ts: number
}
interface ChatPrefs {
  workout: boolean
  nutrition: boolean
  recovery: boolean
}
const DEFAULT_PREFS: ChatPrefs = { workout: true, nutrition: true, recovery: true }

const SUGGESTED_PROMPTS = [
  'Analyze today’s workout',
  'Am I progressing on bench press?',
  'Recommend my next working sets',
  'Review today’s calories and macros',
  'Am I showing signs of a plateau?',
  'How should I adjust my next workout?',
  'Generate my weekly progress summary',
  'Compare this week with last week',
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
function loadChatPrefs(): ChatPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(MENTOR_PREFS_KEY)
    const p = raw ? JSON.parse(raw) : null
    return p && typeof p === 'object' ? { ...DEFAULT_PREFS, ...p } : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}
function saveChatPrefs(p: ChatPrefs): void {
  try {
    window.localStorage.setItem(MENTOR_PREFS_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
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

/** Pulls the user's own real Train/Fuel data (only the fields the prefs allow)
 *  into a compact block, same "context in, no key, no server" pattern as
 *  Train's rcAskPrompt. Never includes anything outside training/nutrition/
 *  recovery — no founder bio, no unrelated profile fields. */
async function buildMentorContext(prefs: ChatPrefs, goalTitle: string | undefined): Promise<string> {
  const blocks: string[] = []
  if (goalTitle) blocks.push(`My current goal: ${goalTitle}.`)
  if (prefs.workout || prefs.recovery) {
    const train = await tileStore.loadData('me', 'train')
    if (prefs.workout) {
      const w = summarizeWorkoutData(train)
      if (w) blocks.push(w)
    }
    if (prefs.recovery) {
      const r = summarizeRecoveryData(train)
      if (r) blocks.push(r)
    }
  }
  if (prefs.nutrition) {
    const fuel = await tileStore.loadData('me', 'fuel')
    const n = summarizeNutritionData(fuel)
    if (n) blocks.push(n)
  }
  return blocks.join('\n')
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
  const [mounted, setMounted] = useState(false)
  const [list, setList] = useState<Goal[]>([])
  const [active, setActive] = useState('')
  const [draft, setDraft] = useState('')
  const [ideasOpen, setIdeasOpen] = useState(false) // the +: blueprints for tiles you're missing
  const gemRef = useRef<HTMLDivElement | null>(null)

  // Mentor Chat: Claude-native comment box (see buildMentorContext above).
  const [chatHistory, setChatHistory] = useState<ChatEntry[]>([])
  const [chatPrefs, setChatPrefs] = useState<ChatPrefs>(DEFAULT_PREFS)
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    setMounted(true)
    setList(allGoals())
    setActive(activeGoalId())
    setChatHistory(loadChatHistory())
    setChatPrefs(loadChatPrefs())
  }, [])

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

  const togglePref = (key: keyof ChatPrefs) => {
    const next = { ...chatPrefs, [key]: !chatPrefs[key] }
    setChatPrefs(next)
    saveChatPrefs(next)
  }

  const askMentor = async (text: string) => {
    const q = text.trim()
    if (!q || asking) return
    setAsking(true)
    try {
      const context = await buildMentorContext(chatPrefs, act?.title)
      const prompt =
        (context ? context + '\n\n' : '') +
        'My question: ' +
        q +
        ' Use only the data above if it helps; ask me if something you need is missing. Keep it concise, explain your reasoning, and never present an estimate as guaranteed. This is not medical advice.'
      window.open('https://claude.ai/new?q=' + encodeURIComponent(prompt), '_blank', 'noopener')
      const entry: ChatEntry = { id: 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: q, ts: Date.now() }
      const next = [...chatHistory, entry]
      setChatHistory(next)
      saveChatHistory(next)
      setQuestion('')
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
          {/* the avatar IS the gem — one persistent WebGL instance (never remounted).
              It travels in on load, pulses on every switch (WAAPI), scales up for
              the main goal, and glows the goal's color. */}
          <div aria-hidden style={{ height: 150, display: 'grid', placeItems: 'center', marginBottom: 4 }}>
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
              <DashboardHeaderGem size={132} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
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

        {/* ask your mentor — the comment box. Claude-native: Send opens claude.ai
            in a new tab with a real summary of your own data baked into the
            question (same pattern as Train's rest-coach "Ask Claude" pill), so
            there's no AI key, no server, and no fabricated reply stored here —
            this app only remembers what you asked. */}
        <div style={{ width: 'min(620px, 100%)', margin: '60px auto 0', textAlign: 'left', animation: 'fadeUp .8s ease .8s both' }}>
          <p style={{ ...mono, fontSize: 10.5, color: accent, margin: '0 0 4px', transition: 'color .8s ease' }}>ask your mentor</p>
          <p style={{ fontSize: 12, color: 'var(--muted, #8a8f98)', margin: '0 0 14px', lineHeight: 1.5 }}>
            Opens Claude in a new tab with your real numbers already in the question — no AI key, nothing billed, informational only, not medical advice.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {(
              [
                ['workout', 'workout data'],
                ['nutrition', 'nutrition data'],
                ['recovery', 'recovery data'],
              ] as [keyof ChatPrefs, string][]
            ).map(([k, label2]) => (
              <button
                key={k}
                type="button"
                onClick={() => togglePref(k)}
                aria-pressed={chatPrefs[k]}
                style={{
                  ...mono,
                  fontSize: 9.5,
                  color: chatPrefs[k] ? accent : 'var(--muted, #8a8f98)',
                  background: chatPrefs[k] ? `${accent}12` : 'transparent',
                  border: `1px solid ${chatPrefs[k] ? accent + '59' : 'var(--border, #262626)'}`,
                  borderRadius: 10,
                  padding: '6px 12px',
                  cursor: 'pointer',
                }}
              >
                {chatPrefs[k] ? '✓ ' : ''}
                include {label2}
              </button>
            ))}
          </div>

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
              placeholder="Ask your AI mentor about your workout, nutrition, recovery, or progress…"
              aria-label="Ask your AI mentor"
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
                aria-label="Send to your mentor"
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
                {asking ? 'opening…' : 'Send'}
              </button>
            </div>
          </div>

          {chatHistory.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ ...mono, fontSize: 9.5, color: 'var(--muted, #8a8f98)' }}>
                  asked before ({chatHistory.length})
                </span>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {chatHistory
                  .slice()
                  .reverse()
                  .map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '10px 12px',
                        border: '1px solid var(--border, #202636)',
                        borderRadius: 12,
                        background: 'rgba(255,255,255,.015)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, color: 'var(--fg, #fff)', margin: 0, lineHeight: 1.5 }}>{m.text}</p>
                        <p style={{ ...mono, fontSize: 9, color: 'var(--muted, #8a8f98)', margin: '4px 0 0' }}>
                          {new Date(m.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => askMentor(m.text)}
                        disabled={asking}
                        aria-label="Ask again"
                        title="Ask again"
                        style={{ flex: 'none', background: 'none', border: 'none', color: accent, fontSize: 11, cursor: 'pointer', padding: 4 }}
                      >
                        ↻
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMessage(m.id)}
                        aria-label="Delete this message"
                        title="Delete"
                        style={{ flex: 'none', background: 'none', border: 'none', color: 'var(--muted, #8a8f98)', fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`.mentorChatBox:focus-visible { outline: 2px solid ${accent}; outline-offset: 2px; border-radius: 8px; }`}</style>
    </main>
  )
}
