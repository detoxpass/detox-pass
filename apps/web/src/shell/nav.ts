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
    { id: 'chat', label: 'Chat', icon: 'chat', path: '/chat' },
    { id: 'sessions', label: 'My sessions', icon: 'calendar', path: '/sessions' },
    { id: 'rewards', label: 'Rewards', icon: 'trophy', path: '/rewards' },
  ],
  therapist: [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid', path: '/dashboard' },
    { id: 'agenda', label: 'Agenda', icon: 'calendar', path: '/agenda' },
    { id: 'integrations', label: 'Integrations', icon: 'grid', path: '/integrations' },
    { id: 'rewards', label: 'Rewards', icon: 'trophy', path: '/rewards' },
    { id: 'payments', label: 'Payments', icon: 'card', path: '/payments' },
  ],
  admin: [
    { id: 'dashboard', label: 'Home', icon: 'grid', path: '/admin' },
    { id: 'therapists', label: 'Professionals', icon: 'users', path: '/admin/therapists' },
    { id: 'clients', label: 'Clients', icon: 'users', path: '/admin/clients' },
    { id: 'users', label: 'Accounts', icon: 'users', path: '/admin/users' },
    { id: 'booking', label: 'Reservations', icon: 'calendar', path: '/admin/booking' },
    { id: 'calendars', label: 'Calendars', icon: 'calendar', path: '/admin/calendars' },
    { id: 'services', label: 'Services', icon: 'file', path: '/admin/services' },
    { id: 'cities', label: 'Cities', icon: 'pin', path: '/admin/cities' },
    { id: 'specialties', label: 'Specialties', icon: 'grid', path: '/admin/specialties' },
    { id: 'financial', label: 'Financial', icon: 'card', path: '/admin/financial' },
    { id: 'settings', label: 'Settings', icon: 'settings', path: '/admin/settings' },
    { id: 'terms', label: 'Terms', icon: 'file', path: '/admin/terms' },
    { id: 'gamification', label: 'Rewards', icon: 'trophy', path: '/admin/gamification' },
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
  chat: 'Chat',
}

export function pathFor(role: Role, id: string) {
  if (role === 'admin' && id === 'people') return '/admin/people'
  return navigation[role].find((item) => item.id === id)?.path ?? accountPaths[id] ?? homePath(role)
}

export function screenFromPath(path: string) {
  const match = (Object.values(navigation).flat()).find((item) => path === item.path || (item.path !== '/admin' && item.path !== '/find' && path.startsWith(`${item.path}/`)))
  if (match) return match.id
  if (path === '/admin' || path === '/dashboard') return 'dashboard'
  if (path === '/admin/people') return 'people'
  if (path.startsWith('/therapists') || path.startsWith('/find')) return 'find'
  if (path.startsWith('/account')) return 'profile'
  return accountTitles[path.slice(1)] ? path.slice(1) : 'missing'
}

export function screenTitle(role: Role, screen: string) {
  if (screen === 'people') return 'People'
  return navigation[role].find((item) => item.id === screen)?.label ?? accountTitles[screen] ?? 'Detox Pass'
}

export function allows(role: Role, path: string) {
  if (path.startsWith('/account') || path.startsWith('/favorites') || path.startsWith('/notifications') || path.startsWith('/support') || path.startsWith('/chat')) return true
  if (path.startsWith('/rewards')) return role === 'client' || role === 'therapist'
  if (path.startsWith('/find') || path.startsWith('/therapists') || path.startsWith('/sessions')) return role === 'client'
  if (path.startsWith('/dashboard') || path.startsWith('/agenda') || path.startsWith('/integrations') || path.startsWith('/payments')) return role === 'therapist'
  if (path.startsWith('/admin')) return role === 'admin'
  return false
}

export function mobileItems(items: NavItem[]) {
  if (items.some((item) => item.path === '/admin')) {
    const pick = (id: string) => items.find((item) => item.id === id)
    const home = pick('dashboard')
    const reservations = pick('booking')
    const financial = pick('financial')
    const people: NavItem = { id: 'people', label: 'People', icon: 'users', path: '/admin/people' }
    const money = financial ? { ...financial, label: 'Money' } : undefined
    const bar = [home, people, reservations, money].filter((item): item is NavItem => Boolean(item))
    const more = items.filter((item) => ['calendars', 'services', 'cities', 'specialties', 'terms', 'gamification'].includes(item.id))
    return { bar, more }
  }
  if (items.length <= 4) return { bar: items, more: [] as NavItem[] }
  return { bar: items.slice(0, 4), more: items.slice(4) }
}
