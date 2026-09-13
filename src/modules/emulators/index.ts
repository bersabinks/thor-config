import type { StepResult } from '../../verification'
import { installEmulator, makeDefaultIpc, type EmulatorIpc } from './emulatorInstall'
import sources from './sources.json'

export interface EmulatorsRunContext {
  serial: string
  onStep: (result: StepResult) => void
  ipc?: EmulatorIpc
}

export interface EmulatorsModuleResult {
  moduleId: 'emulators'
  steps: StepResult[]
  overallStatus: 'success' | 'partial' | 'failed'
}

export async function run(ctx: EmulatorsRunContext): Promise<EmulatorsModuleResult> {
  const { serial, onStep, ipc = makeDefaultIpc() } = ctx
  const steps: StepResult[] = []

  for (const source of sources) {
    const emulatorSteps = await installEmulator(serial, source, ipc)
    for (const step of emulatorSteps) {
      steps.push(step)
      onStep(step)
    }
  }

  const successCount = steps.filter((s) => s.status === 'success').length
  const overallStatus =
    successCount === steps.length ? 'success' : successCount > 0 ? 'partial' : 'failed'

  return { moduleId: 'emulators', steps, overallStatus }
}
