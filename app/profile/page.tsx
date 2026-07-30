import type { Metadata } from 'next'
import ProfilePage from './ProfilePage'

export const metadata: Metadata = {
  title: 'Profile · PR Portfolio',
}

// The Athletic Profile — a real page (not a sealed tile), so it reads
// profile() and Train's saved data directly instead of going through the
// tile iframe bridge. See app/mentor/ for the sibling full-page pattern.
export default function Page() {
  return <ProfilePage />
}
