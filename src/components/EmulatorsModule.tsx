import { useState } from 'react'
import { run as runEmulators } from '../modules/emulators'
import { runInitialBackups, makeDefaultSavesIpc, makeSimulationSavesIpc } from '../modules/saves'
import { useAuditLog } from '../store/auditLog'
import { useSettings } from '../store/settings'
import type { StepResult } from '../verification'
import type { AdbDevice } from '../../electron/main/adb/types'
import sources from '../modules/emulators/sources.json'

interface Props {
  device: AdbDevice | null
}

type RunStatus = 'idle' | 'running' | 'done'

interface LiveStep {
  label: string
  status: 'running' | 'success' | 'failed' | 'skipped'
  note?: string
}

const STEP_SUFFIXES = ['Téléchargement APK', 'Installation', 'Configuration']

export function EmulatorsModule({ device }: Props) {
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([])
  const addStep = useAuditLog((s) => s.addStep)
  const { simulationMode } = useSettings()

  async function handleRun() {
    if (!device || runStatus === 'running') return
    setRunStatus('running')
    setLiveSteps([])

    function onStep(result: StepResult) {
      setLiveSteps((prev) => [
        ...prev,
        {
          label: result.label,
          status: liveStatusFor(result.status),
          note: result.note,
        },
      ])
      addStep(result)
    }

    const result = await runEmulators({ serial: device.serial, onStep })

    // Prompt 5 : sauvegarde "état initial" automatique pour chaque émulateur
    // dont l'installation a réussi (la config ignorée n'empêche pas le backup).
    const installed = sources
      .filter((s) =>
        result.steps.some(
          (step) => step.label === `${s.displayName} — Installation` && step.status === 'success'
        )
      )
      .map((s) => s.id)
    if (installed.length > 0) {
      const savesIpc = simulationMode ? makeSimulationSavesIpc() : makeDefaultSavesIpc()
      await runInitialBackups(device.serial, installed, savesIpc, addStep, {
        maxRetries: simulationMode ? 1 : 2,
        retryDelayMs: simulationMode ? 0 : 2000,
      })
    }

    setRunStatus('done')
  }

  const btnLabel =
    runStatus === 'idle'
      ? 'Installer les émulateurs'
      : runStatus === 'running'
      ? 'Installation en cours…'
      : "Relancer l’installation"

  const successCount = liveSteps.filter((s) => s.status === 'success').length
  const skippedCount = liveSteps.filter((s) => s.status === 'skipped').length
  const failedCount = liveSteps.filter((s) => s.status === 'failed').length

  return (
    <div className="card card--fill">
      <div className="card-header">
        <h3>Émulateurs — Installation automatique</h3>
        <p className="card-desc">
          Télécharge la dernière version de chaque émulateur depuis GitHub et l'installe. Les profils
          de configuration ne sont pas encore validés sur matériel réel : cette étape est ignorée et
          reste à faire manuellement dans chaque émulateur.
        </p>
      </div>

      <div className="card-body card-body--scroll">
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
      </div>

      <div className="card-footer">
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
            Installation terminée. {successCount}/{liveSteps.length} réussies
            {skippedCount > 0 && `, ${skippedCount} ignorée${skippedCount > 1 ? 's' : ''} (config non automatisable)`}
            {failedCount > 0 && `, ${failedCount} en échec`}. Voir le journal ci-dessous.
          </p>
        )}
      </div>
    </div>
  )
}

function liveStatusFor(status: StepResult['status']): LiveStep['status'] {
  if (status === 'success') return 'success'
  if (status === 'skipped') return 'skipped'
  return 'failed'
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
  if (live?.status === 'skipped') icon = <span className="step-skip">–</span>
  if (!live && running && liveSteps.length >= globalIndex) {
    icon = <span className="spinner step-spinner" />
  }

  return (
    <div className={`prepare-step ${live ? `prepare-step--${live.status}` : ''}`}>
      <div className="step-icon-wrap">{icon}</div>
      <div className="step-text">
        <span className="step-label">
          {label}
          {live?.status === 'skipped' && <span className="step-badge">ignoré</span>}
        </span>
        <span className="step-desc">
          {live?.status === 'skipped' && live.note ? live.note : desc}
        </span>
      </div>
    </div>
  )
}
