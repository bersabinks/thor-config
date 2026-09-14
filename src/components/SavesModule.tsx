import { useCallback, useEffect, useRef, useState } from 'react'
import { backup, restore, makeBackupId, makeDefaultSavesIpc, makeSimulationSavesIpc } from '../modules/saves'
import type { SavesIpc } from '../modules/saves'
import { parseManifest } from '../modules/saves/manifest'
import { useAuditLog } from '../store/auditLog'
import { useSettings } from '../store/settings'
import type { StepResult } from '../verification'
import type { AdbDevice } from '../../electron/main/adb/types'

interface Props {
  device: AdbDevice | null
}

const EMULATORS = [
  { id: 'melonds-ds', name: 'MelonDS' },
  { id: 'azahar', name: 'Azahar' },
  { id: 'dolphin', name: 'Dolphin' },
  { id: 'cemu', name: 'Cemu' },
]

type RunStatus = 'idle' | 'running' | 'done'

interface HistoryEntry {
  backupId: string
  kind: string
  fileCount: number
  verifiedCount: number
}

export function SavesModule({ device }: Props) {
  const { simulationMode } = useSettings()
  const [emulatorId, setEmulatorId] = useState('melonds-ds')
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [steps, setSteps] = useState<StepResult[]>([])
  const [lastBackupId, setLastBackupId] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const addStep = useAuditLog((s) => s.addStep)
  const simIpcRef = useRef<SavesIpc | null>(null)

  const getIpc = useCallback((): SavesIpc => {
    if (!simulationMode) return makeDefaultSavesIpc()
    if (!simIpcRef.current) simIpcRef.current = makeSimulationSavesIpc()
    return simIpcRef.current
  }, [simulationMode])

  const refreshHistory = useCallback(async () => {
    if (simulationMode) return
    try {
      const ids = await window.electronAPI.saves.listBackups(emulatorId)
      const entries: HistoryEntry[] = []
      for (const id of ids) {
        const json = await window.electronAPI.saves.readManifest(emulatorId, id)
        if (!json) continue
        try {
          const m = parseManifest(json)
          entries.push({
            backupId: id,
            kind: m.kind,
            fileCount: m.files.length,
            verifiedCount: m.files.filter((f) => f.verified).length,
          })
        } catch {
          entries.push({ backupId: id, kind: 'corrompu', fileCount: 0, verifiedCount: 0 })
        }
      }
      setHistory(entries.reverse())
    } catch {
      setHistory([])
    }
  }, [emulatorId, simulationMode])

  useEffect(() => {
    void refreshHistory()
  }, [refreshHistory])

  const opts = simulationMode ? { maxRetries: 1, retryDelayMs: 0 } : {}

  async function handleBackup() {
    if (!device || runStatus === 'running') return
    setRunStatus('running')
    setSteps([])
    const id = makeBackupId()
    const res = await backup(device.serial, emulatorId, 'initial', id, getIpc(), opts)
    res.steps.forEach(addStep)
    setSteps(res.steps)
    setLastBackupId(res.overallStatus === 'empty' ? null : id)
    setRunStatus('done')
    void refreshHistory()
  }

  async function handleRestore() {
    if (!device || runStatus === 'running') return
    const backupId = lastBackupId ?? history[0]?.backupId
    if (!backupId) return
    setRunStatus('running')
    setSteps([])
    const res = await restore(device.serial, emulatorId, backupId, getIpc(), {
      ...opts,
      safetyBackupId: `${makeBackupId()}__pre-restore`,
    })
    res.steps.forEach(addStep)
    setSteps(res.steps)
    setRunStatus('done')
    void refreshHistory()
  }

  const canRestore = Boolean(lastBackupId ?? history[0]?.backupId)
  const successCount = steps.filter((s) => s.status === 'success').length
  const failedCount = steps.filter((s) => s.status === 'failed_after_retries').length

  return (
    <div className="card card--fill">
      <div className="card-header">
        <h3>Sauvegardes — Coffre-fort vérifié</h3>
        <p className="card-desc">
          Chaque fichier est vérifié <strong>bit-à-bit</strong> (SHA-256) à la sauvegarde et à la
          restauration. Avant tout écrasement, un <strong>snapshot de sécurité</strong> de l'état
          courant est créé automatiquement — une restauration ne peut pas détruire des saves
          irréversiblement.
        </p>
      </div>

      <div className="card-body card-body--scroll">
        <div className="settings-row" style={{ borderBottom: 'none', paddingTop: 0 }}>
          <div className="settings-row-label">
            <span>Émulateur</span>
            <span>Cible des opérations de sauvegarde</span>
          </div>
          <div className="segmented">
            {EMULATORS.map((e) => (
              <button
                key={e.id}
                className={emulatorId === e.id ? 'active' : ''}
                onClick={() => setEmulatorId(e.id)}
                disabled={runStatus === 'running'}
              >
                {e.name}
              </button>
            ))}
          </div>
        </div>

        {steps.length > 0 ? (
          <div className="prepare-steps">
            {steps.map((step, i) => (
              <SaveStepRow key={`${step.label}-${i}`} step={step} />
            ))}
          </div>
        ) : history.length > 0 ? (
          <div className="prepare-steps">
            {history.map((h) => (
              <div key={h.backupId} className="prepare-step">
                <div className="step-icon-wrap">
                  <span className={h.verifiedCount === h.fileCount ? 'step-ok' : 'step-err'}>
                    {h.verifiedCount === h.fileCount ? '✓' : '!'}
                  </span>
                </div>
                <div className="step-text">
                  <span className="step-label">{h.backupId}</span>
                  <span className="step-desc">
                    {h.kind} · {h.verifiedCount}/{h.fileCount} fichier(s) vérifié(s)
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="hint">
            {simulationMode
              ? 'Mode simulation : un appareil fictif contient déjà quelques saves. Créez une sauvegarde, puis restaurez-la pour voir le contrôle bit-à-bit et le snapshot de sécurité.'
              : 'Aucune sauvegarde pour cet émulateur. Créez-en une.'}
          </p>
        )}
      </div>

      <div className="card-footer">
        <div className="log-actions" style={{ gap: 10 }}>
          <button className="btn-primary" onClick={handleBackup} disabled={!device || runStatus === 'running'}>
            {runStatus === 'running' && <span className="spinner" />}
            Créer une sauvegarde
          </button>
          <button className="btn-ghost" onClick={handleRestore} disabled={!device || runStatus === 'running' || !canRestore}>
            Restaurer {lastBackupId ? 'la dernière' : 'le backup récent'}
          </button>
        </div>

        {!device && <p className="hint">Aucun appareil détecté. Activez le mode simulation dans Réglages.</p>}

        {runStatus === 'done' && steps.length > 0 && (
          <p className="hint">
            Opération terminée. {successCount} étape(s) vérifiée(s)
            {failedCount > 0 && `, ${failedCount} en échec`}. Voir le journal ci-dessous.
          </p>
        )}
      </div>
    </div>
  )
}

function SaveStepRow({ step }: { step: StepResult }) {
  const ok = step.status === 'success'
  const icon = ok ? <span className="step-ok">✓</span> : <span className="step-err">✗</span>
  return (
    <div className={`prepare-step ${ok ? 'prepare-step--success' : 'prepare-step--failed'}`}>
      <div className="step-icon-wrap">{icon}</div>
      <div className="step-text">
        <span className="step-label">{step.label}</span>
        {step.error && <span className="step-desc">{step.error}</span>}
        {ok && typeof step.lastValue === 'string' && <span className="step-desc">{step.lastValue}</span>}
      </div>
    </div>
  )
}
