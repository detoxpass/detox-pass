import { useEffect, useState } from 'react'
import { displayName, loadSession, roleOf, signOut, type Session } from './lib/supabase'
import { Area } from './screens/Area'
import { Home } from './screens/Home'
import { Login } from './screens/Login'
import { AppShell } from './shell/AppShell'
import { homeOf, navigation, type Role } from './shell/nav'

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [role, setRole] = useState<Role>('client')
  const [screen, setScreen] = useState('find')

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

  function enter() {
    loadSession().then((next) => {
      if (!next) return
      const current = roleOf(next)
      setSession(next)
      setRole(current)
      setScreen(homeOf(current))
    })
  }

  if (!ready) return null
  if (!session) return <Login onEnter={enter} />

  const label = navigation[role].find((item) => item.id === screen)?.label ?? 'Detox Pass'

  return (
    <AppShell
      role={role}
      screen={screen}
      name={displayName(session)}
      onNavigate={setScreen}
      onSignOut={() => { signOut(); setSession(null); setScreen('find') }}
    >
      {role === 'client' && screen === 'find' ? <Home session={session} /> : <Area title={label} />}
    </AppShell>
  )
}
