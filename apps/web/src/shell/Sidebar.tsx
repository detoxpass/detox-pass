import { Icon, Logo } from '../ui'
import type { NavItem } from './nav'

export function Sidebar({
  items,
  screen,
  onNavigate,
}: {
  items: NavItem[]
  screen: string
  onNavigate: (id: string) => void
}) {
  return (
    <aside className="shell-side" aria-label="Primary">
      <Logo />
      <nav>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={screen === item.id ? 'on' : ''}
            aria-current={screen === item.id ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
