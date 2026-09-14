import type { StepResult } from '../../verification'
import { configureLauncher, type LauncherIpc, type LauncherOptions } from './launcherProcess'
import { makeDefaultLauncherIpc } from './launcherIpc'

export { configureLauncher, LAUNCHER_CONFIG, LAUNCHER_COMMANDS } from './launcherProcess'
export type { LauncherConfig, LauncherIpc, LauncherOptions } from './launcherProcess'
export { makeDefaultLauncherIpc, makeSimulationLauncherIpc } from './launcherIpc'

export interface LauncherRunContext {
  serial: string
  onStep: (result: StepResult) => void
  ipc?: LauncherIpc
  options?: LauncherOptions
}

export interface LauncherModuleResult {
  moduleId: 'launcher'
  steps: StepResult[]
  overallStatus: 'success' | 'partial' | 'failed'
}

export async function run(ctx: LauncherRunContext): Promise<LauncherModuleResult> {
  const { serial, onStep, ipc = makeDefaultLauncherIpc(), options } = ctx
  const steps = await configureLauncher(serial, ipc, options)
  steps.forEach(onStep)

  const failed = steps.filter((s) => s.status === 'failed_after_retries').length
  const success = steps.filter((s) => s.status === 'success').length
  const skipped = steps.filter((s) => s.status === 'skipped').length

  let overallStatus: LauncherModuleResult['overallStatus']
  if (failed === 0 && skipped === 0) overallStatus = 'success'
  else if (success === 0) overallStatus = 'failed'
  else overallStatus = 'partial'

  return { moduleId: 'launcher', steps, overallStatus }
}
