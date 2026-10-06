import { useEffect, useState } from 'react'
import { formatWhen } from '../features/booking/when'
import { loadNotices, markNoticesRead, type Notice, type Session } from '../lib/supabase'
import { Button, ErrorBlock, Icon, LoadingBlock } from '../ui'

const groups: { id: string; label: string; kinds: string[] }[] = [
  { id: 'reservations', label: 'Reservations', kinds: ['reservation_reserved', 'reservation_received', 'reservation_moved', 'reservation_cancelled', 'reservation_needs_review', 'reservation_compensated', 'visit_confirmed'] },
  { id: 'payments', label: 'Payments', kinds: ['charge_started', 'payment_confirmed', 'payment_recorded', 'payout_released'] },
  { id: 'calendar', label: 'Calendar', kinds: ['calendar_chosen'] },
  { id: 'account', label: 'Account', kinds: ['application_received', 'partner_applied', 'profile_visible'] },
]

function iconFor(kind: string) {
  if (kind.startsWith('reservation') || kind === 'visit_confirmed' || kind === 'calendar_chosen') return 'calendar'
  if (kind.startsWith('payment') || kind === 'charge_started' || kind === 'payout_released') return 'card'
  if (kind === 'partner_applied') return 'users'
  return 'bell'
}

export function Notifications({
  session,
  go,
  onChange,
}: {
  session: Session
  go: (path: string) => void
  onChange: (unread: number) => void
}) {
  const [rows, setRows] = useState<Notice[]>([])
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  function publish(next: Notice[]) {
    setRows(next)
    onChange(next.filter((item) => !item.read_at).length)
  }

  useEffect(() => {
    let alive = true
    loadNotices(session)
      .then((next) => {
        if (!alive) return
        publish(next)
      })
      .catch((caught: unknown) => {
        if (alive) setError(caught instanceof Error ? caught.message : 'Could not load notifications.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [session])

  const present = groups.filter((group) => rows.some((item) => group.kinds.includes(item.kind)))
  const visible = rows.filter((item) => {
    if (filter === 'all') return true
    return present.find((group) => group.id === filter)?.kinds.includes(item.kind)
  })
  const unread = rows.filter((item) => !item.read_at).length

  async function open(item: Notice) {
    if (!item.read_at) {
      setBusy(true)
      try {
        await markNoticesRead(session, item.id)
        publish(rows.map((row) => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row))
      } catch (caught: unknown) {
        setError(caught instanceof Error ? caught.message : 'Could not mark this notification.')
        setBusy(false)
        return
      }
      setBusy(false)
    }
    if (item.href) go(item.href)
  }

  async function markAll() {
    setBusy(true)
    setError('')
    try {
      await markNoticesRead(session)
      const stamp = new Date().toISOString()
      publish(rows.map((row) => row.read_at ? row : { ...row, read_at: stamp }))
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not mark these notifications.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="page"><LoadingBlock kind="page" text="Loading notifications…" /></div>

  return (
    <div className="page inbox">
      <section className="inbox-hero">
        <div>
          <p className="eyebrow">Your inbox</p>
          <h1>{unread === 0 ? 'You’re up to date' : `${unread} new`}</h1>
          <p>Each notice belongs to this account. Opening one does not mark anyone else’s copy.</p>
        </div>
        {unread > 0 ? <Button kind="primary" disabled={busy} onClick={markAll}>Mark all read</Button> : null}
      </section>
      {error ? <ErrorBlock text={error} /> : null}
      {present.length > 0 ? (
        <div className="inbox-filters" role="tablist" aria-label="Notification groups">
          <button type="button" className={filter === 'all' ? 'chip on' : 'chip'} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
          {present.map((group) => (
            <button key={group.id} type="button" className={filter === group.id ? 'chip on' : 'chip'} aria-pressed={filter === group.id} onClick={() => setFilter(group.id)}>{group.label}</button>
          ))}
        </div>
      ) : null}
      {visible.length === 0 ? (
        <section className="fav-empty">
          <span className="heart-lg" aria-hidden="true"><Icon name="bell" /></span>
          <h2>Nothing in this inbox</h2>
          <p>Reservation, calendar and account notices for this login show up here. Nothing on this page is a review, a point balance, or a made-up payment.</p>
        </section>
      ) : (
        <div className="inbox-list">
          {visible.map((item) => (
            <button key={item.id} type="button" className={item.read_at ? 'notice' : 'notice is-new'} disabled={busy} onClick={() => open(item)}>
              <span className="notice-mark" aria-hidden="true"><Icon name={iconFor(item.kind)} /></span>
              <span>
                <b>{item.title}</b>
                <p>{item.body}</p>
                <time dateTime={item.created_at}>{formatWhen(item.created_at)}</time>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
