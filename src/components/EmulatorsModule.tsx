import { useState } from 'react'
import { run as runEmulators } from '../modules/emulators'
import { useAuditLog } from '../store/auditLog'
import type { StepResult } from '../verification'
import type { AdbDevice } from '../../electron/main/adb/types'
import sources from '../modules/emulators/sources.json'

interface Props {
  device: AdbDevice | null
}

type RunStatus = 'idle' | 'running' | 'done'

interface LiveStep {
  label: string
  status: 'running' | 'success' | 'failed'
}

const STEP_SUFFIXES = ['Téléchargement APK', 'Installation', 'Configuration']

export function EmulatorsModule({ device }: Props) {
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

    await runEmulators({ serial: device.serial, onStep })
    setRunStatus('done')
  }

  const btnLabel =
    runStatus === 'idle'
      ? 'Installer les émulateurs'
      : runStatus === 'running'
      ? 'Installation en cours…'
      : "Relancer l’installation"

  const successCount = liveSteps.filter((s) => s.status === 'success').length

  return (
    <div className="card">
      <div className="card-header">
        <h3>Émulateurs — Installation automatique</h3>
        <p className="card-desc">
          Télécharge la dernière version de chaque émulateur depuis GitHub, l'installe et applique
          le profil de configuration optimisé pour la Thor Max. Aucune intervention manuelle.
        </p>
      </div>

      <div className="card-body">
        <div className="prepare-steps">
          {sources.map((source, si) =>
            STEP_SUFFIXES.map((suffix, stepIdx) => {
              const label = `${source.displayName} — ${suffix}`
              const globalIdx = si * STEP_SUFFIXES.length + stepIdx
              return (
                <EmulatorStepIndicator
                  key={label}
                  label={label}
                  desc={descFor(suffix)}
                  globalIndex={globalIdx}
                  liveSteps={liveSteps}
                  running={runStatus === 'running'}
                />
              )
            })
          )}
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
            Installation terminée.{' '}
            {successCount}/{liveSteps.length} étapes réussies. Voir le journal ci-dessous.
          </p>
        )}
      </div>
    </div>
  )
}

function descFor(suffix: string): string {
  switch (suffix) {
    case 'Téléchargement APK':
      return 'Récupère la dernière release GitHub, vérifie SHA-256 si disponible'
    case 'Installation':
      return "Installe l'APK via ADB et vérifie la présence du package"
    case 'Configuration':
      return 'Pousse le profil de config et relit les clés pour vérification'
    default:
      return ''
  }
}

interface EmulatorStepIndicatorProps {
  label: string
  desc: string
  globalIndex: number
  liveSteps: LiveStep[]
  running: boolean
}

function EmulatorStepIndicator({
  label,
  desc,
  globalIndex,
  liveSteps,
  running,
}: EmulatorStepIndicatorProps) {
  const live = liveSteps.find((s) => s.label === label)

  let icon: React.ReactNode = <span className="step-num">{globalIndex + 1}</span>
  if (live?.status === 'success') icon = <span className="step-ok">✓</span>
  if (live?.status === 'failed') icon = <span className="step-err">✗</span>
  if (!live && running && liveSteps.length >= globalIndex) {
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
