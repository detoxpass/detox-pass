import { useEffect, useState } from 'react'
import { avatarUrl, displayName, loadProfile, loadSession, roleOf, signOut, type Session } from './lib/supabase'
import { Account } from './screens/Account'
import { Area } from './screens/Area'
import { DeleteAccount } from './screens/DeleteAccount'
import { Home } from './screens/Home'
import { Login } from './screens/Login'
import { AppShell } from './shell/AppShell'
import { homeOf, screenTitle, type Role } from './shell/nav'

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [role, setRole] = useState<Role>('client')
  const [screen, setScreen] = useState('find')
  const [profileName, setProfileName] = useState('')
  const [avatar, setAvatar] = useState('')

  useEffect(() => {
    loadSession().then((next) => {
      if (next) {
        const current = roleOf(next)
        setSession(next)
        setRole(current)
        setScreen(homeOf(current))
      }
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

  function enter() {
    loadSession().then((next) => {
      if (!next) return
      const current = roleOf(next)
      setSession(next)
      setRole(current)
      setScreen(homeOf(current))
    })
  }

  if (window.location.pathname === '/delete-account') return <DeleteAccount />
  if (!ready) return null
  if (!session) return <Login onEnter={enter} />

  const label = screenTitle(role, screen)

  return (
    <AppShell
      role={role}
      screen={screen}
      name={profileName || displayName(session)}
      avatar={avatar}
      title={label}
      onNavigate={setScreen}
      onSignOut={() => { signOut(); setSession(null); setProfileName(''); setAvatar(''); setScreen('find') }}
    >
      {screen === 'profile' ? (
        <Account session={session} onSession={setSession} onName={setProfileName} onAvatar={setAvatar} />
      ) : role === 'client' && screen === 'find' ? <Home session={session} /> : <Area title={label} />}
    </AppShell>
  )
}
