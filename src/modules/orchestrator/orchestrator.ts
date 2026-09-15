import type { StepResult } from '../../verification'
import type { ModulePhase, ModuleResult, RunContext, ThorModule } from './types'
import { deriveModuleStatus, makeInfoStep } from './types'
import { buildReport, type ReportSummary } from './report'

/** État renvoyé par la garde exécutée avant chaque module. */
export interface GuardStatus {
  ok: boolean
  /** Raison de la mise en pause quand ok est faux (ex. « console déconnectée »). */
  reason?: string
}

export type Guard = () => Promise<GuardStatus>

export interface PreCheckOutcome {
  steps: StepResult[]
  canProceed: boolean
}

export interface OrchestratorHandlers {
  onStep?: (step: StepResult) => void
  onModulePhase?: (moduleId: string, phase: ModulePhase) => void
  /** Appelé au passage en pause (garde KO) puis à la reprise. */
  onPause?: (moduleId: string, reason: string) => void
  onResume?: (moduleId: string) => void
}

export interface RunOrchestratorOptions {
  serial: string
  modules: ThorModule[]
  /** Pré-vérifications (ignorées lors d'une relance ciblée). */
  preChecks?: () => Promise<PreCheckOutcome>
  /** Garde exécutée avant chaque module ; si absente, aucune pause. */
  guard?: Guard
  /** Intervalle de sondage pendant une pause (défaut 3 s). */
  guardPollMs?: number
  handlers?: OrchestratorHandlers
  /**
   * Résultats d'un run précédent : servent à alimenter `previousResults` (ex.
   * relancer Sauvegardes seul doit voir le résultat Émulateurs antérieur).
   */
  baseResults?: ModuleResult[]
}

export interface OrchestratorResult {
  /** Résultat des seuls modules exécutés dans ce run (préfixé des pré-vérifs). */
  modules: ModuleResult[]
  report: ReportSummary
  startedAt: number
  finishedAt: number
  /** Vrai si une pré-vérification bloquante a interrompu l'orchestration. */
  aborted: boolean
}

const PRECHECK_MODULE_ID = 'prechecks'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Attend que la garde repasse au vert, en sondant à intervalle régulier. Émet
 * onPause une seule fois à l'entrée, onResume à la sortie. Sans garde, no-op.
 */
async function awaitGuard(
  moduleId: string,
  guard: Guard | undefined,
  pollMs: number,
  handlers: OrchestratorHandlers
): Promise<void> {
  if (!guard) return
  let paused = false
  for (;;) {
    const status = await guard()
    if (status.ok) break
    if (!paused) {
      paused = true
      handlers.onPause?.(moduleId, status.reason ?? 'condition bloquante')
    }
    await sleep(pollMs)
  }
  if (paused) handlers.onResume?.(moduleId)
}

/**
 * Exécute les modules dans l'ordre derrière le bouton unique. Chaque étape est
 * remontée en direct ; un module en échec n'interrompt jamais les suivants ; une
 * garde KO met l'orchestrateur en pause (sans redémarrer les modules terminés)
 * jusqu'à résolution. Les pré-vérifications sont agrégées comme un pseudo-module.
 */
export async function runOrchestrator(
  options: RunOrchestratorOptions
): Promise<OrchestratorResult> {
  const { serial, modules, preChecks, guard, handlers = {}, baseResults = [] } = options
  const pollMs = options.guardPollMs ?? 3000
  const startedAt = Date.now()

  const emitStep = (step: StepResult) => handlers.onStep?.(step)
  const executed: ModuleResult[] = []

  // ── Pré-vérifications ──────────────────────────────────────────────────────
  if (preChecks) {
    handlers.onModulePhase?.(PRECHECK_MODULE_ID, 'running')
    const outcome = await preChecks()
    outcome.steps.forEach(emitStep)
    const preResult: ModuleResult = {
      moduleId: PRECHECK_MODULE_ID,
      displayName: 'Pré-vérifications',
      steps: outcome.steps,
      overallStatus: deriveModuleStatus(outcome.steps),
    }
    executed.push(preResult)
    handlers.onModulePhase?.(PRECHECK_MODULE_ID, preResult.overallStatus)

    if (!outcome.canProceed) {
      // Blocage dur : on marque les modules restants comme ignorés et on s'arrête.
      for (const mod of modules) {
        const reason = 'Non exécuté : pré-vérifications bloquantes non satisfaites.'
        const info = makeInfoStep(`${mod.displayName} — Non exécuté`, reason)
        emitStep(info)
        executed.push({
          moduleId: mod.id,
          displayName: mod.displayName,
          steps: [info],
          overallStatus: 'skipped',
          skippedReason: reason,
        })
        handlers.onModulePhase?.(mod.id, 'skipped')
      }
      const finishedAt = Date.now()
      return { modules: executed, report: buildReport(executed), startedAt, finishedAt, aborted: true }
    }
  }

  // ── Modules, dans l'ordre ──────────────────────────────────────────────────
  for (const mod of modules) {
    // `previousResults` = base d'un run antérieur + modules déjà terminés ici.
    const previousResults = [...baseResults.filter((r) => !executed.some((e) => e.moduleId === r.moduleId)), ...executed]
    const ctx: RunContext = { serial, onStep: emitStep, previousResults }

    await awaitGuard(mod.id, guard, pollMs, handlers)
    handlers.onModulePhase?.(mod.id, 'running')

    // Le module s'applique-t-il ? (ex. ROMs sans fichier, PS Vita sans archive)
    let willRun = true
    if (mod.shouldRun) {
      try {
        willRun = await mod.shouldRun(ctx)
      } catch {
        willRun = true // en cas de doute, on tente le module plutôt que de l'ignorer
      }
    }

    if (!willRun) {
      const reason = mod.skipReason?.(ctx) ?? 'Rien à traiter pour ce module.'
      const info = makeInfoStep(`${mod.displayName} — Ignoré`, reason)
      emitStep(info)
      const result: ModuleResult = {
        moduleId: mod.id,
        displayName: mod.displayName,
        steps: [info],
        overallStatus: 'skipped',
        skippedReason: reason,
      }
      executed.push(result)
      handlers.onModulePhase?.(mod.id, 'skipped')
      continue
    }

    let result: ModuleResult
    try {
      const raw = await mod.run(ctx)
      // Verdict recalculé uniformément à partir des étapes remontées.
      result = { ...raw, moduleId: mod.id, displayName: mod.displayName, overallStatus: deriveModuleStatus(raw.steps) }
    } catch (err) {
      // Un module ne devrait pas lever, mais on ne laisse jamais l'orchestrateur planter.
      const msg = err instanceof Error ? err.message : String(err)
      const crash: StepResult = {
        label: `${mod.displayName} — Erreur inattendue`,
        status: 'failed_after_retries',
        attempts: 1,
        lastValue: null,
        error: msg,
        timestamp: Date.now(),
      }
      emitStep(crash)
      result = { moduleId: mod.id, displayName: mod.displayName, steps: [crash], overallStatus: 'failed' }
    }

    executed.push(result)
    handlers.onModulePhase?.(mod.id, result.overallStatus)
  }

  const finishedAt = Date.now()
  return { modules: executed, report: buildReport(executed), startedAt, finishedAt, aborted: false }
}

/**
 * Fusionne les résultats d'une relance ciblée dans un jeu de résultats complet :
 * chaque module relancé remplace son entrée, les autres sont conservés tels quels.
 */
export function mergeResults(
  base: readonly ModuleResult[],
  rerun: readonly ModuleResult[]
): ModuleResult[] {
  const byId = new Map(rerun.map((r) => [r.moduleId, r]))
  const merged = base.map((r) => byId.get(r.moduleId) ?? r)
  // Modules relancés absents de la base (rare) : ajoutés à la fin.
  for (const r of rerun) if (!base.some((b) => b.moduleId === r.moduleId)) merged.push(r)
  return merged
}
