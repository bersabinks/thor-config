import type { StepResult } from '../../verification'
import type { ModuleResult, ModuleStatus } from './types'

/** Décompte des 3 catégories du récapitulatif sur un lot d'étapes. */
export interface Tally {
  success: number
  skipped: number
  failed: number
  /** success + skipped + failed */
  total: number
}

export function tally(steps: readonly StepResult[]): Tally {
  const success = steps.filter((s) => s.status === 'success').length
  const skipped = steps.filter((s) => s.status === 'skipped').length
  const failed = steps.filter((s) => s.status === 'failed_after_retries').length
  return { success, skipped, failed, total: success + skipped + failed }
}

export interface ModuleReport {
  moduleId: string
  displayName: string
  status: ModuleStatus
  tally: Tally
  /** Étapes en échec de ce module, pour la liste détaillée du rapport. */
  failures: StepResult[]
  skippedReason?: string
}

export interface ReportSummary {
  /** Décompte global, toutes étapes de tous les modules confondues. */
  totals: Tally
  /**
   * Score = réussies / (réussies + échouées). Les étapes ignorées (non
   * automatisables sans root) sont exclues du dénominateur : ce ne sont pas des
   * échecs, seulement des actions laissées à l'utilisateur. Voir `skipped`.
   */
  scorePassed: number
  scoreTotal: number
  /** Représentation « 52/53 » du score. */
  scoreLabel: string
  /** Pourcentage entier (0–100) ; 100 si aucune vérification décisive. */
  scorePercent: number
  perModule: ModuleReport[]
}

export function buildReport(modules: readonly ModuleResult[]): ReportSummary {
  const perModule: ModuleReport[] = modules.map((m) => ({
    moduleId: m.moduleId,
    displayName: m.displayName,
    status: m.overallStatus,
    tally: tally(m.steps),
    failures: m.steps.filter((s) => s.status === 'failed_after_retries'),
    skippedReason: m.skippedReason,
  }))

  const totals = perModule.reduce<Tally>(
    (acc, m) => ({
      success: acc.success + m.tally.success,
      skipped: acc.skipped + m.tally.skipped,
      failed: acc.failed + m.tally.failed,
      total: acc.total + m.tally.total,
    }),
    { success: 0, skipped: 0, failed: 0, total: 0 }
  )

  const scoreTotal = totals.success + totals.failed
  const scorePassed = totals.success
  const scorePercent = scoreTotal === 0 ? 100 : Math.round((scorePassed / scoreTotal) * 100)

  return {
    totals,
    scorePassed,
    scoreTotal,
    scoreLabel: `${scorePassed}/${scoreTotal}`,
    scorePercent,
    perModule,
  }
}

/** Modules encore à traiter (échec ou partiel) : cibles du « relancer les échecs ». */
export function failedModuleIds(modules: readonly ModuleResult[]): string[] {
  return modules
    .filter((m) => m.overallStatus === 'failed' || m.overallStatus === 'partial')
    .map((m) => m.moduleId)
}

const STATUS_FR: Record<ModuleStatus, string> = {
  success: 'réussi',
  partial: 'partiel',
  failed: 'échec',
  skipped: 'ignoré',
}

export interface ReportMeta {
  generatedAt?: Date
  deviceModel?: string
  simulation?: boolean
}

/** Rapport final au format JSON (support / réinstallation future). */
export function reportToJson(
  report: ReportSummary,
  modules: readonly ModuleResult[],
  meta: ReportMeta = {}
): string {
  return JSON.stringify(
    {
      generatedAt: (meta.generatedAt ?? new Date()).toISOString(),
      deviceModel: meta.deviceModel ?? null,
      simulation: meta.simulation ?? null,
      score: report.scoreLabel,
      scorePercent: report.scorePercent,
      totals: report.totals,
      modules: modules.map((m) => ({
        moduleId: m.moduleId,
        displayName: m.displayName,
        status: m.overallStatus,
        skippedReason: m.skippedReason ?? null,
        steps: m.steps,
      })),
    },
    null,
    2
  )
}

/** Rapport final au format Markdown, lisible tel quel. */
export function reportToMarkdown(
  report: ReportSummary,
  meta: ReportMeta = {}
): string {
  const when = (meta.generatedAt ?? new Date()).toLocaleString('fr-FR')
  const lines: string[] = []
  lines.push('# Rapport de configuration ThorConfig')
  lines.push('')
  lines.push(`- **Date** : ${when}`)
  if (meta.deviceModel) lines.push(`- **Console** : ${meta.deviceModel}`)
  if (meta.simulation !== undefined) {
    lines.push(`- **Mode** : ${meta.simulation ? 'simulation' : 'réel'}`)
  }
  lines.push(
    `- **Score** : ${report.scoreLabel} vérifications passées (${report.scorePercent} %)`
  )
  lines.push(
    `- **Réussies** : ${report.totals.success} · **Ignorées** : ${report.totals.skipped} · **Échouées** : ${report.totals.failed}`
  )
  lines.push('')
  lines.push('## Détail par module')
  lines.push('')
  lines.push('| Module | Statut | Réussies | Ignorées | Échouées |')
  lines.push('| --- | --- | ---: | ---: | ---: |')
  for (const m of report.perModule) {
    lines.push(
      `| ${m.displayName} | ${STATUS_FR[m.status]} | ${m.tally.success} | ${m.tally.skipped} | ${m.tally.failed} |`
    )
  }

  const withFailures = report.perModule.filter((m) => m.failures.length > 0)
  if (withFailures.length > 0) {
    lines.push('')
    lines.push('## Échecs à revoir')
    lines.push('')
    for (const m of withFailures) {
      lines.push(`### ${m.displayName}`)
      for (const f of m.failures) {
        lines.push(`- **${f.label}** — ${f.error ?? 'échec après plusieurs tentatives'}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}
