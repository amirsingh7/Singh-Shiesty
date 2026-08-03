import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
// zodOutputFormat expects zod's v4 API — see app/api/ai/review-pr/route.ts for
// why this repo imports 'zod/v4' here instead of the plain 'zod' (v3) used
// elsewhere (e.g. app/api/mcp's tool schemas).
import { z } from 'zod/v4'
import { supabaseServer } from '@/lib/auth/supabaseServer'

/**
 * Gobind's live chat — a second, deliberate exception to the base's "no AI
 * keys in the app, ever" rule (see CLAUDE.md house rules), alongside
 * app/api/ai/review-pr. The owner explicitly chose to wire a real inline
 * reply here instead of the Claude-native "opens claude.ai in a new tab"
 * pattern the rest of the Mentor page uses — knowing it bills their own
 * ANTHROPIC_API_KEY per message (a fraction of a cent each on Sonnet).
 *
 * Owner-gated only when Supabase is actually configured (a real deployment
 * with sign-ups) — a zero-config local fork has no one to gate against, so
 * it's allowed through, same convention as the rest of this codebase's
 * optional-auth routes.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MOODS = ['neutral', 'happy', 'sad', 'surprised', 'thinking', 'wink', 'love', 'star'] as const

const ReplySchema = z.object({
  reply: z.string().max(700),
  mood: z.enum(MOODS),
})

interface HistoryTurn {
  role: 'user' | 'assistant'
  text: string
}

function parseHistory(v: unknown): HistoryTurn[] {
  if (!Array.isArray(v)) return []
  const out: HistoryTurn[] = []
  for (const row of v) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const role = r.role === 'assistant' ? 'assistant' : r.role === 'user' ? 'user' : null
    const text = typeof r.text === 'string' ? r.text.slice(0, 2000) : ''
    if (!role || !text) continue
    out.push({ role, text })
  }
  return out.slice(-8)
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: "Gobind needs an Anthropic API key on this deployment — add ANTHROPIC_API_KEY to .env.local and restart." }, { status: 503 })
  }

  const c = await supabaseServer()
  if (c) {
    const {
      data: { user },
    } = await c.auth.getUser()
    if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body must be JSON.' }, { status: 400 })
  }

  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : ''
  const context = typeof body.context === 'string' ? body.context.slice(0, 6000) : ''
  const goalTitle = typeof body.goalTitle === 'string' ? body.goalTitle.slice(0, 200) : ''
  const history = parseHistory(body.history)
  if (!message) return Response.json({ error: 'A message is required.' }, { status: 400 })

  const client = new Anthropic({ apiKey })

  const systemPrompt =
    `You are Gobind, the AI mentor living inside the user's personal Vitality dashboard — named for Guru Gobind Singh. ` +
    `You are warm, brutally straightforward, and zero-fluff; one clear point at a time, never generic motivational filler. ` +
    `You speak with the user's own real data, never fabricated numbers. If the data you need isn't in the context provided, ` +
    `say plainly that you don't have it yet instead of guessing. Keep replies short — 2-4 sentences, occasionally a short list. ` +
    `This is informational only, never medical advice, and you never present an estimate as guaranteed. ` +
    `Along with your reply, pick the one mood from the fixed set that best fits its tone — it drives your own avatar's face.` +
    (goalTitle ? `\n\nThe user's current goal: ${goalTitle}.` : '') +
    (context ? `\n\nReal data pulled from their tiles:\n${context}` : '')

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.text }) as Anthropic.MessageParam),
    { role: 'user', content: message },
  ]

  try {
    const response = await client.messages.parse({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system: systemPrompt,
      output_config: { effort: 'low', format: zodOutputFormat(ReplySchema) },
      messages,
    })

    const parsed = response.parsed_output
    if (!parsed) return Response.json({ error: 'Gobind had nothing to say — try again.' }, { status: 502 })
    return Response.json({ reply: parsed.reply, mood: parsed.mood })
  } catch {
    return Response.json({ error: 'Gobind is unreachable right now — try again in a moment.' }, { status: 502 })
  }
}
