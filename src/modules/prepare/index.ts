import type { StepResult } from '../../verification'
import { runGestureNavigation } from './steps/gestureNavigation'
import { runFirmwareUpdate } from './steps/firmwareUpdate'
import { runAynSettings } from './steps/aynSettings'

export interface PrepareRunContext {
  serial: string
  onStep: (result: StepResult) => void
}

export interface PrepareModuleResult {
  moduleId: 'prepare'
  steps: StepResult[]
  overallStatus: 'success' | 'partial' | 'failed'
}

async function safeRun(
  fn: () => Promise<StepResult>,
  onStep: (r: StepResult) => void,
  steps: StepResult[]
): Promise<void> {
  try {
    const result = await fn()
    steps.push(result)
    onStep(result)
  } catch (err) {
    const result: StepResult = {
      label: fn.name || 'Étape',
      status: 'failed_after_retries',
      attempts: 1,
      lastValue: String(err),
      timestamp: Date.now(),
    }
    steps.push(result)
    onStep(result)
  }
}

/**
 * Point d'entrée du module Préparation.
 * Chaque étape est exécutée indépendamment : un échec ne bloque pas les suivantes.
 * Compatible avec l'interface ThorModule du Prompt 8 (run(ctx) => Promise<ModuleResult>).
 */
export async function run(ctx: PrepareRunContext): Promise<PrepareModuleResult> {
  const { serial, onStep } = ctx
  const steps: StepResult[] = []

  // ── Étape 1 : Navigation par gestes ──────────────────────────────────
  await safeRun(() => runGestureNavigation(serial), onStep, steps)

  // ── Étape 2 : Mise à jour firmware ───────────────────────────────────
  await safeRun(() => runFirmwareUpdate(serial), onStep, steps)

  // ── Étape 3 : Réglages AYN (ABXY + gâchettes) → 2 sous-étapes ───────
  try {
    const aynResults = await runAynSettings(serial)
    for (const r of aynResults) {
      steps.push(r)
      onStep(r)
    }
  } catch (err) {
    const result: StepResult = {
      label: 'AYN Settings',
      status: 'failed_after_retries',
      attempts: 1,
      lastValue: String(err),
      timestamp: Date.now(),
    }
    steps.push(result)
    onStep(result)
  }

  const successCount = steps.filter((s) => s.status === 'success').length
  const overallStatus =
    successCount === steps.length
      ? 'success'
      : successCount > 0
      ? 'partial'
      : 'failed'

  return { moduleId: 'prepare', steps, overallStatus }
}
