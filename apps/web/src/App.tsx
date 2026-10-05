import { useState } from 'react'
import { homeOf, type Role } from './data'
import { Shell } from './shell'
import { Auth, System } from './screens/Auth'
import { ClientScreens } from './screens/Client'
import { TherapistScreens } from './screens/Therapist'
import { AdminScreens } from './screens/Admin'
import { Modal } from './ui'

type Mode = 'login' | 'error' | 'signup' | 'recover' | 'reset'
type ModalState = { title: string; text: string; confirm?: string; action?: () => void } | null

export function App() {
  const [role, setRole] = useState<Role>('client')
  const [mode, setMode] = useState<Mode>('login')
  const [step, setStep] = useState(1)
  const [authed, setAuthed] = useState(false)
  const [system, setSystem] = useState(false)
  const [screen, setScreen] = useState('find')
  const [modal, setModal] = useState<ModalState>(null)

  function enter() {
    setAuthed(true)
    setScreen(homeOf(role))
    setModal(null)
  }

  function switchAccount() {
    const next: Role = role === 'admin' ? 'client' : 'admin'
    setRole(next)
    setScreen(homeOf(next))
    setModal(null)
  }

  if (system) return <System onBack={() => setSystem(false)} />

  if (!authed) {
    return (
      <Auth
        role={role}
        mode={mode}
        step={step}
        onRole={(next) => { setRole(next); setScreen(homeOf(next)) }}
        onMode={setMode}
        onStep={setStep}
        onEnter={enter}
        onSystem={() => setSystem(true)}
      />
    )
  }

  const name = role === 'client' ? 'Nome' : role === 'therapist' ? 'Sara' : 'BBF'

  return (
    <Shell role={role} screen={screen} name={name} onNavigate={setScreen} onSignOut={() => { setAuthed(false); setMode('login') }} onSwitchAccount={switchAccount}>
      {role === 'client' ? <ClientScreens screen={screen} go={setScreen} ask={(title, text, action, confirm) => setModal({ title, text, action, confirm })} /> : null}
      {role === 'therapist' ? <TherapistScreens screen={screen} go={setScreen} ask={(title, text) => setModal({ title, text })} /> : null}
      {role === 'admin' ? <AdminScreens screen={screen} ask={(title, text) => setModal({ title, text })} /> : null}
      {modal ? (
        <Modal
          title={modal.title}
          text={modal.text}
          confirm={modal.confirm ?? "Yes, I'm sure"}
          onClose={() => setModal(null)}
          onConfirm={() => {
            const action = modal.action
            setModal(null)
            action?.()
          }}
        />
      ) : null}
    </Shell>
  )
}
