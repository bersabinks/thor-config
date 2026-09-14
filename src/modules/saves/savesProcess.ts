import { runVerifiedAction, type StepResult } from '../../verification'
import {
  buildManifest,
  parseManifest,
  serializeManifest,
  verifyAgainstManifest,
  type BackupKind,
  type ManifestFileEntry,
  type SaveManifest,
} from './manifest'
import savePathsJson from './emulatorSavePaths.json'

export interface SaveRoot {
  label: string
  devicePath: string
}

export const SAVE_PATHS = savePathsJson as Record<string, SaveRoot[]>

export interface SavesIpc {
  // ── Appareil ──────────────────────────────────────────────────────────────
  /** Liste récursive des fichiers (chemins absolus) sous un dossier ; [] si absent. */
  listDeviceFiles(serial: string, deviceDir: string): Promise<string[]>
  sha256Device(serial: string, devicePath: string): Promise<string>
  deviceFileSize(serial: string, devicePath: string): Promise<number>
  pullFile(serial: string, devicePath: string, localPath: string): Promise<void>
  pushFile(serial: string, localPath: string, devicePath: string): Promise<void>
  ensureRemoteDir(serial: string, deviceDir: string): Promise<void>
  // ── Stockage local ──────────────────────────────────────────────────────────
  sha256Local(localPath: string): Promise<string>
  writeText(localPath: string, content: string): Promise<void>
  readText(localPath: string): Promise<string>
  /** Construit le chemin local d'un fichier dans un backup donné. */
  localBackupPath(emulatorId: string, backupId: string, ...rel: string[]): string
}

export interface SavesOptions {
  maxRetries?: number
  retryDelayMs?: number
  /** Id du snapshot de sécurité créé avant une restauration. */
  safetyBackupId?: string
}

export type OverallStatus = 'success' | 'partial' | 'failed' | 'empty'

export interface BackupResult {
  backupId: string
  manifest: SaveManifest | null
  steps: StepResult[]
  overallStatus: OverallStatus
}

export interface RestoreResult {
  steps: StepResult[]
  overallStatus: OverallStatus
  /** Id du snapshot de sécurité pris avant écrasement (recovery possible). */
  safetyBackupId: string | null
}

const SHA_RE = /^[a-f0-9]{64}$/i

function makeStep(
  label: string,
  status: StepResult['status'],
  extra: Partial<StepResult> = {}
): StepResult {
  return { label, status, attempts: 1, lastValue: null, timestamp: Date.now(), ...extra }
}

function deviceDirname(devicePath: string): string {
  const i = devicePath.lastIndexOf('/')
  return i > 0 ? devicePath.slice(0, i) : '/'
}

function overallOf(steps: StepResult[]): OverallStatus {
  if (steps.length === 0) return 'empty'
  const failed = steps.filter((s) => s.status === 'failed_after_retries').length
  const ok = steps.filter((s) => s.status === 'success').length
  if (failed === 0) return 'success'
  if (ok === 0) return 'failed'
  return 'partial'
}

// ── Sauvegarde ────────────────────────────────────────────────────────────────

/**
 * Sauvegarde tous les dossiers de save connus d'un émulateur vers un dossier
 * local horodaté + manifest.json. Chaque fichier est vérifié **bit-à-bit** :
 * on hash la source sur l'appareil, on pull, puis on re-hash la copie locale et
 * on exige l'égalité. Un fichier non vérifié est marqué verified:false.
 */
export async function backup(
  serial: string,
  emulatorId: string,
  kind: BackupKind,
  backupId: string,
  ipc: SavesIpc,
  options: SavesOptions = {}
): Promise<BackupResult> {
  const maxRetries = options.maxRetries ?? 2
  const retryDelayMs = options.retryDelayMs ?? 2000
  const roots = SAVE_PATHS[emulatorId] ?? []
  const steps: StepResult[] = []
  const entries: ManifestFileEntry[] = []

  for (const root of roots) {
    let files: string[] = []
    try {
      files = await ipc.listDeviceFiles(serial, root.devicePath)
    } catch {
      files = []
    }

    for (const devicePath of files) {
      const relInRoot = devicePath.slice(root.devicePath.length).replace(/^\/+/, '')
      const relPath = `${root.label}/${relInRoot}`
      const localPath = ipc.localBackupPath(emulatorId, backupId, relPath)
      const label = `${emulatorId} · ${relPath} — Sauvegarde vérifiée`

      // Hash de référence, pris sur l'appareil (source de vérité).
      let deviceHash = ''
      try {
        deviceHash = await ipc.sha256Device(serial, devicePath)
      } catch {
        deviceHash = ''
      }
      if (!SHA_RE.test(deviceHash)) {
        steps.push(
          makeStep(label, 'failed_after_retries', {
            error: `Hash SHA-256 illisible sur l'appareil pour ${devicePath}`,
          })
        )
        continue // pas d'entrée manifest sans hash valide
      }

      // Pull + vérification bit-à-bit (retry re-pull si mismatch).
      const step = await runVerifiedAction<string>({
        label,
        apply: async () => {
          await ipc.pullFile(serial, devicePath, localPath)
        },
        check: async () => ipc.sha256Local(localPath),
        expected: (localHash) => localHash.toLowerCase() === deviceHash.toLowerCase(),
        expectedDescription: `copie locale identique au device (${deviceHash.slice(0, 12)}…)`,
        maxRetries,
        retryDelayMs,
      })
      steps.push(step)

      let size = 0
      try {
        size = await ipc.deviceFileSize(serial, devicePath)
      } catch {
        size = 0
      }

      entries.push({
        relPath,
        devicePath,
        sha256: deviceHash.toLowerCase(),
        size,
        verified: step.status === 'success',
      })
    }
  }

  const manifest = buildManifest({ emulatorId, serial, createdAt: backupId, kind, files: entries })
  try {
    await ipc.writeText(
      ipc.localBackupPath(emulatorId, backupId, 'manifest.json'),
      serializeManifest(manifest)
    )
  } catch (err) {
    steps.push(
      makeStep(`${emulatorId} — Écriture du manifest`, 'failed_after_retries', {
        error: `Impossible d'écrire le manifest : ${(err as Error).message}`,
      })
    )
  }

  return { backupId, manifest, steps, overallStatus: overallOf(steps) }
}

// ── Restauration (chemin destructif — fail-closed) ─────────────────────────────

/**
 * Restaure un backup sur l'appareil. Garde-fous, dans l'ordre :
 *  1. Le manifest doit se parser ; sinon on abandonne (aucune écriture device).
 *  2. Le backup local est **re-vérifié contre son propre manifest** : si un
 *     fichier ne correspond pas à son hash, on abandonne — on ne pousse jamais
 *     des données corrompues par-dessus des saves saines.
 *  3. Un **snapshot de sécurité** de l'état actuel de l'appareil est pris avant
 *     tout écrasement (récupération possible).
 *  4. Chaque fichier poussé est re-hashé sur l'appareil et comparé au manifest.
 */
export async function restore(
  serial: string,
  emulatorId: string,
  backupId: string,
  ipc: SavesIpc,
  options: SavesOptions = {}
): Promise<RestoreResult> {
  const maxRetries = options.maxRetries ?? 2
  const retryDelayMs = options.retryDelayMs ?? 2000
  const steps: StepResult[] = []

  // 1. Charger + parser le manifest.
  let manifest: SaveManifest
  try {
    const json = await ipc.readText(ipc.localBackupPath(emulatorId, backupId, 'manifest.json'))
    manifest = parseManifest(json)
  } catch (err) {
    steps.push(
      makeStep(`Restauration ${backupId} — Lecture du manifest`, 'failed_after_retries', {
        error: `Manifest introuvable ou corrompu : ${(err as Error).message}`,
      })
    )
    return { steps, overallStatus: 'failed', safetyBackupId: null }
  }

  // 2. Vérifier l'intégrité du backup local AVANT de toucher à l'appareil.
  const localHashes = new Map<string, string>()
  for (const f of manifest.files) {
    const localPath = ipc.localBackupPath(emulatorId, backupId, f.relPath)
    try {
      localHashes.set(f.relPath, await ipc.sha256Local(localPath))
    } catch {
      localHashes.set(f.relPath, '')
    }
  }
  const integrity = verifyAgainstManifest(manifest, localHashes)
  const problems = integrity.filter((r) => r.status === 'mismatch' || r.status === 'missing')
  if (problems.length > 0) {
    steps.push(
      makeStep('Intégrité du backup local', 'failed_after_retries', {
        error:
          `${problems.length} fichier(s) du backup ne correspondent pas à leur hash ` +
          `(${problems.map((p) => p.relPath).join(', ')}) — restauration annulée, ` +
          `aucune donnée n'a été écrasée.`,
        lastValue: problems,
      })
    )
    return { steps, overallStatus: 'failed', safetyBackupId: null }
  }
  steps.push(
    makeStep('Intégrité du backup local', 'success', { lastValue: `${manifest.files.length} fichier(s)` })
  )

  // 3. Snapshot de sécurité de l'état courant de l'appareil.
  const safetyBackupId = options.safetyBackupId ?? `${backupId}__pre-restore`
  const safety = await backup(serial, emulatorId, 'pre-restore', safetyBackupId, ipc, {
    maxRetries,
    retryDelayMs,
  })
  if (safety.overallStatus === 'failed' || safety.overallStatus === 'partial') {
    steps.push(
      makeStep('Snapshot de sécurité pré-restauration', 'failed_after_retries', {
        error:
          "Impossible de sauvegarder de façon fiable l'état actuel avant restauration — " +
          'restauration annulée pour éviter une perte irréversible.',
      })
    )
    return { steps, overallStatus: 'failed', safetyBackupId: null }
  }
  steps.push(
    makeStep('Snapshot de sécurité pré-restauration', 'success', {
      lastValue: `${safety.manifest?.files.length ?? 0} fichier(s) sauvegardés (${safetyBackupId})`,
    })
  )

  // 4. Pousser chaque fichier puis vérifier son hash sur l'appareil.
  for (const f of manifest.files) {
    const localPath = ipc.localBackupPath(emulatorId, backupId, f.relPath)
    const label = `${emulatorId} · ${f.relPath} — Restauration vérifiée`
    const step = await runVerifiedAction<string>({
      label,
      apply: async () => {
        await ipc.ensureRemoteDir(serial, deviceDirname(f.devicePath))
        await ipc.pushFile(serial, localPath, f.devicePath)
      },
      check: async () => ipc.sha256Device(serial, f.devicePath),
      expected: (deviceHash) => deviceHash.toLowerCase() === f.sha256.toLowerCase(),
      expectedDescription: `hash device == hash manifest (${f.sha256.slice(0, 12)}…)`,
      maxRetries,
      retryDelayMs,
    })
    steps.push(step)
  }

  return { steps, overallStatus: overallOf(steps), safetyBackupId }
}

// ── Migration ──────────────────────────────────────────────────────────────────

export interface MigrateResult {
  steps: StepResult[]
  overallStatus: OverallStatus
  backupId: string
  safetyBackupId: string | null
}

/**
 * Migre les saves d'un émulateur d'un appareil source vers un appareil cible :
 * backup(source) vérifié, puis restore(target) réutilisant ce backup (avec tous
 * les garde-fous de restore, dont le snapshot de sécurité côté cible).
 */
export async function migrate(
  sourceSerial: string,
  targetSerial: string,
  emulatorId: string,
  backupId: string,
  ipc: SavesIpc,
  options: SavesOptions = {}
): Promise<MigrateResult> {
  const b = await backup(sourceSerial, emulatorId, 'manual', backupId, ipc, options)
  if (b.overallStatus === 'failed' || b.overallStatus === 'partial') {
    return {
      steps: b.steps,
      overallStatus: 'failed',
      backupId,
      safetyBackupId: null,
    }
  }
  if (b.overallStatus === 'empty') {
    return { steps: b.steps, overallStatus: 'empty', backupId, safetyBackupId: null }
  }

  const r = await restore(targetSerial, emulatorId, backupId, ipc, options)
  const steps = [...b.steps, ...r.steps]
  const overallStatus = r.overallStatus === 'success' ? 'success' : overallOf(steps)
  return { steps, overallStatus, backupId, safetyBackupId: r.safetyBackupId }
}
