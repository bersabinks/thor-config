import { describe, it, expect } from 'vitest'
import { runOrchestrator, mergeResults, type Guard } from '../orchestrator'
import { deriveModuleStatus, type ModulePhase, type ModuleResult, type ThorModule } from '../types'
import type { StepResult } from '../../../verification'

function step(label: string, status: StepResult['status']): StepResult {
  return { label, status, attempts: 1, lastValue: null, timestamp: Date.now() }
}

/** Module factice qui remonte des étapes prédéfinies via onStep. */
function fakeModule(
  id: string,
  displayName: string,
  steps: StepResult[],
  extras: Partial<Pick<ThorModule, 'shouldRun' | 'skipReason'>> = {}
): ThorModule {
  return {
    id,
    displayName,
    ...extras,
    run: async (ctx) => {
      steps.forEach(ctx.onStep)
      return { moduleId: id, displayName, steps, overallStatus: deriveModuleStatus(steps) }
    },
  }
}

const okChecks = { steps: [step('adb', 'success'), step('device', 'success')], canProceed: true }

describe('runOrchestrator — enchaînement nominal', () => {
  it('exécute les modules dans l’ordre et agrège les étapes en direct', async () => {
    const seen: string[] = []
    const phases: [string, ModulePhase][] = []

    const res = await runOrchestrator({
      serial: 'sim',
      modules: [
        fakeModule('prepare', 'Préparation', [step('p1', 'success')]),
        fakeModule('emulators', 'Émulateurs', [step('e1', 'success'), step('e2', 'skipped')]),
        fakeModule('launcher', 'Launcher', [step('l1', 'success')]),
      ],
      preChecks: async () => okChecks,
      handlers: {
        onStep: (s) => seen.push(s.label),
        onModulePhase: (id, phase) => phases.push([id, phase]),
      },
    })

    expect(seen).toEqual(['adb', 'device', 'p1', 'e1', 'e2', 'l1'])
    expect(res.modules.map((m) => m.moduleId)).toEqual([
      'prechecks',
      'prepare',
      'emulators',
      'launcher',
    ])
    // Émulateurs a une étape ignorée → statut partiel (recalculé par le moteur).
    expect(res.modules.find((m) => m.moduleId === 'emulators')?.overallStatus).toBe('partial')
    // 5 succès (adb, device, p1, e1, l1), 0 échec ; l'ignorée (e2) hors dénominateur.
    expect(res.report.scoreLabel).toBe('5/5')
    expect(res.aborted).toBe(false)
    // Chaque module passe par 'running' puis son statut final.
    expect(phases).toContainEqual(['prepare', 'running'])
    expect(phases).toContainEqual(['launcher', 'success'])
  })

  it('un module en échec n’interrompt pas les suivants', async () => {
    const res = await runOrchestrator({
      serial: 'sim',
      modules: [
        fakeModule('prepare', 'Préparation', [step('p1', 'failed_after_retries')]),
        fakeModule('launcher', 'Launcher', [step('l1', 'success')]),
      ],
      handlers: {},
    })

    expect(res.modules.find((m) => m.moduleId === 'prepare')?.overallStatus).toBe('failed')
    expect(res.modules.find((m) => m.moduleId === 'launcher')?.overallStatus).toBe('success')
    expect(res.report.totals).toMatchObject({ success: 1, failed: 1 })
  })

  it('un module qui lève est capturé sans faire planter l’orchestrateur', async () => {
    const crashing: ThorModule = {
      id: 'roms',
      displayName: 'ROMs',
      run: async () => {
        throw new Error('boom')
      },
    }
    const res = await runOrchestrator({
      serial: 'sim',
      modules: [crashing, fakeModule('launcher', 'Launcher', [step('l1', 'success')])],
      handlers: {},
    })

    const roms = res.modules.find((m) => m.moduleId === 'roms')
    expect(roms?.overallStatus).toBe('failed')
    expect(roms?.steps[0].error).toContain('boom')
    expect(res.modules.find((m) => m.moduleId === 'launcher')?.overallStatus).toBe('success')
  })
})

describe('runOrchestrator — modules non applicables', () => {
  it('marque « skipped » un module dont shouldRun est faux, avec sa raison', async () => {
    const phases: [string, ModulePhase][] = []
    let ran = false
    const roms = fakeModule('roms', 'ROMs', [step('should-not-appear', 'success')], {
      shouldRun: () => false,
      skipReason: () => 'Aucun fichier à traiter.',
    })
    // run ne doit jamais être appelé : on le remplace pour le détecter.
    roms.run = async () => {
      ran = true
      return { moduleId: 'roms', displayName: 'ROMs', steps: [], overallStatus: 'success' }
    }

    const res = await runOrchestrator({
      serial: 'sim',
      modules: [roms],
      handlers: { onModulePhase: (id, phase) => phases.push([id, phase]) },
    })

    expect(ran).toBe(false)
    const result = res.modules.find((m) => m.moduleId === 'roms')!
    expect(result.overallStatus).toBe('skipped')
    expect(result.skippedReason).toBe('Aucun fichier à traiter.')
    expect(phases).toContainEqual(['roms', 'skipped'])
  })
})

describe('runOrchestrator — blocage dur des pré-vérifications', () => {
  it('interrompt et marque les modules restants comme ignorés', async () => {
    const phases: [string, ModulePhase][] = []
    let ran = false
    const prepare = fakeModule('prepare', 'Préparation', [])
    prepare.run = async () => {
      ran = true
      return { moduleId: 'prepare', displayName: 'Préparation', steps: [], overallStatus: 'success' }
    }

    const res = await runOrchestrator({
      serial: '',
      modules: [prepare],
      preChecks: async () => ({
        steps: [step('Console connectée', 'failed_after_retries')],
        canProceed: false,
      }),
      handlers: { onModulePhase: (id, phase) => phases.push([id, phase]) },
    })

    expect(ran).toBe(false)
    expect(res.aborted).toBe(true)
    expect(res.modules.find((m) => m.moduleId === 'prepare')?.overallStatus).toBe('skipped')
    expect(phases).toContainEqual(['prepare', 'skipped'])
  })
})

describe('runOrchestrator — pause / reprise sur garde', () => {
  it('se met en pause tant que la garde est KO, puis reprend sans redémarrer', async () => {
    let calls = 0
    const guard: Guard = async () => {
      calls++
      return calls < 3 ? { ok: false, reason: 'console déconnectée' } : { ok: true }
    }
    let pauses = 0
    let resumes = 0

    const res = await runOrchestrator({
      serial: 'sim',
      guard,
      guardPollMs: 1,
      modules: [fakeModule('launcher', 'Launcher', [step('l1', 'success')])],
      handlers: {
        onPause: () => pauses++,
        onResume: () => resumes++,
      },
    })

    expect(pauses).toBe(1)
    expect(resumes).toBe(1)
    expect(res.modules.find((m) => m.moduleId === 'launcher')?.overallStatus).toBe('success')
  })
})

describe('runOrchestrator — dépendances entre modules', () => {
  it('un module voit les résultats des modules précédents (previousResults)', async () => {
    let sawEmulators = false
    const saves: ThorModule = {
      id: 'saves',
      displayName: 'Sauvegardes',
      run: async (ctx) => {
        sawEmulators = ctx.previousResults.some((r) => r.moduleId === 'emulators')
        return { moduleId: 'saves', displayName: 'Sauvegardes', steps: [], overallStatus: 'success' }
      },
    }
    await runOrchestrator({
      serial: 'sim',
      modules: [fakeModule('emulators', 'Émulateurs', [step('e', 'success')]), saves],
      handlers: {},
    })
    expect(sawEmulators).toBe(true)
  })

  it('baseResults alimente previousResults lors d’une relance ciblée', async () => {
    const base: ModuleResult[] = [
      { moduleId: 'emulators', displayName: 'Émulateurs', steps: [step('e', 'success')], overallStatus: 'success' },
    ]
    let sawEmulators = false
    const saves: ThorModule = {
      id: 'saves',
      displayName: 'Sauvegardes',
      run: async (ctx) => {
        sawEmulators = ctx.previousResults.some((r) => r.moduleId === 'emulators')
        return { moduleId: 'saves', displayName: 'Sauvegardes', steps: [step('s', 'success')], overallStatus: 'success' }
      },
    }
    const res = await runOrchestrator({ serial: 'sim', modules: [saves], baseResults: base, handlers: {} })
    expect(sawEmulators).toBe(true)

    const merged = mergeResults(base, res.modules)
    expect(merged.map((m) => m.moduleId)).toEqual(['emulators', 'saves'])
    expect(merged.find((m) => m.moduleId === 'saves')?.steps).toHaveLength(1)
  })
})
