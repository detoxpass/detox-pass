import { useEffect, useState, type FormEvent } from 'react'
import { callFunction, loadMyPaymentSetup, loadPaymentSetup, type PaymentSetup, type Session } from '../../lib/supabase'
import { Button, ErrorBlock, Field, LoadingBlock, Notice } from '../../ui'

const labels: Record<PaymentSetup['setup_status'], string> = {
  not_configured: 'Not configured',
  pending: 'Pending',
  ready: 'Ready',
  error: 'Error',
}

export function PaymentSetupScreen({ session }: { session: Session }) {
  const [setup, setSetup] = useState<PaymentSetup | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  function reload() {
    setLoading(true)
    loadMyPaymentSetup(session)
      .then((row) => setSetup(row))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load payment setup.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [session])

  async function saveBank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (!setup?.professional_id) throw new Error('Payment setup is not configured.')
      await callFunction(session, 'gusto-bank-account-sync', {
        professional_id: setup.professional_id,
        name: String(form.get('account_name') || ''),
        routing_number: String(form.get('routing_number') || ''),
        account_number: String(form.get('account_number') || ''),
        account_type: String(form.get('account_type') || 'Checking'),
      })
      event.currentTarget.reset()
      setNotice('Payment setup is not configured.')
      reload()
    } catch (caught) {
      event.currentTarget.reset()
      setError(caught instanceof Error ? caught.message : 'Could not save the bank account.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="page"><LoadingBlock kind="form" text="Loading payment setup…" /></div>
  if (error && !setup) return <div className="page"><ErrorBlock text={error} onRetry={reload} /></div>

  return (
    <div className="page stack">
      <PaymentSetupCard setup={setup} />
      <form className="account-card" onSubmit={saveBank} autoComplete="off">
        <h2>Bank account</h2>
        <p className="muted">These details are sent only when payment setup is turned on. They are not saved in Detox Pass.</p>
        <Field label="Account name"><input name="account_name" autoComplete="off" required /></Field>
        <Field label="Routing number"><input name="routing_number" inputMode="numeric" autoComplete="off" required /></Field>
        <Field label="Account number"><input name="account_number" inputMode="numeric" autoComplete="off" required /></Field>
        <Field label="Account type">
          <select name="account_type" defaultValue="Checking">
            <option>Checking</option>
            <option>Savings</option>
          </select>
        </Field>
        <Field label="Tax identifier">
          <input inputMode="numeric" autoComplete="off" placeholder="Not sent or stored" />
        </Field>
        <Button type="submit" disabled={busy} busy={busy}>Save payment details</Button>
      </form>
      {notice ? <Notice text={notice} /> : null}
      {error ? <ErrorBlock text={error} /> : null}
    </div>
  )
}

export function PaymentSetupCard({ session, professionalId, setup }: {
  session?: Session
  professionalId?: string
  setup?: PaymentSetup | null
}) {
  const [row, setRow] = useState<PaymentSetup | null>(setup ?? null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (setup) {
      setRow(setup)
      return
    }
    if (!session || !professionalId) return
    let alive = true
    loadPaymentSetup(session, professionalId)
      .then((next) => { if (alive) setRow(next) })
      .catch((caught: unknown) => { if (alive) setError(caught instanceof Error ? caught.message : 'Could not load payment setup.') })
    return () => { alive = false }
  }, [session, professionalId, setup])

  if (error) return <p className="muted">{error}</p>
  if (!row) return null
  return (
    <section className="account-card">
      <h2>Payment setup</h2>
      <p><strong>{labels[row.setup_status] || 'Not configured'}</strong></p>
      <p className="muted">Bank account: {row.bank_account_configured ? (row.bank_account_display || 'Added') : 'Not added'}</p>
      <p className="muted">Last sync: {row.last_sync_at ? new Date(row.last_sync_at).toLocaleString() : '—'}</p>
      {row.last_error ? <p className="muted">{row.last_error}</p> : null}
    </section>
  )
}
