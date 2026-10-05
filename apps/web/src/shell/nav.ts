export type Role = 'client' | 'therapist' | 'admin'

export function homePath(role: Role) {
  if (role === 'admin') return '/admin'
  if (role === 'therapist') return '/dashboard'
  return '/find'
}

export type NavItem = {
  id: string
  label: string
  icon: string
  path: string
}

export const navigation: Record<Role, NavItem[]> = {
  client: [
    { id: 'find', label: 'Find a therapist', icon: 'search', path: '/find' },
    { id: 'sessions', label: 'My sessions', icon: 'calendar', path: '/sessions' },
    { id: 'rewards', label: 'Rewards', icon: 'trophy', path: '/rewards' },
  ],
  therapist: [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid', path: '/dashboard' },
    { id: 'agenda', label: 'Agenda', icon: 'calendar', path: '/agenda' },
    { id: 'rewards', label: 'Rewards', icon: 'trophy', path: '/rewards' },
    { id: 'payments', label: 'Payments', icon: 'card', path: '/payments' },
  ],
  admin: [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid', path: '/admin' },
    { id: 'therapists', label: 'Therapists', icon: 'users', path: '/admin/therapists' },
    { id: 'booking', label: 'Booking', icon: 'calendar', path: '/admin/booking' },
    { id: 'financial', label: 'Financial', icon: 'card', path: '/admin/financial' },
    { id: 'users', label: 'Users', icon: 'users', path: '/admin/users' },
    { id: 'services', label: 'Services', icon: 'file', path: '/admin/services' },
    { id: 'cities', label: 'Cities', icon: 'pin', path: '/admin/cities' },
    { id: 'specialties', label: 'Specialties', icon: 'grid', path: '/admin/specialties' },
    { id: 'gamification', label: 'Gamification', icon: 'trophy', path: '/admin/gamification' },
    { id: 'reviews', label: 'Reviews', icon: 'rate', path: '/admin/reviews' },
    { id: 'docs', label: 'Docs', icon: 'file', path: '/admin/docs' },
    { id: 'settings', label: 'Settings', icon: 'settings', path: '/admin/settings' },
  ],
}

const accountPaths: Record<string, string> = {
  profile: '/account',
  favorites: '/favorites',
  notifications: '/notifications',
  support: '/support',
}

const accountTitles: Record<string, string> = {
  profile: 'Profile',
  favorites: 'Favorites',
  notifications: 'Notifications',
  support: 'Support',
}

export function pathFor(role: Role, id: string) {
  return navigation[role].find((item) => item.id === id)?.path ?? accountPaths[id] ?? homePath(role)
}

export function screenFromPath(path: string) {
  const match = (Object.values(navigation).flat()).find((item) => path === item.path || (item.path !== '/admin' && item.path !== '/find' && path.startsWith(`${item.path}/`)))
  if (match) return match.id
  if (path === '/admin' || path === '/dashboard') return 'dashboard'
  if (path.startsWith('/therapists') || path.startsWith('/find')) return 'find'
  if (path.startsWith('/account')) return 'profile'
  return accountTitles[path.slice(1)] ? path.slice(1) : 'missing'
}

export function screenTitle(role: Role, screen: string) {
  return navigation[role].find((item) => item.id === screen)?.label ?? accountTitles[screen] ?? 'Detox Pass'
}

export function allows(role: Role, path: string) {
  if (path.startsWith('/account') || path.startsWith('/favorites') || path.startsWith('/notifications') || path.startsWith('/support')) return true
  if (path.startsWith('/rewards')) return role === 'client' || role === 'therapist'
  if (path.startsWith('/find') || path.startsWith('/therapists') || path.startsWith('/sessions')) return role === 'client'
  if (path.startsWith('/dashboard') || path.startsWith('/agenda') || path.startsWith('/payments')) return role === 'therapist'
  if (path.startsWith('/admin')) return role === 'admin'
  return false
}

export function mobileItems(items: NavItem[]) {
  if (items.length <= 4) return { bar: items, more: [] as NavItem[] }
  return { bar: items.slice(0, 4), more: items.slice(4) }
}
