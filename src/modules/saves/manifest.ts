export interface ManifestFileEntry {
  /** Chemin relatif à la racine du backup (stable local ↔ device). */
  relPath: string
  /** Chemin absolu d'origine sur l'appareil (pour la restauration). */
  devicePath: string
  sha256: string
  size: number
  /** true si le hash a été vérifié bit-à-bit au moment de la sauvegarde. */
  verified: boolean
}

export type BackupKind = 'initial' | 'manual' | 'pre-restore'

export interface SaveManifest {
  version: 1
  emulatorId: string
  serial: string
  createdAt: string
  kind: BackupKind
  files: ManifestFileEntry[]
}

export function buildManifest(params: {
  emulatorId: string
  serial: string
  createdAt: string
  kind: BackupKind
  files: ManifestFileEntry[]
}): SaveManifest {
  return { version: 1, ...params }
}

export function serializeManifest(manifest: SaveManifest): string {
  return JSON.stringify(manifest, null, 2)
}

/**
 * Parse et **valide strictement** un manifest. Lève une erreur explicite au
 * moindre doute — un manifest corrompu ne doit jamais être interprété de façon
 * permissive, car il pilote une restauration destructive.
 */
export function parseManifest(json: string): SaveManifest {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (err) {
    throw new Error(`Manifest illisible (JSON invalide) : ${(err as Error).message}`)
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Manifest invalide : racine non-objet')
  }
  const m = raw as Record<string, unknown>
  if (m.version !== 1) throw new Error(`Manifest version non supportée : ${String(m.version)}`)
  if (typeof m.emulatorId !== 'string' || !m.emulatorId)
    throw new Error('Manifest invalide : emulatorId manquant')
  if (typeof m.kind !== 'string') throw new Error('Manifest invalide : kind manquant')
  if (!Array.isArray(m.files)) throw new Error('Manifest invalide : files n’est pas un tableau')

  const files: ManifestFileEntry[] = m.files.map((f, i) => {
    const e = f as Record<string, unknown>
    if (typeof e.relPath !== 'string' || !e.relPath)
      throw new Error(`Manifest invalide : files[${i}].relPath manquant`)
    if (typeof e.devicePath !== 'string' || !e.devicePath)
      throw new Error(`Manifest invalide : files[${i}].devicePath manquant`)
    if (typeof e.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(e.sha256))
      throw new Error(`Manifest invalide : files[${i}].sha256 n’est pas un SHA-256`)
    if (typeof e.size !== 'number')
      throw new Error(`Manifest invalide : files[${i}].size manquant`)
    return {
      relPath: e.relPath,
      devicePath: e.devicePath,
      sha256: e.sha256.toLowerCase(),
      size: e.size,
      verified: e.verified === true,
    }
  })

  return {
    version: 1,
    emulatorId: m.emulatorId,
    serial: typeof m.serial === 'string' ? m.serial : '',
    createdAt: typeof m.createdAt === 'string' ? m.createdAt : '',
    kind: m.kind as BackupKind,
    files,
  }
}

export type FileVerificationStatus = 'ok' | 'mismatch' | 'missing' | 'extra'

export interface FileVerification {
  relPath: string
  status: FileVerificationStatus
  expected?: string
  actual?: string
}

/**
 * Compare les hashs attendus (manifest) à ceux réellement observés.
 * Sert à la fois à afficher le statut d'un backup et à valider une restauration.
 */
export function verifyAgainstManifest(
  manifest: SaveManifest,
  actual: Map<string, string>
): FileVerification[] {
  const results: FileVerification[] = []
  const seen = new Set<string>()

  for (const entry of manifest.files) {
    seen.add(entry.relPath)
    const got = actual.get(entry.relPath)
    if (got === undefined) {
      results.push({ relPath: entry.relPath, status: 'missing', expected: entry.sha256 })
    } else if (got.toLowerCase() !== entry.sha256.toLowerCase()) {
      results.push({ relPath: entry.relPath, status: 'mismatch', expected: entry.sha256, actual: got })
    } else {
      results.push({ relPath: entry.relPath, status: 'ok', expected: entry.sha256, actual: got })
    }
  }

  for (const relPath of actual.keys()) {
    if (!seen.has(relPath)) results.push({ relPath, status: 'extra', actual: actual.get(relPath) })
  }

  return results
}

/** true si toutes les entrées du manifest sont 'ok' (aucun mismatch/missing). */
export function allVerified(results: FileVerification[]): boolean {
  return results.every((r) => r.status === 'ok' || r.status === 'extra')
}
