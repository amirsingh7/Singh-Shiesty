import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
// zodOutputFormat expects zod's v4 API — zod 3.25+ ships a 'zod/v4' compatibility
// submodule for exactly this, distinct from the plain 'zod' (v3) import used
// elsewhere in this repo (e.g. app/api/mcp for MCP tool schemas).
import { z } from 'zod/v4'
import { supabaseServer } from '@/lib/auth/supabaseServer'

/**
 * The one route in this app that calls an external AI API — a deliberate,
 * scoped exception to the base's "no AI keys in the app, ever" rule (see
 * CLAUDE.md's house rules), made specifically for Phase 6's credibility
 * review. Everywhere else in this app, intelligence runs in Claude Code and
 * the app only renders data already written; this route exists because a
 * flagged self-reported PR needs a plausibility read for EVERY signed-up
 * user, not just when the owner happens to be chatting with Claude Code.
 *
 * Owner-authenticated only (session cookie via supabaseServer) — this is not
 * a public endpoint like app/api/witness/[userId]/route.ts. A stranger with
 * a profile link can never trigger a paid API call; only the signed-in owner
 * clicks "Ask AI" on their own flagged entries.
 *
 * Deliberately does NOT write to tile_data itself — it returns the verdict,
 * and the caller (ProfilePage.tsx) merges + persists it via aiReview.ts's
 * local+cloud pattern, same shape as the evidence-upload flow.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ReviewSchema = z.object({
  verdict: z.enum(['plausible', 'uncertain', 'implausible']),
  reasoning: z.string().max(280),
})

interface HistoryPoint {
  date: string
  w: number
  r: number
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function parseHistory(v: unknown): HistoryPoint[] {
  if (!Array.isArray(v)) return []
  const out: HistoryPoint[] = []
  for (const row of v) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const w = num(r.w)
    const reps = num(r.r)
    const date = typeof r.date === 'string' ? r.date : ''
    if (w === undefined || reps === undefined || !date) continue
    out.push({ date, w, r: reps })
  }
  return out.slice(0, 100)
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'AI review needs an Anthropic API key configured on this deployment.' }, { status: 503 })
  }

  const c = await supabaseServer()
  if (!c) return Response.json({ error: 'supabase_not_configured' }, { status: 503 })
  const {
    data: { user },
  } = await c.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body must be JSON.' }, { status: 400 })
  }

  const liftId = typeof body.liftId === 'string' ? body.liftId : ''
  const liftName = typeof body.liftName === 'string' ? body.liftName : liftId
  const entryRaw = body.entry as Record<string, unknown> | undefined
  const date = entryRaw && typeof entryRaw.date === 'string' ? entryRaw.date : ''
  const w = entryRaw ? num(entryRaw.w) : undefined
  const r = entryRaw ? num(entryRaw.r) : undefined
  if (!liftId || !date || w === undefined || r === undefined) {
    return Response.json({ error: 'liftId and a complete entry (date, w, r) are required.' }, { status: 400 })
  }
  const history = parseHistory(body.history).filter((h) => h.date <= date)

  const client = new Anthropic({ apiKey })
  const historyLines = history.length
    ? history.map((h) => `- ${h.date}: ${h.w}kg × ${h.r}`).join('\n')
    : '(no prior entries on file for this lift)'

  try {
    const response = await client.messages.parse({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      output_config: { effort: 'low', format: zodOutputFormat(ReviewSchema) },
      messages: [
        {
          role: 'user',
          content:
            `You are reviewing one self-reported strength-training personal record for plausibility. ` +
            `This is an informational read only — never a block, never a certification. Be generous: ` +
            `real single-session PRs of 10-25% do happen, especially for newer lifters or after a long break. ` +
            `Only call something "implausible" if the jump is extreme relative to the lifter's own trend.\n\n` +
            `Lift: ${liftName}\n` +
            `Prior logged history (oldest first):\n${historyLines}\n\n` +
            `Entry being reviewed: ${date}: ${w}kg × ${r}\n\n` +
            `Give a one-sentence, plain-language reason a lifter could read without feeling accused.`,
        },
      ],
    })

    const parsed = response.parsed_output
    if (!parsed) return Response.json({ error: 'AI review returned no result.' }, { status: 502 })
    return Response.json({ verdict: parsed.verdict, reasoning: parsed.reasoning })
  } catch {
    return Response.json({ error: 'AI review failed — try again in a moment.' }, { status: 502 })
  }
}
