import { Icon, Logo } from '../ui'
import type { NavItem } from './nav'

export function Sidebar({
  items,
  screen,
  collapsed,
  onToggle,
  onNavigate,
}: {
  items: NavItem[]
  screen: string
  collapsed: boolean
  onToggle: () => void
  onNavigate: (id: string) => void
}) {
  return (
    <aside className="shell-side" aria-label="Primary">
      <Logo onDark={false} />
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
      <button type="button" className="shell-collapse" aria-expanded={!collapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onToggle}>
        <Icon name="back" />
        <span>{collapsed ? 'Expand' : 'Collapse'}</span>
      </button>
    </aside>
  )
}
