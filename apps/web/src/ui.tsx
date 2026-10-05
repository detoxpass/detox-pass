import type { ReactNode } from 'react'

export function Logo({ onDark = true }: { onDark?: boolean }) {
  return <img className="logo" src={onDark ? '/brand/logo-white.png' : '/brand/logo-black.png'} alt="Detox Pass" />
}

export function Icon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (name === 'search') return <svg {...common}><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
  if (name === 'bell') return <svg {...common}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.2 1.5H4.8L6 16Z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>
  if (name === 'heart') return <svg {...common}><path d="M12 19s-7-4.2-7-8.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 14.8 12 19 12 19Z" /></svg>
  if (name === 'gift') return <svg {...common}><rect x="4" y="10" width="16" height="9" rx="1.5" /><path d="M12 10v9M4 14h16M12 10c-2-4-6-3-6-1s4 1 6 1 6-4 6-1-4 1-6 1Z" /></svg>
  if (name === 'trophy') return <svg {...common}><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M9 20h6M12 14v6" /></svg>
  if (name === 'pin') return <svg {...common}><path d="M12 21s6-5 6-10a6 6 0 1 0-12 0c0 5 6 10 6 10Z" /><circle cx="12" cy="11" r="1.5" /></svg>
  if (name === 'star') return <svg width="14" height="14" viewBox="0 0 24 24" fill="#f5b942"><path d="m12 3 2.6 5.4 6 .9-4.3 4.2 1 6L12 16.8 6.7 19.5l1-6L3.4 9.3l6-.9L12 3Z" /></svg>
  if (name === 'back') return <svg {...common}><path d="M15 6 9 12l6 6" /></svg>
  if (name === 'close') return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>
  if (name === 'plus') return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
  if (name === 'calendar') return <svg {...common}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3.5V7M16 3.5V7M4 10h16" /></svg>
  if (name === 'eye') return <svg {...common}><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></svg>
  if (name === 'menu') return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
  return null
}

export function Button({ children, kind = 'primary', onClick, type = 'button' }: { children: ReactNode; kind?: 'primary' | 'ghost' | 'soft'; onClick?: () => void; type?: 'button' | 'submit' }) {
  return <button type={type} className={`btn ${kind}`} onClick={onClick}>{children}</button>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>
}

export function Modal({ title, text, confirm, onClose, onConfirm }: { title: string; text: string; confirm: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()} role="dialog">
        <button type="button" className="modal-x" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        <span className="warn-badge">!</span>
        <h2>{title}</h2>
        <p>{text}</p>
        <Button onClick={onConfirm}>{confirm}</Button>
        <button type="button" className="btn ghost full" onClick={onClose}>No, cancel</button>
      </div>
    </div>
  )
}

export function PageHead({ title, text, onBack, back }: { title: string; text?: string; onBack?: () => void; back?: string }) {
  return (
    <header className="page-head">
      {onBack ? <button type="button" className="back" onClick={onBack}><Icon name="back" /> {back ?? 'Back'}</button> : null}
      <h1>{title}</h1>
      {text ? <p>{text}</p> : null}
    </header>
  )
}

export function Status({ value }: { value: string }) {
  return <span className={`status-pill ${value.toLowerCase()}`}>{value}</span>
}
