import { useEffect, useState, type FormEvent } from 'react'
import { recover, signIn, signUp, supabaseConfigured } from '../lib/supabase'
import { Button, Field, Logo } from '../ui'

type Mode = 'login' | 'signup' | 'recover' | 'sent'

export function Login({ onEnter, initial = 'login', onMode }: { onEnter: () => void; initial?: Mode; onMode?: (mode: Mode) => void }) {
  const [mode, setMode] = useState<Mode>(initial)
  useEffect(() => { setMode(initial) }, [initial])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      if (mode === 'recover') {
        await recover(email)
        setMode('sent')
        return
      }
      if (mode === 'signup') {
        const result = await signUp(email, password)
        if (result.confirm) {
          setMode('sent')
          return
        }
      } else {
        await signIn(email, password)
      }
      onEnter()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in failed.')
    } finally {
      setPending(false)
    }
  }

  const configured = supabaseConfigured

  return (
    <div className="auth">
      <aside>
        <Logo />
        <h1>DETOX<br />PASS<span>.</span></h1>
      </aside>
      <section>
        <form className={`card-form ${error ? 'invalid' : ''}`} onSubmit={submit}>
          {configured ? null : <p className="error">This deploy is missing the Supabase environment variables.</p>}
          {mode === 'sent' ? (
            <>
              <h2>Check your email</h2>
              <p>If the address is valid, the next step is in your inbox.</p>
              <button type="button" className="btn ghost full" onClick={() => setMode('login')}>Back to sign in</button>
            </>
          ) : null}
          {mode === 'login' || mode === 'signup' ? (
            <>
              <h2>{mode === 'login' ? 'Welcome back!' : 'Create your account'}</h2>
              <p>{mode === 'login' ? 'Sign in to your account to continue.' : 'Use the email you want on Detox Pass.'}</p>
              <Field label="Email">
                <input className={error ? 'bad' : ''} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter your email address" required />
              </Field>
              <Field label="Password">
                <input className={error ? 'bad' : ''} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" minLength={8} required />
              </Field>
              {error ? <p className="error">{error}</p> : null}
              {mode === 'login' ? (
                <div className="row-between">
                  <span />
                  <button type="button" className="link" onClick={() => { setError(''); setMode('recover'); onMode?.('recover') }}>Forgot your password?</button>
                </div>
              ) : null}
              <Button type="submit">{pending ? 'Please wait' : mode === 'login' ? 'Sign in' : 'Create account'}</Button>
              {mode === 'login' ? (
                <p className="center">Don't have an account yet? <button type="button" className="link" onClick={() => { setError(''); setMode('signup'); onMode?.('signup') }}>Sign up</button></p>
              ) : (
                <p className="center">Already have an account? <button type="button" className="link" onClick={() => { setError(''); setMode('login'); onMode?.('login') }}>Sign in</button></p>
              )}
            </>
          ) : null}
          {mode === 'recover' ? (
            <>
              <h2>Password recovery</h2>
              <p>Enter your email address and we'll send you a recovery link.</p>
              <Field label="Email">
                <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter your email address" required />
              </Field>
              {error ? <p className="error">{error}</p> : null}
              <Button type="submit">{pending ? 'Please wait' : 'Send recovery link'}</Button>
              <button type="button" className="btn ghost full" onClick={() => { setError(''); setMode('login') }}>Cancel</button>
            </>
          ) : null}
        </form>
      </section>
    </div>
  )
}
