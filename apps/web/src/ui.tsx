import type { ReactNode } from 'react'

export function Logo({ onDark = true }: { onDark?: boolean }) {
  return <img className="logo" src={onDark ? '/brand/logo-white.png' : '/brand/logo-black.png'} alt="Detox Pass" />
}

export function Icon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (name === 'search') return <svg {...common}><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
  if (name === 'chat') return <svg {...common}><path d="M6 16.5 4 20l4.2-1.4A8 8 0 1 0 6 16.5Z" /></svg>
  if (name === 'mic') return <svg {...common}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v3" /></svg>
  if (name === 'arrow') return <svg {...common}><path d="M12 19V6M7 11l5-5 5 5" /></svg>
  if (name === 'stop') return <svg {...common}><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" /></svg>
  if (name === 'camera') return <svg {...common}><path d="M8 7.5 9.2 5.5h5.6L16 7.5h2.2A1.8 1.8 0 0 1 20 9.3v7.4a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 16.7V9.3a1.8 1.8 0 0 1 1.8-1.8H8Z" /><circle cx="12" cy="12.2" r="3" /></svg>
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
  if (name === 'grid') return <svg {...common}><rect x="4" y="4" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" /></svg>
  if (name === 'card') return <svg {...common}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></svg>
  if (name === 'users') return <svg {...common}><circle cx="9" cy="9" r="2.4" /><path d="M5 17c.5-2.2 2-3.4 4-3.4s3.5 1.2 4 3.4" /><circle cx="16" cy="9.5" r="2" /><path d="M15 13.8c1.6.2 2.8 1.2 3.3 3.2" /></svg>
  if (name === 'file') return <svg {...common}><path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" /><path d="M14 3.5V8h4.5" /></svg>
  if (name === 'settings') return <svg {...common}><path d="M10.2 3.8h3.6l.5 2a6.4 6.4 0 0 1 1.5.9l1.9-.9 2.5 2.5-.9 1.9c.4.5.7 1 .9 1.5l2 .5v3.6l-2 .5a6.4 6.4 0 0 1-.9 1.5l.9 1.9-2.5 2.5-1.9-.9a6.4 6.4 0 0 1-1.5.9l-.5 2H10.2l-.5-2a6.4 6.4 0 0 1-1.5-.9l-1.9.9-2.5-2.5.9-1.9a6.4 6.4 0 0 1-.9-1.5l-2-.5V10.2l2-.5c.2-.5.5-1 .9-1.5l-.9-1.9 2.5-2.5 1.9.9c.5-.4 1-.7 1.5-.9l.5-2Z" /><circle cx="12" cy="12" r="2.4" /></svg>
  if (name === 'more') return <svg {...common}><circle cx="6" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="18" cy="12" r="1.2" fill="currentColor" /></svg>
  if (name === 'rate') return <svg {...common}><path d="m12 3.5 2.2 4.6 5 .7-3.6 3.5.9 5.1L12 15.2 7.5 17.4l.9-5.1L4.8 8.8l5-.7L12 3.5Z" /></svg>
  return null
}

export function Button({ children, kind = 'primary', onClick, type = 'button', disabled = false, busy = false }: { children: ReactNode; kind?: 'primary' | 'ghost' | 'soft'; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; busy?: boolean }) {
  return (
    <button type={type} className={`btn ${kind}${busy ? ' is-busy' : ''}`} onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy ? <span className="spin" aria-hidden="true" /> : null}
      {children}
    </button>
  )
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

export type SkeletonKind = 'page' | 'cards' | 'rows' | 'desk' | 'dash' | 'profile' | 'detail' | 'form' | 'account' | 'board' | 'calendar' | 'times' | 'chat' | 'typing' | 'boot'

export function LoadingBlock({ text = 'Loading…', kind = 'page' }: { text?: string; kind?: SkeletonKind }) {
  return (
    <div className={`sk sk-${kind}`} role="status" aria-live="polite" aria-busy="true">
      <span className="sr">{text}</span>
      {kind === 'boot' ? <BootMark /> : null}
      {kind === 'page' || kind === 'desk' ? <HeadBones /> : null}
      {kind === 'cards' ? <CardBones count={6} /> : null}
      {kind === 'rows' || kind === 'page' ? <RowBones count={5} /> : null}
      {kind === 'desk' ? <><QueueBones count={7} /><RowBones count={3} /></> : null}
      {kind === 'dash' ? <><MetricBones /><RowBones count={3} /></> : null}
      {kind === 'profile' ? <ProfileBones /> : null}
      {kind === 'detail' ? <DetailBones /> : null}
      {kind === 'form' ? <FormBones /> : null}
      {kind === 'account' ? <AccountBones /> : null}
      {kind === 'board' ? <BoardBones /> : null}
      {kind === 'calendar' ? <CalendarBones /> : null}
      {kind === 'times' ? <TimeBones /> : null}
      {kind === 'chat' ? <ChatBones /> : null}
      {kind === 'typing' ? <TypingBones /> : null}
    </div>
  )
}

function BootMark() {
  return (
    <>
      <img src="/brand/logo-black.png" alt="" />
      <span className="bone boot-bar" />
    </>
  )
}

function HeadBones() {
  return (
    <div className="sk-head">
      <span className="bone w-36 h-28" />
      <span className="bone w-62 h-14" />
    </div>
  )
}

function CardBones({ count }: { count: number }) {
  return (
    <div className="sk-cards">
      {Array.from({ length: count }, (_, index) => (
        <article className="sk-card" key={index}>
          <span className="bone sk-photo" />
          <span className="bone w-62 h-16" />
          <span className="bone w-36 h-12" />
          <span className="sk-pills"><span className="bone" /><span className="bone" /></span>
        </article>
      ))}
    </div>
  )
}

function RowBones({ count }: { count: number }) {
  return (
    <div className="sk-rows">
      {Array.from({ length: count }, (_, index) => (
        <div className="sk-row" key={index}>
          <span className="bone sk-when" />
          <span className="sk-lines">
            <span className="bone w-46 h-16" />
            <span className="bone w-72 h-12" />
          </span>
          <span className="bone sk-pill" />
        </div>
      ))}
    </div>
  )
}

function QueueBones({ count }: { count: number }) {
  return (
    <div className="sk-queues">
      {Array.from({ length: count }, (_, index) => (
        <div className="sk-queue" key={index}>
          <span className="bone w-28 h-28" />
          <span className="bone w-80 h-12" />
        </div>
      ))}
    </div>
  )
}

function MetricBones() {
  return (
    <div className="sk-metrics">
      {Array.from({ length: 4 }, (_, index) => (
        <div className="sk-metric" key={index}>
          <span className="bone w-40 h-12" />
          <span className="bone w-28 h-32" />
          <span className="bone w-70 h-12" />
        </div>
      ))}
    </div>
  )
}

function ProfileBones() {
  return (
    <div className="sk-profile">
      <span className="bone sk-portrait" />
      <div className="sk-lines">
        <span className="bone w-28 h-12" />
        <span className="bone w-70 h-40" />
        <span className="bone w-36 h-22" />
        <span className="bone sk-field" />
        <span className="bone sk-field" />
        <span className="bone sk-field" />
      </div>
    </div>
  )
}

function DetailBones() {
  return (
    <>
      <span className="bone w-24 h-14" />
      <div className="sk-sheet">
        <span className="bone w-46 h-28" />
        <span className="bone w-70 h-14" />
      </div>
      <div className="sk-facts">
        <span className="bone" />
        <span className="bone" />
        <span className="bone" />
      </div>
      <RowBones count={3} />
    </>
  )
}

function FormBones() {
  return (
    <>
      <HeadBones />
      <div className="sk-sheet">
        <span className="bone w-30 h-16" />
        <span className="bone sk-field" />
        <span className="bone sk-field" />
        <span className="bone sk-area" />
        <span className="bone sk-btn" />
      </div>
    </>
  )
}

function AccountBones() {
  return (
    <div className="sk-account">
      <span className="bone sk-avatar" />
      <span className="bone w-46 h-22" />
      <span className="bone w-36 h-12" />
      <div className="sk-sheet">
        <span className="bone w-30 h-16" />
        <span className="bone sk-field" />
        <span className="bone sk-field" />
        <span className="bone sk-btn" />
      </div>
      <div className="sk-sheet">
        <span className="bone w-30 h-16" />
        <span className="bone sk-field" />
        <span className="bone sk-field" />
      </div>
    </div>
  )
}

function BoardBones() {
  return (
    <div className="sk-sheet">
      <div className="sk-board-head">
        <span className="bone w-36 h-22" />
        <span className="bone sk-btn" />
      </div>
      <div className="sk-cal tall">
        {Array.from({ length: 35 }, (_, index) => <span className="bone" key={index} />)}
      </div>
    </div>
  )
}

function CalendarBones() {
  return (
    <div className="sk-cal">
      {Array.from({ length: 35 }, (_, index) => <span className="bone" key={index} />)}
    </div>
  )
}

function TimeBones() {
  return (
    <div className="sk-times">
      {Array.from({ length: 6 }, (_, index) => <span className="bone" key={index} />)}
    </div>
  )
}

function ChatBones() {
  return (
    <div className="sk-chat">
      <div className="sk-bubble"><span className="bone w-90" /><span className="bone w-58" /></div>
      <div className="sk-bubble me"><span className="bone w-64" /></div>
      <div className="sk-bubble"><span className="bone w-80" /><span className="bone w-42" /></div>
    </div>
  )
}

function TypingBones() {
  return (
    <div className="sk-bubble">
      <span className="bone w-80" />
      <span className="bone w-48" />
    </div>
  )
}

export function EmptyBlock({ title, text }: { title: string; text: string }) {
  return <section className="state"><h2>{title}</h2><p>{text}</p></section>
}

export function ErrorBlock({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <section className="state bad" role="alert">
      <h2>Something went wrong</h2>
      <p>{text}</p>
      {onRetry ? <Button kind="ghost" onClick={onRetry}>Try again</Button> : null}
    </section>
  )
}

export function ForbiddenBlock() {
  return <section className="state"><h2>You can’t open this</h2><p>This page belongs to another role.</p></section>
}

export function PendingBlock({ text }: { text: string }) {
  return <section className="state pending"><h2>Calendar not connected</h2><p>{text}</p></section>
}

export function Notice({ text }: { text: string }) {
  return <p className="notice" role="status">{text}</p>
}

const sagaLabels: Record<string, { label: string; tone: string }> = {
  intent: { label: 'Checking', tone: 'pending' },
  provider_confirmed: { label: 'Reserved', tone: 'confirmed' },
  cancelled: { label: 'Cancelled', tone: 'canceled' },
  compensation_required: { label: 'Needs review', tone: 'pending' },
  charge_created: { label: 'Charge started', tone: 'pending' },
  paid: { label: 'Paid', tone: 'completed' },
  payout_released: { label: 'Released', tone: 'completed' },
}

export function SagaStatus({ status }: { status: string }) {
  const known = sagaLabels[status]
  return <span className={`status-pill ${known?.tone ?? 'pending'}`}>{known?.label ?? status.replaceAll('_', ' ')}</span>
}
