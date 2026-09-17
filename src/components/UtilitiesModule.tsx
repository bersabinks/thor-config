import { useState } from 'react'
import { run as runUtilities, UTILITY_SOURCES } from '../modules/utilities'
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

export function UtilitiesModule({ device }: Props) {
  const { simulationMode } = useSettings()
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([])
  const addStep = useAuditLog((s) => s.addStep)

  async function handleRun() {
    if (!device || runStatus === 'running') return
    setRunStatus('running')
    setLiveSteps([])

    await runUtilities({
      serial: device.serial,
      onStep: (result) => {
        setLiveSteps((prev) => [...prev, toLiveStep(result)])
        addStep(result)
      },
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
        <h3>Utilitaires AYN Thor Max</h3>
        <p className="card-desc">
          Installe <strong>ClusterTune</strong> (gestion des fréquences CPU/GPU sans root) avec activation de la tuile rapide,
          <strong> Final ROM</strong> (boîte à outils ROM sur console), et vérifie <strong>ZArchiver</strong> ainsi que{' '}
          <strong>GameHub</strong> (jeux PC/Steam) — ces deux derniers ne sont distribués que par le Play Store et
          restent à installer à la main.
        </p>
      </div>

      <div className="card-body card-body--scroll">
        <div style={{ marginBottom: 16 }}>
          <div className="hint" style={{ marginBottom: 8 }}>
            Utilitaires pris en charge :
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
            {UTILITY_SOURCES.map((u) => (
              <li key={u.id} style={{ marginBottom: 4 }}>
                <strong>{u.displayName}</strong> — {u.description}
              </li>
            ))}
          </ul>
        </div>

        <div className="alert-box" style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, marginBottom: 16, fontSize: 12 }}>
          ℹ <strong>AB Download Manager (ABDM)</strong> : gestionnaire de téléchargements multi-thread recommandé en complément pour les téléchargements directs sur console (installation manuelle optionnelle).
        </div>

        {liveSteps.length === 0 ? (
          <p className="hint">
            {simulationMode
              ? 'Mode simulation : déroule l’installation des utilitaires sur une console Android simulée.'
              : 'Connectez la console puis lancez l’installation des utilitaires.'}
          </p>
        ) : (
          <div className="prepare-steps">
            {liveSteps.map((step, i) => (
              <UtilityStepRow key={`${step.label}-${i}`} step={step} />
            ))}
          </div>
        )}
      </div>

      <div className="card-footer">
        <button className="btn-primary" onClick={handleRun} disabled={!device || runStatus === 'running'}>
          {runStatus === 'running' && <span className="spinner" />}
          {runStatus === 'running'
            ? 'Installation en cours…'
            : runStatus === 'done'
            ? 'Relancer l’installation'
            : 'Installer les utilitaires'}
        </button>

        {!device && (
          <p className="hint">Aucun appareil détecté. Activez le mode simulation dans Réglages.</p>
        )}

        {runStatus === 'done' && (
          <p className="hint">
            Installation terminée. {successCount} réussie{successCount > 1 ? 's' : ''}
            {skippedCount > 0 && `, ${skippedCount} manuelle / ignorée${skippedCount > 1 ? 's' : ''}`}
            {failedCount > 0 && `, ${failedCount} en échec`}. Voir le journal ci-dessous.
          </p>
        )}
      </div>
    </div>
  )
}

function UtilityStepRow({ step }: { step: LiveStep }) {
  let icon = <span className="step-ok">✓</span>
  if (step.status === 'failed') icon = <span className="step-err">✗</span>
  if (step.status === 'skipped') icon = <span className="step-skip">–</span>

  return (
    <div className={`prepare-step prepare-step--${step.status}`}>
      <div className="step-icon-wrap">{icon}</div>
      <div className="step-text">
        <span className="step-label">
          {step.label}
          {step.status === 'skipped' && <span className="step-badge">manuel / ignoré</span>}
        </span>
        {step.detail && <span className="step-desc">{step.detail}</span>}
      </div>
    </div>
  )
}
