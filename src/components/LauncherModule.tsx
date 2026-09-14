import { useState } from 'react'
import {
  run as runLauncher,
  makeDefaultLauncherIpc,
  makeSimulationLauncherIpc,
  LAUNCHER_CONFIG,
} from '../modules/launcher'
import { useAuditLog } from '../store/auditLog'
import { useSettings } from '../store/settings'
import type { StepResult } from '../verification'
import type { AdbDevice } from '../../electron/main/adb/types'

interface Props {
  device: AdbDevice | null
}

type RunStatus = 'idle' | 'running' | 'done'

interface LiveStep {
  label: string
  status: 'success' | 'failed' | 'skipped'
  detail?: string
}

function toLiveStep(result: StepResult): LiveStep {
  if (result.status === 'success') return { label: result.label, status: 'success', detail: result.note }
  if (result.status === 'skipped') return { label: result.label, status: 'skipped', detail: result.note }
  return { label: result.label, status: 'failed', detail: result.error }
}

export function LauncherModule({ device }: Props) {
  const { simulationMode } = useSettings()
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([])
  const addStep = useAuditLog((s) => s.addStep)

  async function handleRun() {
    if (!device || runStatus === 'running') return
    setRunStatus('running')
    setLiveSteps([])

    await runLauncher({
      serial: device.serial,
      onStep: (result) => {
        setLiveSteps((prev) => [...prev, toLiveStep(result)])
        addStep(result)
      },
      ipc: simulationMode ? makeSimulationLauncherIpc() : makeDefaultLauncherIpc(),
      options: simulationMode ? { retryDelayMs: 300 } : undefined,
    })
    setRunStatus('done')
  }

  const successCount = liveSteps.filter((s) => s.status === 'success').length
  const skippedCount = liveSteps.filter((s) => s.status === 'skipped').length
  const failedCount = liveSteps.filter((s) => s.status === 'failed').length

  return (
    <div className="card card--fill">
      <div className="card-header">
        <h3>Launcher — {LAUNCHER_CONFIG.displayName}</h3>
        <p className="card-desc">
          Vérifie la présence de <code>{LAUNCHER_CONFIG.packageName}</code>, le définit comme
          application Home par défaut puis confirme qu'il est au premier plan. Le rescan de
          bibliothèque et la correction des raccourcis PC ne sont pas automatisables sans root.
        </p>
      </div>

      <div className="card-body card-body--scroll">
        {liveSteps.length === 0 ? (
          <p className="hint">
            {simulationMode
              ? 'Mode simulation : déroule la configuration sur une console Android simulée.'
              : 'Connectez la console puis lancez la configuration du launcher.'}
          </p>
        ) : (
          <div className="prepare-steps">
            {liveSteps.map((step, i) => (
              <LauncherStepRow key={`${step.label}-${i}`} step={step} />
            ))}
          </div>
        )}
      </div>

      <div className="card-footer">
        <button className="btn-primary" onClick={handleRun} disabled={!device || runStatus === 'running'}>
          {runStatus === 'running' && <span className="spinner" />}
          {runStatus === 'running'
            ? 'Configuration en cours…'
            : runStatus === 'done'
            ? 'Relancer la configuration'
            : 'Configurer le launcher'}
        </button>

        {!device && (
          <p className="hint">Aucun appareil détecté. Activez le mode simulation dans Réglages.</p>
        )}

        {runStatus === 'done' && (
          <p className="hint">
            Configuration terminée. {successCount} réussie{successCount > 1 ? 's' : ''}
            {skippedCount > 0 && `, ${skippedCount} non automatisable${skippedCount > 1 ? 's' : ''}`}
            {failedCount > 0 && `, ${failedCount} en échec`}. Voir le journal ci-dessous.
          </p>
        )}
      </div>
    </div>
  )
}

function LauncherStepRow({ step }: { step: LiveStep }) {
  let icon = <span className="step-ok">✓</span>
  if (step.status === 'failed') icon = <span className="step-err">✗</span>
  if (step.status === 'skipped') icon = <span className="step-skip">–</span>

  return (
    <div className={`prepare-step prepare-step--${step.status}`}>
      <div className="step-icon-wrap">{icon}</div>
      <div className="step-text">
        <span className="step-label">
          {step.label}
          {step.status === 'skipped' && <span className="step-badge">ignoré</span>}
        </span>
        {step.detail && <span className="step-desc">{step.detail}</span>}
      </div>
    </div>
  )
}
