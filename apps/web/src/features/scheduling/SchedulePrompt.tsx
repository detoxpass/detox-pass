import { useEffect, useState } from 'react'
import { loadMySchedule, setScheduleChoice, type Session } from '../../lib/supabase'
import { Button } from '../../ui'

export function SchedulePrompt({ session }: { session: Session }) {
  const [open, setOpen] = useState(false)
  const [dismiss, setDismiss] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    loadMySchedule(session)
      .then((rows) => {
        if (!alive) return
        const row = rows[0]
        setOpen(Boolean(row && !row.schedule_mode && !row.schedule_prompt_dismissed))
      })
      .catch(() => { if (alive) setOpen(false) })
    return () => { alive = false }
  }, [session])

  if (!open) return null

  async function choose(mode: 'internal' | 'external' | null) {
    if (!mode && !dismiss) {
      setError('Choose a calendar, or mark do not show again.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await setScheduleChoice(session, mode, dismiss || mode != null)
      setOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the choice.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="schedule-choice-title">
      <div className="modal">
        <h2 id="schedule-choice-title">Choose your calendar</h2>
        <p>Each professional keeps their own calendar. Detox Pass does not share one login across the team.</p>
        <p>Internal keeps the openings on Detox Pass. You publish the weekly hours, and clients book those times.</p>
        <p>Square is connected from Agenda. Sign in with Square there. Acuity, Wix, Zenoti, and Mindbody stay on the list and are not connected from this screen yet.</p>
        <label className="check-row">
          <input type="checkbox" checked={dismiss} onChange={(event) => setDismiss(event.target.checked)} />
          Do not show this again
        </label>
        {error ? <p className="muted">{error}</p> : null}
        <Button disabled={busy} onClick={() => choose('internal')}>Use Detox Pass calendar</Button>
        <Button kind="ghost" disabled={busy} onClick={async () => {
          setBusy(true)
          setError('')
          try {
            await setScheduleChoice(session, null, true)
            setOpen(false)
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Could not save the choice.')
          } finally {
            setBusy(false)
          }
        }}>Connect Square on Agenda</Button>
        <Button kind="ghost" disabled={busy || !dismiss} onClick={() => choose(null)}>Continue without choosing</Button>
      </div>
    </div>
  )
}
