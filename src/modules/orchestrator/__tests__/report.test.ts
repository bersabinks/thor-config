import { describe, it, expect } from 'vitest'
import {
  buildReport,
  tally,
  failedModuleIds,
  reportToJson,
  reportToMarkdown,
} from '../report'
import type { ModuleResult } from '../types'
import type { StepResult } from '../../../verification'

function step(label: string, status: StepResult['status']): StepResult {
  return { label, status, attempts: 1, lastValue: null, timestamp: Date.now() }
}

const modules: ModuleResult[] = [
  {
    moduleId: 'prepare',
    displayName: 'Préparation',
    steps: [step('p1', 'success'), step('p2', 'success')],
    overallStatus: 'success',
  },
  {
    moduleId: 'emulators',
    displayName: 'Émulateurs',
    steps: [step('e1', 'success'), step('e2', 'skipped'), step('e3', 'failed_after_retries')],
    overallStatus: 'partial',
  },
  {
    moduleId: 'vita',
    displayName: 'PS Vita',
    steps: [step('v1', 'skipped')],
    overallStatus: 'skipped',
    skippedReason: 'Aucune archive PS Vita.',
  },
]

describe('tally', () => {
  it('compte les 3 catégories', () => {
    expect(tally(modules[1].steps)).toEqual({ success: 1, skipped: 1, failed: 1, total: 3 })
  })
})

describe('buildReport', () => {
  it('exclut les ignorées du score mais les compte à part', () => {
    const r = buildReport(modules)
    // succès = 3 (p1,p2,e1) ; échec = 1 (e3) ; ignorées = 2 (e2,v1)
    expect(r.totals).toEqual({ success: 3, skipped: 2, failed: 1, total: 6 })
    expect(r.scoreLabel).toBe('3/4')
    expect(r.scorePercent).toBe(75)
  })

  it('score = 100 % quand aucune vérification décisive (tout ignoré)', () => {
    const r = buildReport([
      { moduleId: 'x', displayName: 'X', steps: [step('a', 'skipped')], overallStatus: 'skipped' },
    ])
    expect(r.scoreLabel).toBe('0/0')
    expect(r.scorePercent).toBe(100)
  })

  it('détaille chaque module avec ses échecs', () => {
    const r = buildReport(modules)
    const emu = r.perModule.find((m) => m.moduleId === 'emulators')!
    expect(emu.failures.map((f) => f.label)).toEqual(['e3'])
    expect(emu.tally.success).toBe(1)
  })
})

describe('failedModuleIds', () => {
  it('renvoie les modules en échec ou partiels, pas les réussis/ignorés', () => {
    expect(failedModuleIds(modules)).toEqual(['emulators'])
  })
})

describe('exports', () => {
  it('JSON : score, totaux et modules sérialisés', () => {
    const r = buildReport(modules)
    const parsed = JSON.parse(reportToJson(r, modules, { deviceModel: 'AYN Thor Max', simulation: true }))
    expect(parsed.score).toBe('3/4')
    expect(parsed.deviceModel).toBe('AYN Thor Max')
    expect(parsed.simulation).toBe(true)
    expect(parsed.modules).toHaveLength(3)
  })

  it('Markdown : en-tête, score, tableau et section échecs', () => {
    const r = buildReport(modules)
    const md = reportToMarkdown(r, { simulation: true })
    expect(md).toContain('# Rapport de configuration ThorConfig')
    expect(md).toContain('3/4 vérifications passées (75 %)')
    expect(md).toContain('| Émulateurs | partiel |')
    expect(md).toContain('## Échecs à revoir')
    expect(md).toContain('**e3**')
  })
})
