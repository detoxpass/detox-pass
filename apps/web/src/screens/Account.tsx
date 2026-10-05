import { useEffect, useRef, useState, type FormEvent } from 'react'
import { avatarUrl, changePassword, loadProfile, saveProfile, updateEmail, uploadAvatar, type Session } from '../lib/supabase'
import { Icon, Logo } from '../ui'

function roleLabel(role: string) {
  if (role === 'profissional') return 'Therapist'
  if (role === 'operacao') return 'Operations'
  return 'Client'
}

function memberSince(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date)
}

async function squareJpeg(file: File) {
  const bitmap = await createImageBitmap(file)
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not read that photo.')
  const scale = Math.max(size / bitmap.width, size / bitmap.height)
  const width = bitmap.width * scale
  const height = bitmap.height * scale
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
  if (!blob) throw new Error('Could not read that photo.')
  return blob
}

export function Account({
  session,
  onSession,
  onName,
  onAvatar,
}: {
  session: Session
  onSession: (session: Session) => void
  onName: (name: string) => void
  onAvatar: (url: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState(session.user.email ?? '')
  const [role, setRole] = useState('')
  const [since, setSince] = useState('')
  const [photo, setPhoto] = useState('')
  const [profileError, setProfileError] = useState('')
  const [profileNote, setProfileNote] = useState('')
  const [photoNote, setPhotoNote] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordNote, setPasswordNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [updatingPassword, setUpdatingPassword] = useState(false)

  useEffect(() => {
    let alive = true
    loadProfile(session)
      .then((profile) => {
        if (!alive) return
        const name = profile.full_name ?? ''
        setFullName(name)
        setRole(profile.role)
        setSince(profile.created_at)
        if (name) onName(name)
        if (profile.avatar_path) {
          const next = avatarUrl(profile.avatar_path, profile.updated_at)
          setPhoto(next)
          onAvatar(next)
        }
      })
      .catch((caught) => {
        if (alive) setProfileError(caught instanceof Error ? caught.message : 'Could not load the profile.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [session, onName, onAvatar])

  async function save(event: FormEvent) {
    event.preventDefault()
    setProfileError('')
    setProfileNote('')
    setSaving(true)
    try {
      const profile = await saveProfile(session, fullName)
      const name = profile.full_name ?? ''
      setFullName(name)
      if (name) onName(name)
      const nextEmail = email.trim()
      if (nextEmail && nextEmail !== (session.user.email ?? '')) {
        await updateEmail(session, nextEmail)
        setProfileNote('Profile saved. Confirm the new email from the message we sent. This address stays until then.')
      } else {
        setProfileNote('Profile saved.')
      }
    } catch (caught) {
      setProfileError(caught instanceof Error ? caught.message : 'Could not save the profile.')
    } finally {
      setSaving(false)
    }
  }

  async function changePhoto(file: File) {
    setPhotoNote('')
    setProfileError('')
    setUploading(true)
    try {
      const blob = await squareJpeg(file)
      const profile = await uploadAvatar(session, blob)
      const next = avatarUrl(profile.avatar_path, profile.updated_at)
      setPhoto(next)
      onAvatar(next)
      setPhotoNote('Photo updated.')
    } catch (caught) {
      setProfileError(caught instanceof Error ? caught.message : 'Could not update the photo.')
    } finally {
      setUploading(false)
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    setPasswordError('')
    setPasswordNote('')
    if (nextPassword.length < 8) {
      setPasswordError('Use at least 8 characters.')
      return
    }
    if (nextPassword !== confirmPassword) {
      setPasswordError('The new password and the confirmation do not match.')
      return
    }
    if (!session.user.email) {
      setPasswordError('This account has no email to confirm the password.')
      return
    }
    setUpdatingPassword(true)
    try {
      const next = await changePassword(session, session.user.email, currentPassword, nextPassword)
      onSession(next)
      setCurrentPassword('')
      setNextPassword('')
      setConfirmPassword('')
      setPasswordNote('Password updated.')
    } catch (caught) {
      setPasswordError(caught instanceof Error ? caught.message : 'Could not update the password.')
    } finally {
      setUpdatingPassword(false)
    }
  }

  const initial = (fullName || email || 'A').slice(0, 1).toUpperCase()

  return (
    <div className="page">
      <div className="account">
        <div className="account-brand"><Logo onDark={false} /></div>
        <div className="account-id">
          <button type="button" className="account-photo" aria-label="Change profile photo" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {photo ? <img src={photo} alt="" /> : <span className="account-letter">{initial}</span>}
            <span className="account-cam" aria-hidden="true"><Icon name="camera" /></span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void changePhoto(file)
            }}
          />
          <h1>{fullName || 'Your profile'}</h1>
          <p>{session.user.email}</p>
          {photoNote ? <p className="account-note">{photoNote}</p> : null}
        </div>

        <form className="account-card" onSubmit={save}>
          <h2>Profile</h2>
          <label className="field">
            Full name
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" disabled={loading || saving} />
          </label>
          <label className="field">
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" disabled={loading || saving} required />
          </label>
          <p className="hint">A confirmation message is sent before the email changes.</p>
          {profileError ? <p className="error">{profileError}</p> : null}
          {profileNote ? <p className="account-note">{profileNote}</p> : null}
          <button type="submit" className="btn full" disabled={loading || saving}>{saving ? 'Saving' : 'Save profile'}</button>
        </form>

        <form className="account-card" onSubmit={savePassword}>
          <h2>Password</h2>
          <label className="field">
            Current password
            <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
          </label>
          <label className="field">
            New password
            <input type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} autoComplete="new-password" required />
          </label>
          <label className="field">
            Confirm new password
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
          </label>
          {passwordError ? <p className="error">{passwordError}</p> : null}
          {passwordNote ? <p className="account-note">{passwordNote}</p> : null}
          <button type="submit" className="btn full" disabled={updatingPassword}>{updatingPassword ? 'Updating' : 'Update password'}</button>
        </form>

        <section className="account-card">
          <h2>Account</h2>
          <div className="account-static"><span>Role</span><strong>{role ? roleLabel(role) : '…'}</strong></div>
          <div className="account-static"><span>Member since</span><strong>{since ? memberSince(since) : '…'}</strong></div>
          <a className="account-delete" href="/delete-account">Delete account</a>
        </section>
      </div>
    </div>
  )
}
