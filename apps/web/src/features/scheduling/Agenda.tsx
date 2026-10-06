import { useEffect, useState } from 'react'
import { loadBookings, type BookingRow, type Session } from '../../lib/supabase'
import { ErrorBlock, LoadingBlock } from '../../ui'
import { CalendarBoard } from './CalendarBoard'

export function AgendaManager({ session, onOpen, onSettings }: {
  session: Session
  onOpen: (id: string) => void
  onSettings: () => void
}) {
  const [rows, setRows] = useState<BookingRow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBookings(session)
      .then(setRows)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the calendar.'))
      .finally(() => setLoading(false))
  }, [session])

  if (loading) return <LoadingBlock text="Loading your calendar…" />
  if (error) return <ErrorBlock text={error} />

  return (
    <div className="stack">
      <div className="agenda-toolbar">
        <p>Reservations that started here. Each color is the calendar that received it.</p>
        <button type="button" onClick={onSettings}>Calendar settings</button>
      </div>
      <CalendarBoard bookings={rows} onOpen={onOpen} />
    </div>
  )
}
