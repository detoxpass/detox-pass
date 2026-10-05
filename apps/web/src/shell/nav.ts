export type Role = 'client' | 'therapist' | 'admin'

export function homeOf(role: Role) {
  return role === 'client' ? 'find' : 'dashboard'
}

export type NavItem = {
  id: string
  label: string
  icon: string
}

export const navigation: Record<Role, NavItem[]> = {
  client: [
    { id: 'find', label: 'Find a therapist', icon: 'search' },
    { id: 'sessions', label: 'My sessions', icon: 'calendar' },
    { id: 'rewards', label: 'Rewards', icon: 'trophy' },
  ],
  therapist: [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { id: 'agenda', label: 'Agenda', icon: 'calendar' },
    { id: 'rewards', label: 'Rewards', icon: 'trophy' },
    { id: 'payments', label: 'Payments', icon: 'card' },
  ],
  admin: [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { id: 'therapists', label: 'Therapists', icon: 'users' },
    { id: 'booking', label: 'Booking', icon: 'calendar' },
    { id: 'financial', label: 'Financial', icon: 'card' },
    { id: 'users', label: 'Users', icon: 'users' },
    { id: 'gamification', label: 'Gamification', icon: 'trophy' },
    { id: 'reviews', label: 'Reviews', icon: 'rate' },
    { id: 'docs', label: 'Docs', icon: 'file' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ],
}

export function mobileItems(items: NavItem[]) {
  if (items.length <= 4) return { bar: items, more: [] as NavItem[] }
  return { bar: items.slice(0, 4), more: items.slice(4) }
}
