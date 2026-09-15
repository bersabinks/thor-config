import { useMemo, useState } from 'react'
import {
  buildThorModules,
  runOrchestrator,
  runPreChecks,
  makeDefaultPreCheckIpc,
  failedModuleIds,
  mergeResults,
  buildReport,
  type Guard,
  type ModulePhase,
  type ModuleResult,
  type OrchestratorHandlers,
  type ReportSummary,
} from '../modules/orchestrator'
import { FinalReport } from './FinalReport'
import { useAuditLog } from '../store/auditLog'
import { useSettings } from '../store/settings'
import type { AdbDevice } from '../../electron/main/adb/types'

interface Props {
  device: AdbDevice | null
}

type RunStatus = 'idle' | 'running' | 'paused' | 'done'

interface FullResult {
  modules: ModuleResult[]
  report: ReportSummary
  finishedAt: number
}

const MODULE_STEPS: { id: string; name: string }[] = [
  { id: 'prechecks', name: 'Pré-vérifications' },
  { id: 'prepare', name: 'Préparation' },
  { id: 'emulators', name: 'Émulateurs' },
  { id: 'roms', name: 'ROMs' },
  { id: 'saves', name: 'Sauvegardes' },
  { id: 'vita', name: 'PS Vita' },
  { id: 'launcher', name: 'Launcher' },
]

const PHASE_LABEL: Record<ModulePhase, string> = {
  pending: 'En attente',
  running: 'En cours…',
  paused: 'En pause',
  success: 'Réussi',
  partial: 'Partiel',
  failed: 'Échec',
  skipped: 'Ignoré',
}

function PhaseIcon({ phase }: { phase: ModulePhase }) {
  if (phase === 'running') return <span className="spinner step-spinner" />
  if (phase === 'paused') return <span className="step-skip">⏸</span>
  if (phase === 'success') return <span className="step-ok">✓</span>
  if (phase === 'failed') return <span className="step-err">✗</span>
  if (phase === 'partial') return <span className="step-skip">!</span>
  if (phase === 'skipped') return <span className="step-skip">–</span>
  return <span className="step-num">·</span>
}

/** Garde exécutée entre les modules : met l'orchestrateur en pause si la console disparaît. */
const guard: Guard = async () => {
  try {
    const devices = await window.electronAPI.adb.listDevices()
    return devices.some((d) => d.state === 'device')
      ? { ok: true }
      : { ok: false, reason: 'Console déconnectée — reconnectez-la, la configuration reprendra seule.' }
  } catch {
    return { ok: false, reason: 'ADB injoignable — reconnectez la console pour reprendre.' }
  }
}

export function OrchestratorModule({ device }: Props) {
  const { simulationMode, importFolder, vitaOutputFolder, romsParallelism } = useSettings()
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [phases, setPhases] = useState<Record<string, ModulePhase>>({})
  const [pauseReason, setPauseReason] = useState<string | null>(null)
  const [result, setResult] = useState<FullResult | null>(null)
  const [rerunning, setRerunning] = useState(false)
  const addStep = useAuditLog((s) => s.addStep)
  const clearSteps = useAuditLog((s) => s.clearSteps)

  const busy = runStatus === 'running' || runStatus === 'paused'

  const handlers = useMemo<OrchestratorHandlers>(
    () => ({
      onStep: addStep,
      onModulePhase: (id, phase) => setPhases((p) => ({ ...p, [id]: phase })),
      onPause: (_id, reason) => {
        setRunStatus('paused')
        setPauseReason(reason)
      },
      onResume: () => {
        setRunStatus('running')
        setPauseReason(null)
      },
    }),
    [addStep]
  )

  const buildOpts = () => ({
    simulation: simulationMode,
    importFolder,
    vitaOutputFolder,
    romsParallelism,
  })

  async function handleRun() {
    if (!device || busy) return
    clearSteps()
    setResult(null)
    setPauseReason(null)
    setPhases(Object.fromEntries(MODULE_STEPS.map((m) => [m.id, 'pending' as ModulePhase])))
    setRunStatus('running')

    const modules = await buildThorModules(buildOpts())
    const res = await runOrchestrator({
      serial: device.serial,
      modules,
      preChecks: () =>
        runPreChecks(makeDefaultPreCheckIpc()).then((r) => ({ steps: r.steps, canProceed: r.canProceed })),
      guard,
      handlers,
    })

    setResult({ modules: res.modules, report: res.report, finishedAt: res.finishedAt })
    setRunStatus('done')
  }

  async function handleRerunFailed() {
    if (!device || !result || rerunning) return
    const ids = failedModuleIds(result.modules).filter((id) => id !== 'prechecks')
    if (ids.length === 0) return

    setRerunning(true)
    setRunStatus('running')
    setPauseReason(null)
    setPhases((p) => {
      const next = { ...p }
      for (const id of ids) next[id] = 'pending'
      return next
    })

    const allModules = await buildThorModules(buildOpts())
    const toRun = allModules.filter((m) => ids.includes(m.id))
    const res = await runOrchestrator({
      serial: device.serial,
      modules: toRun,
      guard,
      baseResults: result.modules,
      handlers,
    })

    const merged = mergeResults(result.modules, res.modules)
    setResult({ modules: merged, report: buildReport(merged), finishedAt: res.finishedAt })
    setRerunning(false)
    setRunStatus('done')
  }

  const failableIds = result ? failedModuleIds(result.modules).filter((id) => id !== 'prechecks') : []
  const hasFailures = failableIds.length > 0

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h3>Configurer ma console</h3>
          <p className="card-desc">
            Un seul bouton enchaîne, dans l'ordre et en les vérifiant : Préparation → Émulateurs →
            ROMs → Sauvegardes → PS Vita → Launcher. Si la console se déconnecte en cours de route,
            l'orchestrateur se met en pause et reprend automatiquement — sans refaire ce qui est déjà
            terminé.
          </p>
        </div>
        <div className="card-body">
          <div className="hero-actions">
            <button className="btn-hero" onClick={handleRun} disabled={!device || busy}>
              {busy && <span className="spinner" />}
              {runStatus === 'idle'
                ? '⚡ Configurer ma console'
                : busy
                ? 'Configuration en cours…'
                : '⚡ Relancer la configuration complète'}
            </button>
            {!device && (
              <p className="hint">
                Aucune console détectée. Branchez-la (débogage USB) ou activez le mode simulation dans
                Réglages.
              </p>
            )}
            {simulationMode && runStatus === 'idle' && (
              <p className="hint">
                Mode simulation : déroule tout l'orchestrateur sur une console fictive. Un run complet
                prend quelques minutes (l'étape firmware attend le délai configuré).
              </p>
            )}
          </div>

          {pauseReason && (
            <div className="pause-banner" style={{ marginTop: 14 }}>
              <span className="spinner step-spinner" />
              <span>En pause — {pauseReason}</span>
            </div>
          )}

          {runStatus !== 'idle' && (
            <div className="module-progress" style={{ marginTop: 16 }}>
              {MODULE_STEPS.map((m) => {
                const phase = phases[m.id] ?? 'pending'
                return (
                  <div key={m.id} className={`module-row module-row--${phase}`}>
                    <div className="step-icon-wrap">
                      <PhaseIcon phase={phase} />
                    </div>
                    <span className="module-row__name">{m.name}</span>
                    <span className="module-row__phase">{PHASE_LABEL[phase]}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {runStatus === 'done' && result && (
        <FinalReport
          report={result.report}
          modules={result.modules}
          meta={{
            generatedAt: new Date(result.finishedAt),
            deviceModel: device?.model,
            simulation: simulationMode,
          }}
          onRerunFailed={handleRerunFailed}
          rerunning={rerunning}
          hasFailures={hasFailures}
        />
      )}
    </>
  )
}
