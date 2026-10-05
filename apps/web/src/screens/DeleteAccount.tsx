import { useEffect, useState, type FormEvent } from 'react'
import { deleteOwnAccount, loadSession, signIn, type Session } from '../lib/supabase'
import { Logo } from '../ui'

export function DeleteAccount() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    loadSession().then((next) => {
      setSession(next)
      setReady(true)
    })
  }, [])

  async function enter(event: FormEvent) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      const next = await signIn(email, password)
      setSession(next)
      setPassword('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in failed.')
    } finally {
      setPending(false)
    }
  }

  async function remove(event: FormEvent) {
    event.preventDefault()
    if (!session?.user.email) return
    setError('')
    if (confirm.trim().toLowerCase() !== session.user.email.toLowerCase()) {
      setError('Type the email on this account to confirm.')
      return
    }
    setPending(true)
    try {
      await deleteOwnAccount(session)
      setSession(null)
      setDone(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the account.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="delete-page">
      <section className="delete-card">
        <div className="account-brand"><Logo onDark={false} /></div>
        <h1>Delete account</h1>
        <p>This permanently removes the sign-in and the profile stored for this account, including the profile photo. This page stays public so the request can be made from here.</p>
        {done ? (
          <p className="account-note">This account has been deleted. <a href="/">Back to Detox Pass</a></p>
        ) : !ready ? (
          <p className="hint">Loading the account.</p>
        ) : session ? (
          <form onSubmit={remove}>
            <p className="delete-email">{session.user.email}</p>
            <label className="field">
              Type your email to confirm
              <input value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" required />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button type="submit" className="account-delete" disabled={pending}>{pending ? 'Deleting' : 'Delete account'}</button>
          </form>
        ) : (
          <form onSubmit={enter}>
            <p className="hint">Sign in to confirm the deletion of your own account.</p>
            <label className="field">
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </label>
            <label className="field">
              Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button type="submit" className="btn full" disabled={pending}>{pending ? 'Please wait' : 'Sign in'}</button>
          </form>
        )}
      </section>
    </main>
  )
}
