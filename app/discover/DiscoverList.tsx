'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import styles from './discover.module.css'

export interface DirectoryEntry {
  userId: string
  name: string
  username?: string
  photoUrl?: string
  location?: string
  schoolOrGym?: string
  headline?: string
  topLiftName: string | null
  topLiftKg: number | null
  topLiftDisplay: string | null
  avatarFallback: string
}

function c(name: keyof typeof styles): string {
  return styles[name]
}

export default function DiscoverList({ entries }: { entries: DirectoryEntry[] }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = q
      ? entries.filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            e.username?.toLowerCase().includes(q) ||
            e.schoolOrGym?.toLowerCase().includes(q) ||
            e.location?.toLowerCase().includes(q),
        )
      : entries
    // Heaviest top lift first; profiles with no logged tier-1 lift yet sink to the bottom.
    return [...matched].sort((a, b) => (b.topLiftKg ?? -1) - (a.topLiftKg ?? -1))
  }, [entries, query])

  return (
    <main className={c('wrap')}>
      <h1 className={c('title')}>Discover</h1>
      <p className={c('subtitle')}>Public profiles that opted into the directory, sorted by best lift.</p>

      <input
        className="input"
        placeholder="Search by name, school, or location…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {filtered.length === 0 ? (
        <p className={c('empty')}>
          {entries.length === 0
            ? 'No one has opted into the directory yet.'
            : 'No profiles match that search.'}
        </p>
      ) : (
        <div className={c('grid')}>
          {filtered.map((e) => (
            <Link key={e.userId} href={`/p/${e.userId}`} className={c('card')}>
              <div className={c('avatar')}>
                {e.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.photoUrl} alt="" className={c('avatarImg')} />
                ) : (
                  e.avatarFallback
                )}
              </div>
              <div className={c('info')}>
                <div className={c('name')}>{e.name}</div>
                {(e.schoolOrGym || e.location) && (
                  <div className={c('meta')}>{[e.schoolOrGym, e.location].filter(Boolean).join(' · ')}</div>
                )}
                {e.headline && <div className={c('headline')}>{e.headline}</div>}
              </div>
              {e.topLiftDisplay && (
                <div className={c('topLift')}>
                  <div className={c('topLiftVal')}>{e.topLiftDisplay}</div>
                  <div className={c('topLiftName')}>{e.topLiftName}</div>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
