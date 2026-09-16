import type { StepResult } from '../../verification'
import {
  installUtility,
  makeDefaultIpc,
  type InstallOptions,
  type UtilityIpc,
  type UtilitySource,
} from './utilityInstall'
import sourcesJson from './sources.json'

export const UTILITY_SOURCES = sourcesJson as UtilitySource[]

export interface UtilitiesRunContext {
  serial: string
  onStep: (result: StepResult) => void
  ipc?: UtilityIpc
  options?: InstallOptions
}

export interface UtilitiesModuleResult {
  moduleId: 'utilities'
  steps: StepResult[]
  overallStatus: 'success' | 'partial' | 'failed' | 'skipped'
}

export async function run(ctx: UtilitiesRunContext): Promise<UtilitiesModuleResult> {
  const { serial, onStep, ipc = makeDefaultIpc(), options = {} } = ctx
  const steps: StepResult[] = []

  for (const source of UTILITY_SOURCES) {
    const utilitySteps = await installUtility(serial, source, ipc, options)
    for (const step of utilitySteps) {
      steps.push(step)
      onStep(step)
    }
  }

  const successCount = steps.filter((s) => s.status === 'success').length
  const failedCount = steps.filter((s) => s.status === 'failed_after_retries').length
  const skippedCount = steps.filter((s) => s.status === 'skipped').length

  let overallStatus: UtilitiesModuleResult['overallStatus']
  if (steps.length === 0) overallStatus = 'skipped'
  else if (failedCount === 0 && skippedCount === 0) overallStatus = 'success'
  else if (successCount === 0 && skippedCount === 0) overallStatus = 'failed'
  else overallStatus = 'partial'

  return { moduleId: 'utilities', steps, overallStatus }
}
