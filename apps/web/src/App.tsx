import { useEffect, useState } from 'react'
import { AgendaManager } from './features/scheduling/Agenda'
import { SchedulePrompt } from './features/scheduling/SchedulePrompt'
import { BookingPanel } from './features/booking/BookingPanel'
import { SessionDetail, SessionList } from './features/booking/Sessions'
import { ServicesScreen, SpecialtiesScreen, CitiesScreen, TherapistEditor, TherapistsScreen, UsersScreen } from './features/catalog/Admin'
import { avatarUrl, completeAuthCallback, displayName, loadProfile, loadSession, roleOf, signOut, type Session } from './lib/supabase'
import { Account } from './screens/Account'
import { DeleteAccount } from './screens/DeleteAccount'
import { Home } from './screens/Home'
import { Login } from './screens/Login'
import { Partners } from './screens/Partners'
import { Professional } from './screens/Professional'
import { AppShell } from './shell/AppShell'
import { allows, homePath, pathFor, screenFromPath, screenTitle, type Role } from './shell/nav'
import { catalog, type ProfessionalRow } from './lib/supabase'
import { EmptyBlock, ErrorBlock, ForbiddenBlock, LoadingBlock } from './ui'

function usePath() {
  const [path, setPath] = useState(() => window.location.pathname)
  useEffect(() => {
    const sync = () => setPath(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  function go(next: string) {
    const url = new URL(next, window.location.origin)
    window.history.pushState(null, '', `${url.pathname}${url.search}`)
    setPath(url.pathname)
    document.querySelector('.shell-scroll')?.scrollTo({ top: 0 })
  }
  return { path, go }
}

export function App() {
  const { path, go } = usePath()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [avatar, setAvatar] = useState('')

  useEffect(() => {
    loadSession().then((next) => {
      setSession(next)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (!session) return
    let alive = true
    loadProfile(session).then((profile) => {
      if (!alive) return
      if (profile.full_name) setProfileName(profile.full_name)
      if (profile.avatar_path) setAvatar(avatarUrl(profile.avatar_path, profile.updated_at))
    }).catch(() => {})
    return () => { alive = false }
  }, [session])

  const role: Role = session ? roleOf(session) : 'client'

  useEffect(() => {
    if (!session) return
    if (path === '/' || path === '/signup' || path === '/recover') go(homePath(role))
  }, [session, path, role])

  function enter() {
    loadSession().then((next) => {
      if (!next) return
      setSession(next)
      go(homePath(roleOf(next)))
    })
  }

  if (path === '/delete-account') return <DeleteAccount />
  if (path === '/auth/callback') {
    return <AuthCallback onDone={(next) => { setSession(next); go(homePath(roleOf(next))) }} />
  }
  if (path === '/partners') return <Partners onEnter={enter} onSignIn={() => go('/')} />
  if (!ready) return null
  if (!session || path === '/' || path === '/signup' || path === '/recover') {
    const initial = path === '/signup' ? 'signup' : path === '/recover' ? 'recover' : 'login'
    return (
      <Login
        initial={initial}
        onEnter={enter}
        onMode={(mode) => go(mode === 'signup' ? '/signup' : mode === 'recover' ? '/recover' : '/')}
        onPartner={() => go('/partners')}
      />
    )
  }

  const screen = screenFromPath(path)
  const title = screen === 'missing' ? 'Not found' : screenTitle(role, screen)

  return (
    <AppShell
      role={role}
      screen={screen}
      name={profileName || displayName(session)}
      avatar={avatar}
      title={title}
      onNavigate={(id) => go(pathFor(role, id))}
      onSignOut={() => { signOut(); setSession(null); setProfileName(''); setAvatar(''); go('/') }}
    >
      {role === 'therapist' ? <SchedulePrompt session={session} /> : null}
      {allows(role, path) ? <Screen path={path} role={role} session={session} go={go} onSession={setSession} onName={setProfileName} onAvatar={setAvatar} /> : <ForbiddenBlock />}
    </AppShell>
  )
}

function AuthCallback({ onDone }: { onDone: (session: Session) => void }) {
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    completeAuthCallback()
      .then((next) => { if (alive) onDone(next) })
      .catch((caught: unknown) => {
        if (alive) setError(caught instanceof Error ? caught.message : 'This link is invalid or expired.')
      })
    return () => { alive = false }
  }, [])
  if (error) return <div className="page"><ErrorBlock text={error} /></div>
  return <div className="page"><LoadingBlock text="Opening your account…" /></div>
}

function Screen({ path, role, session, go, onSession, onName, onAvatar }: {
  path: string
  role: Role
  session: Session
  go: (path: string) => void
  onSession: (session: Session) => void
  onName: (name: string) => void
  onAvatar: (avatar: string) => void
}) {
  if (path === '/account') return <Account session={session} onSession={onSession} onName={onName} onAvatar={onAvatar} />
  if (path === '/find') return <Home session={session} onOpen={(id) => go(`/therapists/${id}`)} />
  if (path.startsWith('/therapists/')) return <TherapistPage session={session} id={path.split('/')[2]} onBack={() => go('/find')} onOpen={(id) => go(`/therapists/${id}`)} onReserved={() => go('/sessions')} />
  if (path === '/sessions') return <SessionList session={session} title="My sessions" hint="Times the calendar confirmed. Payment is not taken here." onOpen={(id) => go(`/sessions/${id}`)} />
  if (path.startsWith('/sessions/')) return <SessionDetail session={session} id={path.split('/')[2]} canChange canRead={false} onBack={() => go('/sessions')} />
  if (path === '/agenda') return (
    <div className="page narrow stack">
      <AgendaManager session={session} />
      <SessionList bare session={session} title="Reservations" hint="Clients book these times. You can see them. The client changes or cancels." onOpen={(id) => go(`/agenda/${id}`)} />
    </div>
  )
  if (path.startsWith('/agenda/')) return <SessionDetail session={session} id={path.split('/')[2]} canChange={false} canRead={false} onBack={() => go('/agenda')} />
  if (path === '/rewards') return <EmptyBlock title="Rewards" text="Points show up only after a confirmed visit. Nothing here is a reward yet." />
  if (path === '/payments') return <EmptyBlock title="Payments" text="There is no payout to release from this account." />
  if (path === '/dashboard') return <Dashboard role={role} go={go} />
  if (path === '/admin') return <Dashboard role={role} go={go} />
  if (path === '/admin/users') return <UsersScreen session={session} />
  if (path === '/admin/therapists') return <TherapistsScreen session={session} onOpen={(id) => go(`/admin/therapists/${id}`)} />
  if (path.startsWith('/admin/therapists/')) return <TherapistEditor session={session} id={path.split('/')[3]} />
  if (path === '/admin/services') return <ServicesScreen session={session} />
  if (path === '/admin/cities') return <CitiesScreen session={session} />
  if (path === '/admin/specialties') return <SpecialtiesScreen session={session} />
  if (path === '/admin/booking') return <SessionList session={session} title="Reservations" hint="Reservations on the platform. Payment is not taken here." onOpen={(id) => go(`/admin/booking/${id}`)} />
  if (path.startsWith('/admin/booking/')) return <SessionDetail session={session} id={path.split('/')[3]} canChange canRead onBack={() => go('/admin/booking')} />
  if (path === '/admin/reviews') return <EmptyBlock title="Reviews" text="Reviews are not a module of Detox Pass." />
  if (path === '/admin/financial') return <EmptyBlock title="Financial" text="Paid, pending and released reports arrive with charging. Nothing here is a payout." />
  if (path === '/favorites') return <EmptyBlock title="Favorites" text="Saved therapists stay on this device from the search page." />
  if (path === '/notifications' || path === '/support' || path === '/admin/gamification' || path === '/admin/docs' || path === '/admin/settings') {
    return <EmptyBlock title={screenTitle(role, screenFromPath(path))} text="There is nothing to show here yet." />
  }
  return <EmptyBlock title="Not found" text="This page is not part of the app." />
}

function Dashboard({ role, go }: { role: Role; go: (path: string) => void }) {
  const links = role === 'admin'
    ? [['/admin/therapists', 'Therapists'], ['/admin/booking', 'Booking'], ['/admin/users', 'Users'], ['/admin/services', 'Services']]
    : [['/agenda', 'Agenda'], ['/rewards', 'Rewards'], ['/payments', 'Payments']]
  return (
    <div className="page">
      <EmptyBlock title="Dashboard" text="Open a section. This page does not invent numbers." />
      <div className="shortcuts">
        {links.map(([href, label]) => <button type="button" key={href} className="text-link" onClick={() => go(href)}>{label}</button>)}
      </div>
    </div>
  )
}

function TherapistPage({ session, id, onBack, onOpen, onReserved }: {
  session: Session
  id: string
  onBack: () => void
  onOpen: (id: string) => void
  onReserved: () => void
}) {
  const [rows, setRows] = useState<ProfessionalRow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loved, setLoved] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('detox-pass-loved') || '[]') as unknown
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    catalog(session)
      .then(setRows)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load this therapist.'))
      .finally(() => setLoading(false))
  }, [session])

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock text={error} />
  const row = rows.find((item) => item.id === id)
  if (!row) return <EmptyBlock title="Therapist not available" text="This professional is inactive or not in the catalog." />
  const offers = (row.professional_services ?? []).flatMap((item) => item.services ? [{
    id: item.services.id,
    name: item.services.name,
    price: item.services.price_cents,
    currency: item.services.currency,
  }] : [])
  const places = (row.professional_cities ?? []).flatMap((item) => item.cities ? [item.cities] : [])
  const therapist = {
    id: row.id,
    name: row.display_name,
    photo: row.portrait_path || '/people/splash.jpg',
    city: places.map((place) => place.name).join(', '),
    offers,
    places,
  }
  const others = rows.filter((item) => item.id !== row.id).map((item) => {
    const nextOffers = (item.professional_services ?? []).flatMap((link) => link.services ? [{
      id: link.services.id,
      name: link.services.name,
      price: link.services.price_cents,
      currency: link.services.currency,
    }] : [])
    const nextPlaces = (item.professional_cities ?? []).flatMap((link) => link.cities ? [link.cities] : [])
    return {
      id: item.id,
      name: item.display_name,
      photo: item.portrait_path || '/people/splash.jpg',
      city: nextPlaces.map((place) => place.name).join(', '),
      offers: nextOffers,
      places: nextPlaces,
    }
  })
  return (
    <Professional
      therapist={therapist}
      others={others}
      loved={loved.includes(row.id)}
      onBack={onBack}
      onOpen={onOpen}
      onToggleLove={() => {
        const next = loved.includes(row.id) ? loved.filter((item) => item !== row.id) : [...loved, row.id]
        localStorage.setItem('detox-pass-loved', JSON.stringify(next))
        setLoved(next)
      }}
      schedule={<BookingPanel session={session} professionalId={row.id} offers={offers} cities={places} mode={row.schedule_mode} onReserved={onReserved} />}
    />
  )
}
