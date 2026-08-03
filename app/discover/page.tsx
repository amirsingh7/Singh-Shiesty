import { supabaseAdmin } from '@/lib/auth/supabaseAdmin'
import type { Profile } from '@/lib/tiles/profile'
import { allLifts, bestOf, combinedHistory, wDisp, initials, type TrainSplit } from '@/lib/tiles/profileDerive'
import type { CompetitionRecord } from '@/lib/tiles/competitions'
import type { EvidenceRecord } from '@/lib/tiles/evidence'
import type { WitnessRecord } from '@/lib/tiles/witnesses'
import DiscoverList, { type DirectoryEntry } from './DiscoverList'

/**
 * The public directory — every profile that's both `visibility === 'public'`
 * AND opted into `listed` (see lib/tiles/profile.ts). Distinct from
 * /p/[userId]: that page needs the exact link (plus a token, if private);
 * this page is how someone finds a profile with NO link at all. Same posture
 * as /p/[userId] — no login required, service-role client, re-checked live
 * on every request (a flip to unlisted has to take effect immediately).
 */
export const dynamic = 'force-dynamic'

/** A profile's single heaviest tier-1 compound lift, whatever it happens to
 *  be (squat, bench, an overhead press, anything) — deliberately not a fixed
 *  squat/bench/deadlift assumption, matching the same "never a fixed lift
 *  set" philosophy competitions.ts already documents. Reuses the exact same
 *  bestOf()/combinedHistory() a profile's own Featured PRs are built from, so
 *  the number shown here always matches what that profile itself shows. */
function topLift(
  split: TrainSplit | null,
  competitions: CompetitionRecord[],
  evidence: EvidenceRecord[],
  witnesses: WitnessRecord[],
): { name: string; weightKg: number } | null {
  let best: { name: string; weightKg: number } | null = null
  for (const lift of allLifts(split)) {
    if (lift.tier !== 1 || lift.hidden) continue
    const entry = bestOf(combinedHistory(lift, competitions, evidence, witnesses))
    if (entry && (!best || entry.w > best.weightKg)) best = { name: lift.name, weightKg: entry.w }
  }
  return best
}

export default async function DiscoverPage() {
  const admin = supabaseAdmin()
  if (!admin) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="hint">The directory needs Supabase configured first.</p>
      </main>
    )
  }

  const { data: profileRows } = await admin
    .from('tile_data')
    .select('user_id, data')
    .eq('tile_id', 'profile')
    .contains('data', { listed: true, visibility: 'public' })

  const listed = (profileRows ?? []) as { user_id: string; data: Profile }[]

  let entries: DirectoryEntry[] = []
  if (listed.length) {
    const userIds = listed.map((r) => r.user_id)
    const trainKeys = userIds.map((id) => `${id}:train`)
    const { data: dataRows } = await admin
      .from('tile_data')
      .select('user_id, tile_id, data')
      .in('user_id', userIds)
      .in('tile_id', [...trainKeys, 'competitions', 'evidence', 'witnesses'])

    const rows = (dataRows ?? []) as { user_id: string; tile_id: string; data: unknown }[]

    entries = listed.map(({ user_id, data: p }) => {
      const trainRaw = rows.find((r) => r.user_id === user_id && r.tile_id === `${user_id}:train`)?.data as
        | Record<string, unknown>
        | undefined
      let split: TrainSplit | null = null
      let unit: 'kg' | 'lb' = 'kg'
      if (trainRaw) {
        const rawUnit = trainRaw['vitality.logger.unit']
        if (rawUnit === 'kg' || rawUnit === 'lb') unit = rawUnit
        const raw = trainRaw['vitality.logger.v4']
        if (typeof raw === 'string' && raw) {
          try {
            const parsed = JSON.parse(raw)
            if (parsed && Array.isArray(parsed.days)) split = parsed
          } catch {
            /* no train data to show */
          }
        }
      }
      const competitions = (rows.find((r) => r.user_id === user_id && r.tile_id === 'competitions')?.data ??
        []) as CompetitionRecord[]
      const evidence = (rows.find((r) => r.user_id === user_id && r.tile_id === 'evidence')?.data ?? []) as EvidenceRecord[]
      const witnesses = (rows.find((r) => r.user_id === user_id && r.tile_id === 'witnesses')?.data ?? []) as WitnessRecord[]

      const best = topLift(split, competitions, evidence, witnesses)

      return {
        userId: user_id,
        name: p.name || 'Unnamed lifter',
        username: p.username,
        photoUrl: p.photoUrl,
        location: p.location,
        schoolOrGym: p.schoolOrGym,
        headline: p.headline,
        topLiftName: best?.name ?? null,
        topLiftKg: best?.weightKg ?? null,
        topLiftDisplay: best ? `${wDisp(best.weightKg, unit)} ${unit}` : null,
        avatarFallback: initials(p.name),
      } satisfies DirectoryEntry
    })
  }

  return <DiscoverList entries={entries} />
}
