import type { StepResult } from '../../verification'
import {
  installEmulator,
  makeDefaultIpc,
  type EmulatorIpc,
  type EmulatorSource,
  type InstallOptions,
} from './emulatorInstall'
import { makeDefaultObtainiumIpc, setupObtainium, type ObtainiumIpc } from './obtainium'
import sourcesJson from './sources.json'

const sources = sourcesJson as EmulatorSource[]

export {
  OBTAINIUM_APPS_JSON_REMOTE_PATH,
  OBTAINIUM_INSTALLED_MESSAGE,
  OBTAINIUM_SOURCE,
  buildObtainiumAppsJson,
} from './obtainium'

export interface EmulatorsRunContext {
  serial: string
  onStep: (result: StepResult) => void
  ipc?: EmulatorIpc
  obtainiumIpc?: ObtainiumIpc
  options?: InstallOptions
}

export interface EmulatorsModuleResult {
  moduleId: 'emulators'
  steps: StepResult[]
  overallStatus: 'success' | 'partial' | 'failed'
}

export async function run(ctx: EmulatorsRunContext): Promise<EmulatorsModuleResult> {
  const { serial, onStep, ipc = makeDefaultIpc(), options } = ctx
  const steps: StepResult[] = []
  const emit = (step: StepResult) => {
    steps.push(step)
    onStep(step)
  }

  for (const source of sources) {
    ;(await installEmulator(serial, source, ipc, options)).forEach(emit)
  }

  // Gestionnaire de mises à jour, alimenté avec la liste des émulateurs.
  ;(await setupObtainium(serial, sources, ctx.obtainiumIpc ?? makeDefaultObtainiumIpc(), options)).forEach(emit)

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
