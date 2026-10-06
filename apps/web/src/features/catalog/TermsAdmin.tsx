import { useEffect, useState } from 'react'
import { loadAdminProfessionals, loadTermsAdmin, publishTerms, saveTermsDraft, type Session } from '../../lib/supabase'
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
  professional_id: string
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

export function TermsAdmin({ session, onOpen }: { session: Session; onOpen?: (id: string) => void }) {
  const [versions, setVersions] = useState<Version[]>([])
  const [acceptances, setAcceptances] = useState<Acceptance[]>([])
  const [people, setPeople] = useState<{ id: string; display_name: string }[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  function reload() {
    setLoading(true)
    Promise.all([loadTermsAdmin(session), loadAdminProfessionals(session)])
      .then(([result, professionals]) => {
        setVersions(result.versions)
        setAcceptances(result.acceptances)
        setPeople(professionals.map((person) => ({ id: person.id, display_name: person.display_name })))
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

  const published = versions.filter((row) => row.status === 'published').sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0))[0]
  const accepted = new Set(acceptances.filter((row) => published && row.version_number === published.version_number).map((row) => row.professional_id))
  const missing = published?.version_number ? people.filter((person) => !accepted.has(person.id)) : []

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
        <p className="muted">A published version stays as it was. Saving a draft does not change what a professional is asked to accept.</p>
        {versions.map((row) => (
          <article className="catalog-card" key={row.id}>
            <strong>{row.version_number ?? 'Draft'} · {row.status}</strong>
            <span>{row.published_at ? new Date(row.published_at).toLocaleString() : 'Not published'}</span>
            <details>
              <summary>Hash</summary>
              <p>{row.content_sha256 || 'No hash yet'}</p>
            </details>
          </article>
        ))}
      </section>
      <section className="account-card" id="missing">
        <h2>Still to accept</h2>
        {missing.length === 0 ? <p className="muted">Every professional has accepted the current version, or nothing is published yet.</p> : missing.map((person) => (
          <button type="button" className="catalog-card" key={person.id} onClick={() => onOpen?.(person.id)}>
            <strong>{person.display_name}</strong>
            <span>Has not accepted the current version</span>
          </button>
        ))}
      </section>
      <section className="account-card">
        <h2>Acceptances</h2>
        {acceptances.length === 0 ? <p className="muted">No acceptances yet.</p> : acceptances.map((row) => (
          <article className="catalog-card" key={row.id}>
            <strong>{row.display_name}</strong>
            <span>{row.email}</span>
            <span>{new Date(row.accepted_at).toLocaleString()} · v{row.version_number} · {row.surface}</span>
            <details>
              <summary>Record</summary>
              <p>IP {row.ip}</p>
              <p>Locale {row.locale}</p>
              <p>Agent {row.user_agent}</p>
              <p>Hash {row.content_sha256}</p>
            </details>
          </article>
        ))}
      </section>
    </div>
  )
}
