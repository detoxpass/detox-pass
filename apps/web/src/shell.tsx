import { useState, type ReactNode } from 'react'
import { adminNav, clientNav, therapistNav, type Role } from './data'
import { Icon, Logo } from './ui'

const menus: Record<Role, { id: string; label: string }[]> = {
  client: clientNav,
  therapist: therapistNav,
  admin: adminNav,
}

export function Shell({
  role,
  screen,
  name,
  onNavigate,
  onSignOut,
  onSwitchAccount,
  children,
}: {
  role: Role
  screen: string
  name: string
  onNavigate: (id: string) => void
  onSignOut: () => void
  onSwitchAccount: () => void
  children: ReactNode
}) {
  const [account, setAccount] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const items = menus[role]

  const switchLabel = role === 'admin' ? 'Switch to client' : 'Switch to admin'

  function go(id: string) {
    setDrawer(false)
    setAccount(false)
    onNavigate(id)
  }

  function switchAccount() {
    setDrawer(false)
    setAccount(false)
    onSwitchAccount()
  }

  return (
    <div className="app-shell">
      <header className="top">
        <Logo />
        <nav className="desk-nav" aria-label="Primary">
          {items.map((item) => (
            <button key={item.id} type="button" className={screen === item.id ? 'on' : ''} onClick={() => go(item.id)}>
              {item.id === 'rewards' ? <Icon name="trophy" /> : null}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="top-tools">
          {role === 'client' ? (
            <>
              <button type="button" aria-label="Referral" onClick={() => go('rewards')}><Icon name="gift" /></button>
              <button type="button" aria-label="Favorites" onClick={() => go('favorites')}><Icon name="heart" /></button>
            </>
          ) : null}
          <button type="button" aria-label="Notifications" className={screen === 'notifications' ? 'on' : ''} onClick={() => go('notifications')}><Icon name="bell" /></button>
          <button type="button" className="who" aria-expanded={account} aria-haspopup="menu" onClick={() => { setAccount((value) => !value); setDrawer(false) }}>
            {role === 'admin' ? <span className="avatar">BB</span> : <img src={role === 'therapist' ? '/people/sparkle.jpg' : '/people/arena.jpg'} alt="" />}
            <span className="who-name">{name}</span>
          </button>
          <button type="button" className="burger" aria-label={drawer ? 'Close menu' : 'Open menu'} aria-expanded={drawer} onClick={() => { setDrawer((value) => !value); setAccount(false) }}>
            <Icon name={drawer ? 'close' : 'menu'} />
          </button>
          {account ? (
            <>
              <button type="button" className="menu-scrim" aria-label="Close account menu" onClick={() => setAccount(false)} />
              <div className="menu" role="menu">
                <button type="button" onClick={() => go('profile')}>View profile</button>
                <button type="button" onClick={() => go('support')}>Support</button>
                <button type="button" onClick={switchAccount}>{switchLabel}</button>
                <button type="button" onClick={() => { setAccount(false); onSignOut() }}>Sign out</button>
              </div>
            </>
          ) : null}
        </div>
      </header>
      {drawer ? (
        <div className="drawer-scrim" onClick={() => setDrawer(false)}>
          <aside className="drawer" aria-label="Menu" onClick={(event) => event.stopPropagation()}>
            <p>{name}</p>
            {items.map((item) => (
              <button key={item.id} type="button" className={screen === item.id ? 'on' : ''} onClick={() => go(item.id)}>
                {item.id === 'rewards' ? <Icon name="trophy" /> : null}
                {item.label}
              </button>
            ))}
            <button type="button" className={screen === 'profile' ? 'on' : ''} onClick={() => go('profile')}>View profile</button>
            <button type="button" className={screen === 'support' ? 'on' : ''} onClick={() => go('support')}>Support</button>
            <button type="button" className={screen === 'notifications' ? 'on' : ''} onClick={() => go('notifications')}>Notifications</button>
            <button type="button" onClick={switchAccount}>{switchLabel}</button>
            <button type="button" onClick={() => { setDrawer(false); onSignOut() }}>Sign out</button>
          </aside>
        </div>
      ) : null}
      <main>{children}</main>
    </div>
  )
}
