'use client'

import { useState } from 'react'
import type { Profile } from '@/lib/tiles/profile'
import { initials } from '@/lib/tiles/profileDerive'
import styles from '../../profile/profile.module.css'

function c(name: keyof typeof styles): string {
  return styles[name]
}

const FOUNDER_FACTS: [keyof Profile, string][] = [
  ['founderEducation', 'Education'],
  ['founderAdjacentKnowledge', 'Adjacent knowledge'],
  ['founderIndustryExperience', 'Industry experience'],
  ['founderPersonalBackground', 'Personal background'],
  ['founderFoundingCommunity', 'Founding community'],
  ['founderTechnicalCapability', 'Technical capability'],
]

/** Same "Founder story" block as the owner's private /profile page
 *  (ProfilePage.tsx), ported to the public share view — visitors should see
 *  it too, not just the owner. Client component only for the photo-broken
 *  fallback (onError needs a handler, page.tsx is a server component). */
export default function FounderStory({ profile }: { profile: Profile }) {
  const p = profile
  const [photoBroken, setPhotoBroken] = useState(false)

  if (!p.founderNarrative && !FOUNDER_FACTS.some(([k]) => p[k])) return null

  return (
    <div className={c('section')}>
      <div className={c('sectionHead')}>Founder story</div>
      <div className={c('founderWrap')}>
        <div className={c('founderPhoto')}>
          {p.founderPhotoUrl && !photoBroken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.founderPhotoUrl}
              alt=""
              className={c('founderPhotoImg')}
              onError={() => setPhotoBroken(true)}
            />
          ) : (
            initials(p.name)
          )}
        </div>
        <div className={c('founderFacts')}>
          {FOUNDER_FACTS.map(([key, label]) =>
            p[key] ? (
              <div key={key} className={c('founderRow')}>
                <span className={c('founderLabel')}>{label}</span>
                <span>{p[key] as string}</span>
              </div>
            ) : null,
          )}
        </div>
      </div>
      {p.founderNarrative && <p className={c('bio')}>{p.founderNarrative}</p>}
    </div>
  )
}
