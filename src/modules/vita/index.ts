import type { StepResult } from '../../verification'
import { isVitaStructure } from './layout'
import {
  processVitaArchive,
  type VitaIpc,
  type VitaOptions,
  type VitaProcessResult,
} from './vitaProcess'

export { processVitaArchive, VITA_TARGETS } from './vitaProcess'
export type { VitaIpc, VitaOptions, VitaProcessResult, VitaTarget, VitaGameOutput } from './vitaProcess'
export { makeDefaultVitaIpc, makeSimulationVitaIpc, SIMULATION_IMPORT_FILES } from './vitaIpc'

export interface VitaRunContext {
  serial: string
  files: string[]
  onStep: (result: StepResult) => void
  ipc: VitaIpc
  options?: VitaOptions
}

export interface VitaModuleResult {
  moduleId: 'vita'
  steps: StepResult[]
  processed: VitaProcessResult[]
  overallStatus: 'success' | 'partial' | 'failed'
}

const ARCHIVE_EXT_RE = /\.(zip|7z)$/i

/** Archive susceptible de contenir un jeu PS Vita (routée vers ce module, pas vers ROMs). */
export function isVitaArchiveCandidate(path: string): boolean {
  return ARCHIVE_EXT_RE.test(path)
}

/** true si le fichier se trouve dans un sous-dossier dédié "PSVita/". */
export function isInPsVitaFolder(path: string): boolean {
  const segments = path.split(/[\\/]/)
  segments.pop()
  return segments.some((s) => s.toLowerCase() === 'psvita')
}

/**
 * Sélectionne les archives à traiter parmi des fichiers détectés :
 * - .zip/.7z dans un dossier "PSVita/" → toujours traitées (une structure
 *   invalide y produit un échec explicite plutôt qu'un oubli silencieux) ;
 * - ailleurs → uniquement si la liste de l'archive contient un sce_sys/param.sfo.
 */
export async function selectVitaArchives(files: string[], ipc: VitaIpc): Promise<string[]> {
  const selected: string[] = []
  for (const file of files) {
    if (!isVitaArchiveCandidate(file)) continue
    if (isInPsVitaFolder(file)) {
      selected.push(file)
      continue
    }
    try {
      if (isVitaStructure(await ipc.listArchive(file))) selected.push(file)
    } catch {
      /* archive illisible : pas un jeu PS Vita reconnaissable */
    }
  }
  return selected
}

export async function run(ctx: VitaRunContext): Promise<VitaModuleResult> {
  const { serial, files, onStep, ipc, options } = ctx
  const steps: StepResult[] = []
  const processed: VitaProcessResult[] = []

  for (const file of files) {
    const res = await processVitaArchive(serial, file, ipc, options)
    processed.push(res)
    for (const s of res.steps) {
      steps.push(s)
      onStep(s)
    }
  }

  const failed = steps.filter((s) => s.status === 'failed_after_retries').length
  const success = steps.filter((s) => s.status === 'success').length
  const skipped = steps.filter((s) => s.status === 'skipped').length

  let overallStatus: VitaModuleResult['overallStatus']
  if (failed === 0 && skipped === 0) overallStatus = 'success'
  else if (success === 0 && skipped === 0) overallStatus = 'failed'
  else overallStatus = 'partial'

  return { moduleId: 'vita', steps, processed, overallStatus }
}
