import { Icon, Logo } from '../ui'
import type { Role } from './nav'

export function Header({
  role,
  name,
  screen,
  accountOpen,
  onToggleAccount,
  onCloseAccount,
  onNavigate,
  onSignOut,
}: {
  role: Role
  name: string
  screen: string
  accountOpen: boolean
  onToggleAccount: () => void
  onCloseAccount: () => void
  onNavigate: (id: string) => void
  onSignOut: () => void
}) {
  return (
    <header className="shell-header">
      <Logo />
      <div className="shell-tools">
        {role === 'client' ? (
          <>
            <button type="button" aria-label="Referral" onClick={() => onNavigate('rewards')}><Icon name="gift" /></button>
            <button type="button" aria-label="Favorites" className={screen === 'favorites' ? 'on' : ''} onClick={() => onNavigate('favorites')}><Icon name="heart" /></button>
          </>
        ) : null}
        <button type="button" aria-label="Notifications" className={screen === 'notifications' ? 'on' : ''} onClick={() => onNavigate('notifications')}><Icon name="bell" /></button>
        <button type="button" className="who" aria-expanded={accountOpen} aria-haspopup="menu" onClick={onToggleAccount}>
          <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
          <span className="who-name">{name}</span>
        </button>
        {accountOpen ? (
          <>
            <button type="button" className="menu-scrim" aria-label="Close account menu" onClick={onCloseAccount} />
            <div className="menu" role="menu">
              <button type="button" onClick={() => onNavigate('profile')}>View profile</button>
              <button type="button" onClick={() => onNavigate('support')}>Support</button>
              <button type="button" onClick={onSignOut}>Sign out</button>
            </div>
          </>
        ) : null}
      </div>
    </header>
  )
}
