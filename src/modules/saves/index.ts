import { backup, type SavesIpc, type SavesOptions } from './savesProcess'
import type { StepResult } from '../../verification'

export { backup, restore, migrate, SAVE_PATHS } from './savesProcess'
export type {
  SavesIpc,
  SavesOptions,
  BackupResult,
  RestoreResult,
  MigrateResult,
  OverallStatus,
  SaveRoot,
} from './savesProcess'
export { makeDefaultSavesIpc, makeSimulationSavesIpc } from './savesIpc'
export type { SaveManifest, ManifestFileEntry, FileVerification } from './manifest'

/** Identifiant de backup horodaté, sûr pour un nom de dossier. */
export function makeBackupId(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/g, '-')
}

/**
 * Sauvegarde "état initial" automatique, déclenchée après l'installation réussie
 * d'un émulateur (Prompt 3 → Prompt 5). Chaque étape est remontée via onStep.
 */
export async function runInitialBackups(
  serial: string,
  emulatorIds: string[],
  ipc: SavesIpc,
  onStep: (step: StepResult) => void,
  options: SavesOptions = {}
): Promise<void> {
  for (const id of emulatorIds) {
    const res = await backup(serial, id, 'initial', makeBackupId(), ipc, options)
    res.steps.forEach(onStep)
  }
}
