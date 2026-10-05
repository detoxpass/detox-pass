import { useState } from 'react'
import type { Role } from '../data'
import { Button, Field, Logo } from '../ui'

const roles: { id: Role; label: string }[] = [
  { id: 'client', label: 'Costumer' },
  { id: 'therapist', label: 'Therapist' },
  { id: 'admin', label: 'Admin' },
]

export function Auth({
  role,
  mode,
  step,
  onRole,
  onMode,
  onStep,
  onEnter,
  onSystem,
}: {
  role: Role
  mode: 'login' | 'error' | 'signup' | 'recover' | 'reset'
  step: number
  onRole: (role: Role) => void
  onMode: (mode: 'login' | 'error' | 'signup' | 'recover' | 'reset') => void
  onStep: (step: number) => void
  onEnter: () => void
  onSystem: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function signIn() {
    if (!email.includes('@') || password.length < 4) {
      onMode('error')
      return
    }
    onEnter()
  }

  return (
    <div className="auth">
      <aside>
        <Logo />
        <h1>BRAZILIAN<br />BEAUTY<br />FORMULA<span>.</span></h1>
      </aside>
      <section>
        <form className={`card-form ${mode === 'error' ? 'invalid' : ''}`} onSubmit={(event) => { event.preventDefault(); if (mode === 'login' || mode === 'error') signIn(); else if (mode === 'signup' && step === 6) onEnter(); else if (mode === 'signup' && step === 4) onStep(6); else if (mode === 'signup') onStep(step + 1); else if (mode === 'recover') onMode('reset'); else onMode('login') }}>
          {mode === 'login' || mode === 'error' ? (
            <>
              <div className="role-row">
                {roles.map((item) => (
                  <button key={item.id} type="button" className={role === item.id ? 'on' : ''} onClick={() => onRole(item.id)}>{item.label}</button>
                ))}
              </div>
              <h2>Welcome back!</h2>
              <p>Sign in to your account to continue.</p>
              <Field label="Email">
                <input className={mode === 'error' ? 'bad' : ''} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter your email address" />
              </Field>
              <Field label="Password">
                <input className={mode === 'error' ? 'bad' : ''} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" />
              </Field>
              {mode === 'error' ? <p className="error">Invalid email or password. Please try again.</p> : null}
              <div className="row-between">
                <label className="check"><input type="checkbox" /> Remember me</label>
                <button type="button" className="link" onClick={() => onMode('recover')}>Forgot your password?</button>
              </div>
              <Button type="submit">Sign in</Button>
              <p className="center">Don't have an account yet? <button type="button" className="link" onClick={() => { onMode('signup'); onStep(1) }}>Sign up</button></p>
            </>
          ) : null}
          {mode === 'signup' ? <Signup step={step} onBack={() => step === 6 ? onStep(4) : step === 1 ? onMode('login') : onStep(step - 1)} onLogin={() => onMode('login')} /> : null}
          {mode === 'recover' ? (
            <>
              <h2>Password recovery</h2>
              <p>Enter your email address and we'll send you a recovery code.</p>
              <p>Enter your recovery email below</p>
              <Field label="Email"><input placeholder="Enter your email address" required /></Field>
              <p className="center">Didn't receive the link? <button type="button" className="link">Resend</button></p>
              <Button type="submit">Send recovery link</Button>
              <button type="button" className="btn ghost full" onClick={() => onMode('login')}>Cancel</button>
              <p className="center">Remember your password? <button type="button" className="link" onClick={() => onMode('login')}>Sign in</button></p>
            </>
          ) : null}
          {mode === 'reset' ? (
            <>
              <h2>Reset password</h2>
              <p>Enter a strong password to secure your account.</p>
              <Field label="New password"><input type="password" placeholder="Insert your new password" required /></Field>
              <Field label="Confirm password"><input type="password" placeholder="Confirm your password" required /></Field>
              <Button type="submit">Update password</Button>
              <button type="button" className="btn ghost full" onClick={() => onMode('login')}>Cancel</button>
              <p className="center">Remember your password? <button type="button" className="link" onClick={() => onMode('login')}>Sign in</button></p>
            </>
          ) : null}
        </form>
        <button type="button" className="system-link" onClick={onSystem}>Design system</button>
      </section>
    </div>
  )
}

function Signup({ step, onBack, onLogin }: { step: number; onBack: () => void; onLogin: () => void }) {
  const label = step === 6 ? '06' : `0${step}`
  return (
    <>
      <p className="kicker">Step {label} of 06</p>
      {step === 1 ? (
        <>
          <h2>Let's get started</h2>
          <p>Tell us a bit about yourself.</p>
          <Field label="Full name"><input placeholder="Enter your full name" required /></Field>
          <Field label="Email"><input placeholder="Enter your email address" required /></Field>
          <Field label="Date of birth"><input placeholder="MM/DD/YYYY" required /></Field>
          <Field label="Gender (optional)"><select defaultValue=""><option value="">Select your gender</option><option>Female</option><option>Male</option></select></Field>
          <Field label="Phone number"><input placeholder="(1) 0000-0000" /></Field>
        </>
      ) : null}
      {step === 2 ? (
        <>
          <h2>Almost there</h2>
          <p>Add your contact details and create a secure password.</p>
          <Field label="Email"><input placeholder="Email" required /></Field>
        </>
      ) : null}
      {step === 3 ? (
        <>
          <h2>Verification</h2>
          <p>We've sent a verification code to your email.</p>
          <span>Secure code</span>
          <div className="code">
            <input defaultValue="1" aria-label="Digit 1" />
            <input defaultValue="0" aria-label="Digit 2" />
            <input defaultValue="0" aria-label="Digit 3" />
            <input defaultValue="0" aria-label="Digit 4" />
          </div>
          <p className="center">Didn't receive the code? <button type="button" className="link">Resend</button></p>
        </>
      ) : null}
      {step === 4 ? (
        <>
          <h2>Password</h2>
          <p>Create a secure password.</p>
          <Field label="Password"><input type="password" placeholder="Create a strong password" required /></Field>
          <p className="hint">At least 8 characters: Include uppercase and lowercase letters, one number and one special character.</p>
          <Field label="Confirm password"><input type="password" placeholder="Confirm your password" required /></Field>
          <label className="check"><input type="checkbox" defaultChecked /> I agree to the Terms of Service and Privacy Policy</label>
        </>
      ) : null}
      {step === 6 ? (
        <>
          <h2>Referral code</h2>
          <p>If someone referred the platform, insert the code below.</p>
          <Field label="Referral code"><input defaultValue="BBF01234" /></Field>
        </>
      ) : null}
      {step === 2 || step === 3 ? (
        <div className="split-actions">
          <button type="button" className="btn ghost" onClick={onBack}>Previous</button>
          <Button type="submit">Next</Button>
        </div>
      ) : (
        <Button type="submit">{step === 6 ? 'Send registration' : 'Next'}</Button>
      )}
      <p className="center">Already have an account? <button type="button" className="link" onClick={onLogin}>Sign in</button></p>
    </>
  )
}

export function System({ onBack }: { onBack: () => void }) {
  return (
    <div className="system">
      <header className="system-top">
        <Logo />
        <button type="button" className="link" onClick={onBack}>Back to sign in</button>
      </header>
      <h1>Design system</h1>
      <p>Tokens taken from the Detox Pass logotype and the BBF prototype. Pink action is #ffb9b9. The header is black. PASS in the mark is pink.</p>
      <div className="swatches">
        <i style={{ background: '#111' }}><b>#111</b></i>
        <i style={{ background: '#ffb9b9' }}><b>#ffb9b9</b></i>
        <i style={{ background: '#fff3f3' }}><b>#fff3f3</b></i>
        <i style={{ background: '#fff', border: '1px solid #eee' }}><b>#fff</b></i>
        <i style={{ background: '#f5b942' }}><b>#f5b942</b></i>
      </div>
      <div className="row-gap">
        <button type="button" className="btn primary">Sign in</button>
        <button type="button" className="btn ghost">Previous</button>
        <button type="button" className="btn soft">Apply filters</button>
      </div>
      <label className="field"><span>Email</span><input placeholder="Enter your email address" /></label>
      <div className="row-gap">
        <span className="status-pill completed">Completed</span>
        <span className="status-pill confirmed">Confirmed</span>
        <span className="status-pill pending">Pending</span>
        <span className="status-pill canceled">Canceled</span>
      </div>
    </div>
  )
}
