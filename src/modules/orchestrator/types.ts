import type { StepResult } from '../../verification'

/** Verdict agrégé d'un module, aligné sur les 3 catégories du récapitulatif. */
export type ModuleStatus = 'success' | 'partial' | 'failed' | 'skipped'

/** Phase de cycle de vie d'un module dans l'écran de suivi temps réel. */
export type ModulePhase = 'pending' | 'running' | 'paused' | ModuleStatus

export interface ModuleResult {
  moduleId: string
  displayName: string
  steps: StepResult[]
  overallStatus: ModuleStatus
  /** Renseigné quand le module a été ignoré (non applicable dans ce run). */
  skippedReason?: string
}

/**
 * Contexte transmis à chaque module par l'orchestrateur. Uniforme pour tous les
 * modules (Prompt 8) : chaque wrapper y puise `serial`/`onStep` et peut inspecter
 * `previousResults` pour ses dépendances (ex. Sauvegardes ← Émulateurs installés).
 */
export interface RunContext {
  serial: string
  onStep: (step: StepResult) => void
  /** Résultats des modules déjà terminés (dans l'ordre d'exécution). */
  previousResults: ReadonlyArray<ModuleResult>
}

/**
 * Interface commune du Prompt 8. Les modules des Prompts 2→7 gardent leur logique ;
 * un mince wrapper les expose sous cette forme (cf. thorModules.ts).
 */
export interface ThorModule {
  id: string
  displayName: string
  /** Si présent et faux, le module est marqué 'skipped' sans s'exécuter. */
  shouldRun?: (ctx: RunContext) => boolean | Promise<boolean>
  /** Raison lisible affichée quand shouldRun renvoie faux. */
  skipReason?: (ctx: RunContext) => string
  run: (ctx: RunContext) => Promise<ModuleResult>
}

/**
 * Déduit le verdict d'un module à partir de ses étapes, avec la même règle
 * partout : les étapes 'skipped' (non automatisables) ne comptent pas comme des
 * échecs mais empêchent un « succès complet ».
 */
export function deriveModuleStatus(steps: readonly StepResult[]): ModuleStatus {
  if (steps.length === 0) return 'skipped'
  const failed = steps.filter((s) => s.status === 'failed_after_retries').length
  const success = steps.filter((s) => s.status === 'success').length
  const skipped = steps.filter((s) => s.status === 'skipped').length

  if (failed === 0 && skipped === 0) return 'success'
  if (success === 0 && skipped === 0) return 'failed'
  return 'partial'
}

/** Étape informative (ni succès ni échec) pour tracer une décision dans le journal. */
export function makeInfoStep(label: string, note: string): StepResult {
  return { label, status: 'skipped', attempts: 0, lastValue: null, note, timestamp: Date.now() }
}
