import { useEffect, useState } from 'react'
import { Entry } from './features/entry/Entry'
import { TermsAdmin } from './features/catalog/TermsAdmin'
import { AgendaManager } from './features/scheduling/Agenda'
import { Integrations } from './features/scheduling/Integrations'
import { BookingPanel } from './features/booking/BookingPanel'
import { SessionDetail, SessionList } from './features/booking/Sessions'
import { ServicesScreen, SpecialtiesScreen, CitiesScreen, TherapistEditor, TherapistsScreen, UsersScreen } from './features/catalog/Admin'
import { AdminHome, CalendarsScreen, ClientEditor, ClientsScreen, MoneyScreen, PeopleHub, RewardsScreen } from './features/catalog/AdminDesk'
import { avatarUrl, completeAuthCallback, displayName, loadEntryState, loadProfile, loadSession, loadUnreadCount, roleOf, signOut, type Session } from './lib/supabase'
import { readLoved, writeLoved } from './lib/loved'
import { Account } from './screens/Account'
import { Chat } from './screens/Chat'
import { DeleteAccount } from './screens/DeleteAccount'
import { Favorites } from './screens/Favorites'
import { Home } from './screens/Home'
import { Login } from './screens/Login'
import { Notifications } from './screens/Notifications'
import { Partners } from './screens/Partners'
import { Professional } from './screens/Professional'
import { AppShell } from './shell/AppShell'
import { allows, homePath, pathFor, screenFromPath, screenTitle, type Role } from './shell/nav'
import { catalog, type ProfessionalRow } from './lib/supabase'
import { PartnerHome } from './features/home/PartnerHome'
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
  const [unread, setUnread] = useState(0)
  const [hold, setHold] = useState<boolean | null>(null)

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
    if (!session || role !== 'therapist') {
      setHold(false)
      return
    }
    let alive = true
    loadEntryState(session)
      .then((state) => { if (alive) setHold(Boolean(state.applies && state.step)) })
      .catch(() => { if (alive) setHold(false) })
    return () => { alive = false }
  }, [session, role, path])

  useEffect(() => {
    if (!session) return
    if (path === '/' || path === '/signup' || path === '/recover') go(homePath(role))
  }, [session, path, role])

  useEffect(() => {
    if (!session) {
      setUnread(0)
      return
    }
    let alive = true
    loadUnreadCount(session).then((count) => {
      if (alive) setUnread(count)
    }).catch(() => {})
    return () => { alive = false }
  }, [session, path])

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
  if (!ready) return <LoadingBlock kind="boot" text="Opening your account…" />
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

  if (role === 'therapist' && hold === null) return <LoadingBlock kind="boot" text="Opening your account…" />
  if (role === 'therapist' && hold) return <Entry session={session} onDone={() => setHold(false)} />

  return (
    <AppShell
      role={role}
      screen={screen}
      name={profileName || displayName(session)}
      avatar={avatar}
      title={title}
      unread={unread}
      onNavigate={(id) => go(pathFor(role, id))}
      onSignOut={() => { signOut(); setSession(null); setProfileName(''); setAvatar(''); go('/') }}
    >
      {allows(role, path) ? <Screen path={path} role={role} session={session} go={go} onSession={setSession} onName={setProfileName} onAvatar={setAvatar} onUnread={setUnread} /> : <ForbiddenBlock />}
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
  return <LoadingBlock kind="boot" text="Opening your account…" />
}

function Screen({ path, role, session, go, onSession, onName, onAvatar, onUnread }: {
  path: string
  role: Role
  session: Session
  go: (path: string) => void
  onSession: (session: Session) => void
  onName: (name: string) => void
  onAvatar: (avatar: string) => void
  onUnread: (count: number) => void
}) {
  if (path === '/account') return <Account session={session} onSession={onSession} onName={onName} onAvatar={onAvatar} />
  if (path === '/find') return <Home session={session} onOpen={(id) => go(`/therapists/${id}`)} />
  if (path === '/chat') return <Chat session={session} go={go} />
  if (path.startsWith('/therapists/')) return <TherapistPage session={session} id={path.split('/')[2]} onBack={() => go('/find')} onOpen={(id) => go(`/therapists/${id}`)} onReserved={() => go('/sessions')} />
  if (path === '/sessions') return <SessionList session={session} title="My sessions" hint="Times the calendar confirmed. Payment is not taken here." onOpen={(id) => go(`/sessions/${id}`)} />
  if (path.startsWith('/sessions/')) return <SessionDetail session={session} id={path.split('/')[2]} canChange canRead={false} onBack={() => go('/sessions')} />
  if (path === '/agenda') return (
    <div className="page agenda-page">
      <AgendaManager session={session} onOpen={(id) => go(`/agenda/${id}`)} onSettings={() => go('/integrations')} />
      <SessionList bare session={session} title="Reservations" hint="Clients book these times. You can see them. The client changes or cancels." onOpen={(id) => go(`/agenda/${id}`)} />
    </div>
  )
  if (path === '/integrations') return <div className="page"><Integrations session={session} /></div>
  if (path.startsWith('/agenda/')) return <SessionDetail session={session} id={path.split('/')[2]} canChange={false} canRead={false} onBack={() => go('/agenda')} />
  if (path === '/rewards') return <EmptyBlock title="Rewards" text="Points show up only after a confirmed visit. Nothing here is a reward yet." />
  if (path === '/payments') return <EmptyBlock title="Payments" text="There is no payout to release from this account." />
  if (path === '/dashboard') return <PartnerHome session={session} go={go} />
  if (path === '/admin') return <AdminHome session={session} go={go} />
  if (path === '/admin/people') return <PeopleHub go={go} />
  if (path === '/admin/users') return <UsersScreen session={session} />
  if (path === '/admin/clients') return <ClientsScreen session={session} onOpen={(id) => go(`/admin/clients/${id}`)} />
  if (path.startsWith('/admin/clients/')) return <ClientEditor session={session} id={path.split('/')[3]} />
  if (path === '/admin/therapists') return <TherapistsScreen session={session} onOpen={(id) => go(`/admin/therapists/${id}`)} />
  if (path.startsWith('/admin/therapists/')) return <TherapistEditor session={session} id={path.split('/')[3]} />
  if (path === '/admin/services') return <ServicesScreen session={session} />
  if (path === '/admin/cities') return <CitiesScreen session={session} />
  if (path === '/admin/specialties') return <SpecialtiesScreen session={session} />
  if (path === '/admin/calendars') return <CalendarsScreen session={session} onOpen={(id) => go(`/admin/therapists/${id}`)} />
  if (path === '/admin/booking') return <SessionList ops session={session} title="Reservations" hint="Reservations on the platform. The client changes or cancels. This desk does not." onOpen={(id) => go(`/admin/booking/${id}${window.location.search}`)} />
  if (path.startsWith('/admin/booking/')) return <SessionDetail ops session={session} id={path.split('/')[3]} canChange={false} canRead onBack={() => go(`/admin/booking${window.location.search}`)} />
  if (path === '/admin/reviews') return <EmptyBlock title="Reviews" text="Reviews are not a module of Detox Pass." />
  if (path === '/admin/financial' || path === '/admin/settings') return <MoneyScreen session={session} />
  if (path === '/favorites') return <Favorites session={session} onOpen={role === 'client' ? (id) => go(`/therapists/${id}`) : undefined} onFind={role === 'client' ? () => go('/find') : undefined} />
  if (path === '/notifications') return <Notifications session={session} go={go} onChange={onUnread} />
  if (path === '/admin/terms') return <TermsAdmin session={session} onOpen={(id) => go(`/admin/therapists/${id}`)} />
  if (path === '/admin/gamification') return <RewardsScreen session={session} onOpen={(id) => go(`/admin/booking/${id}`)} />
  if (path === '/support' || path === '/admin/docs') {
    return <EmptyBlock title={screenTitle(role, screenFromPath(path))} text="There is nothing to show here yet." />
  }
  return <EmptyBlock title="Not found" text="This page is not part of the app." />
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
  const [loved, setLoved] = useState<string[]>(readLoved)

  useEffect(() => {
    catalog(session)
      .then(setRows)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load this therapist.'))
      .finally(() => setLoading(false))
  }, [session])

  if (loading) return <div className="page"><LoadingBlock kind="profile" text="Loading this therapist…" /></div>
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
        writeLoved(next)
        setLoved(next)
      }}
      schedule={<BookingPanel session={session} professionalId={row.id} name={row.display_name} photo={row.portrait_path || '/people/splash.jpg'} minutes={row.slot_minutes} offers={offers} cities={places} onReserved={onReserved} />}
    />
  )
}
