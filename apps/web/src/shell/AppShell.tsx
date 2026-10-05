import { useState, type ReactNode } from 'react'
import { Header } from './Header'
import { MobileNav } from './MobileNav'
import { navigation, type Role } from './nav'
import { Sidebar } from './Sidebar'
import './shell.css'

export function AppShell({
  role,
  screen,
  name,
  onNavigate,
  onSignOut,
  children,
}: {
  role: Role
  screen: string
  name: string
  onNavigate: (id: string) => void
  onSignOut: () => void
  children: ReactNode
}) {
  const [account, setAccount] = useState(false)
  const items = navigation[role]

  function go(id: string) {
    setAccount(false)
    onNavigate(id)
  }

  return (
    <div className="app-shell">
      <Sidebar items={items} screen={screen} onNavigate={go} />
      <Header
        role={role}
        name={name}
        screen={screen}
        accountOpen={account}
        onToggleAccount={() => setAccount((value) => !value)}
        onCloseAccount={() => setAccount(false)}
        onNavigate={go}
        onSignOut={() => { setAccount(false); onSignOut() }}
      />
      <main className="shell-main">{children}</main>
      <MobileNav items={items} screen={screen} onNavigate={go} />
    </div>
  )
}
