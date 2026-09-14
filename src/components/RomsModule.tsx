import { useCallback, useEffect, useRef, useState } from 'react'
import { run as runRoms } from '../modules/roms'
import {
  makeDefaultRomsIpc,
  makeSimulationRomsIpc,
  SIMULATION_SAMPLE_FILES,
} from '../modules/roms/romsIpc'
import type { RomsIpc } from '../modules/roms/romsProcess'
import { isVitaArchiveCandidate } from '../modules/vita'
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
  note?: string
}

function liveStatusFor(status: StepResult['status']): LiveStep['status'] {
  if (status === 'success') return 'success'
  if (status === 'skipped') return 'skipped'
  return 'failed'
}

export function RomsModule({ device }: Props) {
  const { simulationMode, importFolder, romsParallelism, setImportFolder } = useSettings()
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([])
  const [queue, setQueue] = useState<string[]>([])
  const addStep = useAuditLog((s) => s.addStep)
  const processingRef = useRef(false)

  // ── Mode réel : surveille le dossier d'import et empile les fichiers stables ─
  useEffect(() => {
    if (simulationMode) return
    const unsub = window.electronAPI.roms.onFileDetected((path) => {
      if (isVitaArchiveCandidate(path)) return // .zip/.7z : routés vers le module PS Vita
      setQueue((q) => (q.includes(path) ? q : [...q, path]))
    })
    if (importFolder) void window.electronAPI.roms.startWatcher(importFolder)
    return () => {
      unsub()
      void window.electronAPI.roms.stopWatcher()
    }
  }, [simulationMode, importFolder])

  const process = useCallback(
    async (files: string[], ipc: RomsIpc) => {
      if (!device || processingRef.current || files.length === 0) return
      processingRef.current = true
      setRunStatus('running')
      setLiveSteps([])

      function onStep(result: StepResult) {
        setLiveSteps((prev) => [
          ...prev,
          { label: result.label, status: liveStatusFor(result.status), note: result.note },
        ])
        addStep(result)
      }

      await runRoms({
        serial: device.serial,
        files,
        onStep,
        ipc,
        options: { parallelism: romsParallelism },
      })
      setRunStatus('done')
      processingRef.current = false
    },
    [device, romsParallelism, addStep]
  )

  // ── Traitement automatique de la file en mode réel (sans clic "scanner") ────
  useEffect(() => {
    if (simulationMode || processingRef.current || queue.length === 0) return
    const batch = queue
    setQueue([])
    void process(batch, makeDefaultRomsIpc())
  }, [queue, simulationMode, process])

  async function handleSimBatch() {
    await process(SIMULATION_SAMPLE_FILES, makeSimulationRomsIpc())
  }

  async function handlePickFolder() {
    const folder = await window.electronAPI.roms.pickImportFolder()
    if (folder) {
      await setImportFolder(folder)
      void window.electronAPI.roms.startWatcher(folder)
    }
  }

  const successCount = liveSteps.filter((s) => s.status === 'success').length
  const skippedCount = liveSteps.filter((s) => s.status === 'skipped').length
  const failedCount = liveSteps.filter((s) => s.status === 'failed').length

  return (
    <div className="card card--fill">
      <div className="card-header">
        <h3>ROMs — Rangement automatique</h3>
        <p className="card-desc">
          Les fichiers déposés dans le dossier d'import sont identifiés par système, regroupés
          (multi-disques, .m3u), convertis en CHD si <code>chdman</code> est présent, puis poussés
          et vérifiés dans <code>roms/&lt;système&gt;/</code> sur la console.
        </p>
      </div>

      <div className="card-body card-body--scroll">
        {liveSteps.length === 0 ? (
          <p className="hint">
            {simulationMode
              ? 'Mode simulation : traitez un lot de fichiers d’exemple pour dérouler le pipeline sans console ni dossier.'
              : importFolder
              ? `Dossier surveillé : ${importFolder}. Déposez-y des fichiers — ils seront traités automatiquement.`
              : 'Choisissez un dossier d’import pour démarrer la surveillance.'}
          </p>
        ) : (
          <div className="prepare-steps">
            {liveSteps.map((step, i) => (
              <RomStepRow key={`${step.label}-${i}`} step={step} />
            ))}
          </div>
        )}

        {!simulationMode && queue.length > 0 && (
          <p className="hint">{queue.length} fichier(s) en attente de traitement…</p>
        )}
      </div>

      <div className="card-footer">
        {simulationMode ? (
          <button
            className="btn-primary"
            onClick={handleSimBatch}
            disabled={!device || runStatus === 'running'}
          >
            {runStatus === 'running' && <span className="spinner" />}
            {runStatus === 'running'
              ? 'Traitement en cours…'
              : `Traiter le lot d'exemple (${SIMULATION_SAMPLE_FILES.length} fichiers)`}
          </button>
        ) : (
          <button className="btn-primary" onClick={handlePickFolder} disabled={runStatus === 'running'}>
            {importFolder ? 'Changer le dossier d’import' : 'Choisir le dossier d’import'}
          </button>
        )}

        {!device && (
          <p className="hint">Aucun appareil détecté. Activez le mode simulation dans Réglages.</p>
        )}

        {runStatus === 'done' && (
          <p className="hint">
            Traitement terminé. {successCount} réussie{successCount > 1 ? 's' : ''}
            {skippedCount > 0 && `, ${skippedCount} ignorée${skippedCount > 1 ? 's' : ''}`}
            {failedCount > 0 && `, ${failedCount} en échec`}. Voir le journal ci-dessous.
          </p>
        )}
      </div>
    </div>
  )
}

function RomStepRow({ step }: { step: LiveStep }) {
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
        {step.note && <span className="step-desc">{step.note}</span>}
      </div>
    </div>
  )
}
