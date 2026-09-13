import { useState } from 'react'
import { run as runPrepare } from '../modules/prepare'
import { useAuditLog } from '../store/auditLog'
import type { StepResult } from '../verification'
import type { AdbDevice } from '../../electron/main/adb/types'

interface Props {
  device: AdbDevice | null
}

type RunStatus = 'idle' | 'running' | 'done'

interface LiveStep {
  label: string
  status: 'running' | 'success' | 'failed'
}

export function PrepareModule({ device }: Props) {
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([])
  const addStep = useAuditLog((s) => s.addStep)

  async function handleRun() {
    if (!device || runStatus === 'running') return
    setRunStatus('running')
    setLiveSteps([])

    function onStep(result: StepResult) {
      setLiveSteps((prev) => [
        ...prev,
        {
          label: result.label,
          status: result.status === 'success' ? 'success' : 'failed',
        },
      ])
      addStep(result)
    }

    await runPrepare({ serial: device.serial, onStep })
    setRunStatus('done')
  }

  const btnLabel =
    runStatus === 'idle'
      ? 'Lancer la préparation'
      : runStatus === 'running'
      ? 'Préparation en cours…'
      : 'Relancer la préparation'

  return (
    <div className="card">
      <div className="card-header">
        <h3>Préparation console automatique</h3>
        <p className="card-desc">
          Configure la navigation par gestes, vérifie le firmware et applique les réglages
          AYN (layout ABXY + mode gâchettes). Chaque étape est vérifiée et rejouable.
        </p>
      </div>

      <div className="card-body">
        <div className="prepare-steps">
          <StepIndicator
            index={1}
            label="Navigation par gestes"
            desc="Commande directe ADB, fallback UI Automator"
            liveSteps={liveSteps}
            running={runStatus === 'running'}
          />
          <StepIndicator
            index={2}
            label="Mise à jour firmware"
            desc="Déclenche la vérification OTA et attend le redémarrage si nécessaire"
            liveSteps={liveSteps}
            running={runStatus === 'running'}
          />
          <StepIndicator
            index={3}
            label="AYN Settings (ABXY + gâchettes)"
            desc="Ouvre l'app AYN Settings et configure via UI Automator"
            liveSteps={liveSteps}
            running={runStatus === 'running'}
          />
        </div>

        <button
          className="btn-primary"
          onClick={handleRun}
          disabled={!device || runStatus === 'running'}
        >
          {runStatus === 'running' && <span className="spinner" />}
          {btnLabel}
        </button>

        {!device && (
          <p className="hint">Aucun appareil détecté. Activez le mode simulation dans Réglages.</p>
        )}

        {runStatus === 'done' && (
          <p className="hint">
            Préparation terminée.{' '}
            {liveSteps.filter((s) => s.status === 'success').length}/{liveSteps.length} étapes
            réussies. Voir le journal ci-dessous.
          </p>
        )}
      </div>
    </div>
  )
}

interface StepIndicatorProps {
  index: number
  label: string
  desc: string
  liveSteps: LiveStep[]
  running: boolean
}

function StepIndicator({ index, label, desc, liveSteps, running }: StepIndicatorProps) {
  // Cherche si une étape live correspond à ce label (correspondance partielle)
  const live = liveSteps.find((s) => s.label.toLowerCase().includes(label.toLowerCase().slice(0, 15)))

  let icon = <span className="step-num">{index}</span>
  if (live?.status === 'success') icon = <span className="step-ok">✓</span>
  if (live?.status === 'failed') icon = <span className="step-err">✗</span>
  if (!live && running && liveSteps.length >= index - 1) {
    icon = <span className="spinner step-spinner" />
  }

  return (
    <div className={`prepare-step ${live ? `prepare-step--${live.status}` : ''}`}>
      <div className="step-icon-wrap">{icon}</div>
      <div className="step-text">
        <span className="step-label">{label}</span>
        <span className="step-desc">{desc}</span>
      </div>
    </div>
  )
}
