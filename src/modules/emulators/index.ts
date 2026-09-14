import type { StepResult } from '../../verification'
import { installEmulator, makeDefaultIpc, type EmulatorIpc, type EmulatorSource } from './emulatorInstall'
import sourcesJson from './sources.json'

const sources = sourcesJson as EmulatorSource[]

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
  const failedCount = steps.filter((s) => s.status === 'failed_after_retries').length
  const skippedCount = steps.filter((s) => s.status === 'skipped').length

  // Les étapes ignorées ne comptent ni comme succès ni comme échec.
  let overallStatus: EmulatorsModuleResult['overallStatus']
  if (failedCount === 0 && skippedCount === 0) overallStatus = 'success'
  else if (successCount === 0 && skippedCount === 0) overallStatus = 'failed'
  else overallStatus = 'partial'

  return { moduleId: 'emulators', steps, overallStatus }
}
