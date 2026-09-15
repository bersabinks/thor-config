import { existsSync, mkdirSync, renameSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import { downloadToFile } from '../net/download'
import { describeError } from './errors'
import type { AdbLocation } from './adbPath'

/** Archive officielle Google des Android platform-tools pour Windows. */
export const PLATFORM_TOOLS_URL =
  'https://dl.google.com/android/repository/platform-tools-latest-windows.zip'

/** Fichiers sans lesquels adb ne fonctionne pas sous Windows. */
export const PLATFORM_TOOLS_REQUIRED_FILES = ['adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll']

/** L'archive fait ~8 Mio : au-delà de 200 Mio, la réponse n'est pas celle attendue. */
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024

export type AdbSetupState =
  | { phase: 'checking' }
  /** adb déjà présent sur le poste (PATH, SDK, ADB_PATH) : rien à faire. */
  | { phase: 'system'; path: string; source: Exclude<AdbLocation['source'], 'internal'> }
  | { phase: 'downloading'; receivedBytes: number; totalBytes: number | null }
  | { phase: 'extracting' }
  /** adb local de ThorConfig installé et fonctionnel. */
  | { phase: 'ready'; path: string; version: string }
  | { phase: 'error'; message: string }

export interface PlatformToolsDeps {
  detect: () => AdbLocation | null
  /** Dossier final, ex. %APPDATA%/ThorConfig/platform-tools. */
  installDir: string
  url?: string
  requiredFiles?: string[]
  fetchImpl?: typeof fetch
  /** Extrait un zip dans destDir (vidé au préalable), avec protection zip-slip. */
  extractZip: (zipPath: string, destDir: string) => Promise<string[]>
  /** Exécute `adb version` et renvoie sa première ligne ; lève si adb ne fonctionne pas. */
  verifyAdb: (adbPath: string) => Promise<string>
}

/**
 * Zero-Setup ADB : si aucun adb n'est détecté, télécharge les platform-tools
 * officiels, les extrait dans le dossier interne et vérifie que le binaire
 * s'exécute. Le PATH système n'est jamais modifié : RealAdbClient trouve la
 * copie interne via adbPath.ts. Ne lève jamais : l'échec est un état.
 */
export async function ensurePlatformTools(
  deps: PlatformToolsDeps,
  onState: (state: AdbSetupState) => void = () => {}
): Promise<AdbSetupState> {
  const emit = (state: AdbSetupState): AdbSetupState => {
    onState(state)
    return state
  }
  emit({ phase: 'checking' })

  const found = deps.detect()
  if (found && found.source !== 'internal') {
    return emit({ phase: 'system', path: found.path, source: found.source })
  }
  if (found) {
    try {
      return emit({ phase: 'ready', path: found.path, version: await deps.verifyAdb(found.path) })
    } catch {
      /* copie interne corrompue : on la retélécharge */
    }
  }

  const required = deps.requiredFiles ?? PLATFORM_TOOLS_REQUIRED_FILES
  const parent = dirname(deps.installDir)
  const zipPath = join(parent, 'platform-tools-download.zip')
  const staging = join(parent, 'platform-tools-staging')
  let installed = false

  try {
    await downloadToFile(deps.url ?? PLATFORM_TOOLS_URL, zipPath, {
      fetchImpl: deps.fetchImpl,
      maxBytes: MAX_ARCHIVE_BYTES,
      onProgress: (p) => onState({ phase: 'downloading', ...p }),
    })

    emit({ phase: 'extracting' })
    await deps.extractZip(zipPath, staging)
    const extracted = join(staging, 'platform-tools')
    const missing = required.filter((f) => !existsSync(join(extracted, f)))
    if (missing.length > 0) {
      throw new Error(`archive platform-tools incomplète (${missing.join(', ')} absent)`)
    }

    rmSync(deps.installDir, { recursive: true, force: true })
    mkdirSync(parent, { recursive: true })
    renameSync(extracted, deps.installDir)
    installed = true

    const adb = join(deps.installDir, required[0])
    return emit({ phase: 'ready', path: adb, version: await deps.verifyAdb(adb) })
  } catch (err) {
    // Un adb installé mais inutilisable ne doit pas être détecté au prochain lancement.
    if (installed) rmSync(deps.installDir, { recursive: true, force: true })
    return emit({
      phase: 'error',
      message: `Installation automatique d’ADB impossible : ${describeError(err)}`,
    })
  } finally {
    rmSync(zipPath, { force: true })
    rmSync(staging, { recursive: true, force: true })
  }
}
