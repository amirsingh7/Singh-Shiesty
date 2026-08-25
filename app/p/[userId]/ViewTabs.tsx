'use client'

import { useState, type ReactNode } from 'react'
import styles from '../../profile/profile.module.css'

function c(name: keyof typeof styles): string {
  return styles[name]
}

/**
 * Toggles between the resume-style Profile view, the equation-board view
 * (labeled "Tiles"), and the progress-chart Dashboard view on the public
 * /p/[userId] page. All three are already rendered server-side/client-mounted
 * in the initial HTML (no refetch on switch) — this just shows one and hides
 * the others, same pattern as any tab UI with no routing need.
 */
export default function ViewTabs({ profile, dashboard, board }: { profile: ReactNode; dashboard: ReactNode; board: ReactNode }) {
  const [view, setView] = useState<'profile' | 'board' | 'dashboard'>('profile')

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
          aria-selected={view === 'board'}
          className={view === 'board' ? `${c('viewTab')} ${c('viewTabActive')}` : c('viewTab')}
          onClick={() => setView('board')}
        >
          Tiles
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
      <div hidden={view !== 'board'}>{board}</div>
      <div hidden={view !== 'dashboard'}>{dashboard}</div>
    </div>
  )
}
