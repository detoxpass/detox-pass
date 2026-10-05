export type Role = 'client' | 'therapist' | 'admin'

export const therapists = [
  { id: 'sarah', name: 'Sarah Anderson', photo: '/people/sparkle.jpg', price: 100, rating: 4.8, miles: 2.5, tags: ['Deep tissue', 'Hot stone'], gender: 'Female', service: 'Therapy' },
  { id: 'michael', name: 'Michael Chen', photo: '/people/fresh.jpg', price: 100, rating: 4.8, miles: 3.1, tags: ['Sports', 'Therapeutic'], gender: 'Male', service: 'Therapy' },
  { id: 'emma', name: 'Emma Thompson', photo: '/people/nathana.jpg', price: 100, rating: 4.8, miles: 1.8, tags: ['Hot stone', 'Aromatherapy'], gender: 'Female', service: 'Therapy' },
  { id: 'david', name: 'David Rodriguez', photo: '/people/hale.jpg', price: 100, rating: 4.8, miles: 4.2, tags: ['Deep tissue', 'Sports'], gender: 'Male', service: 'Therapy' },
  { id: 'michelle', name: 'Michelle Rose', photo: '/people/naomi.jpg', price: 120, rating: 4.9, miles: 2.5, tags: ['Deep tissue', 'Hot stone'], gender: 'Female', service: 'Mobile' },
]

export const sessions = [
  { code: 'BBF-2025-001', client: 'Johanna Clark', therapist: 'Sarah Anderson', service: 'Hot stone', status: 'Pending', where: 'At business', when: 'August 28th, 2025 - 2:00 p.m.', price: 230, place: 'Boston' },
  { code: 'BBF-2025-002', client: 'Caitlyn King', therapist: 'Fleur Cook', service: 'Quick massage', status: 'Confirmed', where: 'At business', when: 'August 28th, 2025 - 4:00 p.m.', price: 180, place: 'New York' },
  { code: 'BBF-2025-003', client: 'Lulu Meyers', therapist: 'Sara Anderson', service: 'Deep tissue', status: 'Completed', where: 'Mobile', when: 'August 21st, 2025 - 1:00 p.m.', price: 230, place: 'Boston' },
  { code: 'BBF-2025-007', client: 'Freya Browning', therapist: 'Lily-Rose Chedjou', service: 'Hot stone', status: 'Canceled', where: 'At business', when: 'August 14th, 2025 - 2:00 p.m.', price: 120, place: 'Boston' },
]

export const clientNav = [
  { id: 'find', label: 'Find a therapist' },
  { id: 'sessions', label: 'My sessions' },
  { id: 'rewards', label: 'Rewards' },
]

export const therapistNav = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'rewards', label: 'Rewards' },
  { id: 'payments', label: 'Payments' },
]

export const adminNav = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'therapists', label: 'Therapists' },
  { id: 'booking', label: 'Booking' },
  { id: 'financial', label: 'Financial' },
  { id: 'users', label: 'Users' },
  { id: 'gamification', label: 'Gamification' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'docs', label: 'Docs.' },
  { id: 'settings', label: 'Settings' },
]

export function homeOf(role: Role) {
  if (role === 'client') return 'find'
  return 'dashboard'
}
