import { useState } from 'react'
import { Icon } from '../ui'
import { mobileItems, type NavItem } from './nav'

export function MobileNav({
  items,
  screen,
  onNavigate,
}: {
  items: NavItem[]
  screen: string
  onNavigate: (id: string) => void
}) {
  const { bar, more } = mobileItems(items)
  const [open, setOpen] = useState(false)
  const moreCurrent = more.some((item) => item.id === screen)

  function go(id: string) {
    setOpen(false)
    onNavigate(id)
  }

  return (
    <nav className="shell-nav" aria-label="Primary">
      {open ? <button type="button" className="shell-more-scrim" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      {open ? (
        <div className="shell-more" role="menu">
          {more.map((item) => (
            <button key={item.id} type="button" className={screen === item.id ? 'on' : ''} onClick={() => go(item.id)}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      {bar.map((item) => (
        <button
          key={item.id}
          type="button"
          className={screen === item.id ? 'on' : ''}
          aria-current={screen === item.id ? 'page' : undefined}
          onClick={() => go(item.id)}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </button>
      ))}
      {more.length > 0 ? (
        <button type="button" className={open || moreCurrent ? 'on' : ''} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <Icon name={open ? 'close' : 'more'} />
          <span>More</span>
        </button>
      ) : null}
    </nav>
  )
}
