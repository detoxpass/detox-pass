import { useEffect, useState } from 'react'
import { loadTermsAdmin, publishTerms, saveTermsDraft, type Session } from '../../lib/supabase'
import { Button, ErrorBlock, LoadingBlock } from '../../ui'

type Version = {
  id: string
  version_number: number | null
  title: string
  body: string
  content_sha256: string | null
  status: string
  published_at: string | null
}

type Acceptance = {
  id: string
  version_number: number
  email: string
  display_name: string
  surface: string
  accepted_at: string
  ip: string
  user_agent: string
  locale: string
  content_sha256: string
}

export function TermsAdmin({ session }: { session: Session }) {
  const [versions, setVersions] = useState<Version[]>([])
  const [acceptances, setAcceptances] = useState<Acceptance[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  function reload() {
    setLoading(true)
    loadTermsAdmin(session)
      .then((result) => {
        setVersions(result.versions)
        setAcceptances(result.acceptances)
        const draft = result.versions.find((row) => row.status === 'draft')
        if (draft) {
          setTitle(draft.title)
          setBody(draft.body)
        }
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load terms.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [session])

  async function save() {
    setBusy(true)
    setError('')
    try {
      await saveTermsDraft(session, title, body)
      reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the draft.')
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    setBusy(true)
    setError('')
    try {
      await saveTermsDraft(session, title, body)
      await publishTerms(session)
      setTitle('')
      setBody('')
      reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not publish.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingBlock text="Loading terms…" />

  return (
    <div className="page stack">
      <section className="account-card stack">
        <h2>Draft</h2>
        <p className="muted">Publishing freezes this text as the next version. A correction is a new draft.</p>
        <label className="field"><span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field"><span>Text</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={12} />
        </label>
        <div className="visit-actions">
          <Button kind="ghost" disabled={busy} onClick={save}>Save draft</Button>
          <Button disabled={busy} onClick={publish}>Publish</Button>
        </div>
        {error ? <ErrorBlock text={error} /> : null}
      </section>
      <section className="account-card">
        <h2>Versions</h2>
        <table className="terms-table">
          <thead><tr><th>Version</th><th>Status</th><th>Published</th><th>Hash</th></tr></thead>
          <tbody>
            {versions.map((row) => (
              <tr key={row.id}>
                <td>{row.version_number ?? '—'}</td>
                <td>{row.status}</td>
                <td>{row.published_at ? new Date(row.published_at).toLocaleString() : '—'}</td>
                <td>{row.content_sha256 ? row.content_sha256.slice(0, 12) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="account-card">
        <h2>Acceptances</h2>
        <table className="terms-table">
          <thead>
            <tr><th>When</th><th>Name</th><th>Email</th><th>Version</th><th>Surface</th><th>IP</th><th>Locale</th><th>Agent</th></tr>
          </thead>
          <tbody>
            {acceptances.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.accepted_at).toLocaleString()}</td>
                <td>{row.display_name}</td>
                <td>{row.email}</td>
                <td>{row.version_number}</td>
                <td>{row.surface}</td>
                <td>{row.ip}</td>
                <td>{row.locale}</td>
                <td>{row.user_agent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
