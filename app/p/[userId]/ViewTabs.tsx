'use client'

import { useState, type ReactNode } from 'react'
import styles from '../../profile/profile.module.css'

function c(name: keyof typeof styles): string {
  return styles[name]
}

/**
 * Toggles between the resume-style Profile view and the progress-chart
 * Dashboard view on the public /p/[userId] page. Both are already rendered
 * server-side in the initial HTML (no refetch on switch) — this just shows
 * one and hides the other, same pattern as any tab UI with no routing need.
 */
export default function ViewTabs({ profile, dashboard }: { profile: ReactNode; dashboard: ReactNode }) {
  const [view, setView] = useState<'profile' | 'dashboard'>('profile')

  return (
    <div>
      <div className={c('viewTabs')} role="tablist" aria-label="Profile view">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'profile'}
          className={view === 'profile' ? `${c('viewTab')} ${c('viewTabActive')}` : c('viewTab')}
          onClick={() => setView('profile')}
        >
          Profile
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'dashboard'}
          className={view === 'dashboard' ? `${c('viewTab')} ${c('viewTabActive')}` : c('viewTab')}
          onClick={() => setView('dashboard')}
        >
          Dashboard
        </button>
      </div>
      <div hidden={view !== 'profile'}>{profile}</div>
      <div hidden={view !== 'dashboard'}>{dashboard}</div>
    </div>
  )
}
