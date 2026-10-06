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
  avatar,
  title,
  unread = 0,
  onNavigate,
  onSignOut,
  children,
}: {
  role: Role
  screen: string
  name: string
  avatar?: string
  title: string
  unread?: number
  onNavigate: (id: string) => void
  onSignOut: () => void
  children: ReactNode
}) {
  const [account, setAccount] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const items = navigation[role]

  function go(id: string) {
    setAccount(false)
    onNavigate(id)
  }

  return (
    <div className={collapsed ? 'app-shell is-collapsed' : 'app-shell'}>
      <Sidebar items={items} screen={screen} collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} onNavigate={go} />
      <div className="shell-scroll">
        <Header
          role={role}
          name={name}
          avatar={avatar}
          title={title}
          unread={unread}
          screen={screen}
          accountOpen={account}
          onToggleAccount={() => setAccount((value) => !value)}
          onCloseAccount={() => setAccount(false)}
          onNavigate={go}
          onSignOut={() => { setAccount(false); onSignOut() }}
        />
        <main className="shell-main">{children}</main>
      </div>
      <MobileNav items={items} screen={screen} onNavigate={go} />
    </div>
  )
}
