import { useCallback, useEffect, useRef, useState } from 'react'
import {
  run as runVita,
  selectVitaArchives,
  isVitaArchiveCandidate,
  makeDefaultVitaIpc,
  makeSimulationVitaIpc,
  SIMULATION_IMPORT_FILES,
  VITA_TARGETS,
  type VitaIpc,
} from '../modules/vita'
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

export function VitaModule({ device }: Props) {
  const { simulationMode, importFolder, vitaOutputFolder } = useSettings()
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([])
  const [selection, setSelection] = useState<{ archives: number; files: number } | null>(null)
  const [queue, setQueue] = useState<string[]>([])
  const addStep = useAuditLog((s) => s.addStep)
  const processingRef = useRef(false)

  // ── Mode réel : surveille le dossier d'import (et son sous-dossier PSVita/) ──
  useEffect(() => {
    if (simulationMode) return
    const unsub = window.electronAPI.roms.onFileDetected((path) => {
      if (!isVitaArchiveCandidate(path)) return
      setQueue((q) => (q.includes(path) ? q : [...q, path]))
    })
    if (importFolder) void window.electronAPI.roms.startWatcher(importFolder)
    return () => {
      unsub()
      void window.electronAPI.roms.stopWatcher()
    }
  }, [simulationMode, importFolder])

  const process = useCallback(
    async (files: string[], ipc: VitaIpc) => {
      if (processingRef.current || files.length === 0) return
      processingRef.current = true
      setRunStatus('running')
      setLiveSteps([])

      function onStep(result: StepResult) {
        setLiveSteps((prev) => [...prev, toLiveStep(result)])
        addStep(result)
      }

      const archives = await selectVitaArchives(files, ipc)
      setSelection({ archives: archives.length, files: files.length })
      if (archives.length > 0) {
        await runVita({
          serial: device?.serial ?? '',
          files: archives,
          onStep,
          ipc,
          options: { pcOutputDir: vitaOutputFolder },
        })
      }
      setRunStatus('done')
      processingRef.current = false
    },
    [device, vitaOutputFolder, addStep]
  )

  // ── Traitement automatique de la file en mode réel (sans clic) ──────────────
  useEffect(() => {
    if (simulationMode || processingRef.current || queue.length === 0) return
    const batch = queue
    setQueue([])
    void process(batch, makeDefaultVitaIpc())
  }, [queue, simulationMode, process])

  async function handleSimImport() {
    await process(SIMULATION_IMPORT_FILES, makeSimulationVitaIpc())
  }

  const successCount = liveSteps.filter((s) => s.status === 'success').length
  const skippedCount = liveSteps.filter((s) => s.status === 'skipped').length
  const failedCount = liveSteps.filter((s) => s.status === 'failed').length

  return (
    <div className="card card--fill">
      <div className="card-header">
        <h3>PS Vita — Conversion automatique</h3>
        <p className="card-desc">
          Les archives .zip/.7z contenant un <code>sce_sys/param.sfo</code> (ou déposées dans{' '}
          <code>PSVita/</code>) sont extraites, recompressées en <code>.vpk</code> pour Vita3K avec
          un <code>.dpt</code> par jeu, puis déposées dans <code>{VITA_TARGETS.deviceDropDir}</code>{' '}
          si Vita3K est sur la console, sinon copiées sur le PC.
        </p>
      </div>

      <div className="card-body card-body--scroll">
        {liveSteps.length === 0 ? (
          <p className="hint">
            {simulationMode
              ? 'Mode simulation : traitez un import d’exemple (archives PS Vita factices) pour dérouler le pipeline sans console ni fichiers.'
              : importFolder
              ? `Dossier surveillé : ${importFolder}. Déposez-y une archive PS Vita, elle sera convertie automatiquement.`
              : 'Choisissez un dossier d’import dans Réglages pour démarrer la surveillance.'}
          </p>
        ) : (
          <div className="prepare-steps">
            {liveSteps.map((step, i) => (
              <VitaStepRow key={`${step.label}-${i}`} step={step} />
            ))}
          </div>
        )}

        {!simulationMode && queue.length > 0 && (
          <p className="hint">{queue.length} archive(s) en attente de traitement…</p>
        )}
      </div>

      <div className="card-footer">
        {simulationMode && (
          <button className="btn-primary" onClick={handleSimImport} disabled={runStatus === 'running'}>
            {runStatus === 'running' && <span className="spinner" />}
            {runStatus === 'running'
              ? 'Conversion en cours…'
              : `Traiter l'import d'exemple (${SIMULATION_IMPORT_FILES.length} fichiers)`}
          </button>
        )}

        {!device && (
          <p className="hint">
            Aucune console détectée : les fichiers générés seront copiés dans le dossier de sortie PC.
          </p>
        )}

        {runStatus === 'done' && selection && (
          <p className="hint">
            {selection.archives} archive(s) PS Vita sur {selection.files} fichier(s).{' '}
            {successCount} réussie{successCount > 1 ? 's' : ''}
            {skippedCount > 0 && `, ${skippedCount} ignorée${skippedCount > 1 ? 's' : ''}`}
            {failedCount > 0 && `, ${failedCount} en échec`}. Voir le journal ci-dessous.
          </p>
        )}
      </div>
    </div>
  )
}

function VitaStepRow({ step }: { step: LiveStep }) {
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
