import { runVerifiedAction, type StepResult } from '../../verification'
import { describeError } from '../../../electron/main/adb/errors'
import { VITA_TARGETS } from './vitaProcess'
import firmwareJson from './vitaFirmware.json'

export interface VitaFirmwarePackage {
  id: string
  displayName: string
  fileName: string
  /** Sous-dossier de remoteRoot ('' = racine). Préinstallation et polices portent le même nom de fichier. */
  remoteSubdir: string
  url: string
  sha256: string
  size: number
}

export const VITA_FIRMWARE_PACKAGES: VitaFirmwarePackage[] = firmwareJson.packages
export const VITA_FIRMWARE_REMOTE_ROOT: string = firmwareJson.remoteRoot

export function firmwareRemoteDir(pkg: VitaFirmwarePackage): string {
  return pkg.remoteSubdir ? `${VITA_FIRMWARE_REMOTE_ROOT}/${pkg.remoteSubdir}` : VITA_FIRMWARE_REMOTE_ROOT
}

export function firmwareRemotePath(pkg: VitaFirmwarePackage): string {
  return `${firmwareRemoteDir(pkg)}/${pkg.fileName}`
}

export interface VitaFirmwareIpc {
  getPackageInfo(serial: string, packageName: string): Promise<{ versionName: string } | null>
  /** Téléchargement côté main depuis les serveurs Sony, SHA-256 vérifié (cache réutilisé). */
  downloadFirmware(id: string): Promise<{ localPath: string; sha256: string; fromCache: boolean }>
  ensureRemoteDir(serial: string, remoteDir: string): Promise<void>
  pushFile(serial: string, localPath: string, remotePath: string): Promise<void>
  sha256Device(serial: string, remotePath: string): Promise<string>
}

export interface VitaFirmwareOptions {
  maxRetries?: number
  retryDelayMs?: number
  packages?: VitaFirmwarePackage[]
}

const LABEL = 'Firmware Vita3K'

function makeStep(label: string, status: StepResult['status'], extra: Partial<StepResult> = {}): StepResult {
  return { label, status, attempts: status === 'skipped' ? 0 : 1, lastValue: null, timestamp: Date.now(), ...extra }
}

/**
 * Firmware Vita3K : détection de Vita3K → pour chaque paquet officiel,
 * téléchargement vérifié (SHA-256 connu) puis dépôt sur la console vérifié par
 * hash → installation guidée dans Vita3K. Ignoré si Vita3K n'est pas installé.
 */
export async function installVitaFirmware(
  serial: string,
  ipc: VitaFirmwareIpc,
  options: VitaFirmwareOptions = {}
): Promise<StepResult[]> {
  const retry = { maxRetries: options.maxRetries ?? 2, retryDelayMs: options.retryDelayMs ?? 2000 }
  const packages = options.packages ?? VITA_FIRMWARE_PACKAGES
  const vita3k = VITA_TARGETS.vita3kPackageName
  const detectLabel = `${LABEL} — Détection de Vita3K`

  if (!serial) {
    return [makeStep(detectLabel, 'skipped', { note: 'Aucune console connectée : firmware non transféré.' })]
  }
  let installed: boolean
  try {
    installed = (await ipc.getPackageInfo(serial, vita3k)) !== null
  } catch (err) {
    return [makeStep(detectLabel, 'failed_after_retries', { error: `Console injoignable : ${describeError(err)}` })]
  }
  if (!installed) {
    return [
      makeStep(detectLabel, 'skipped', {
        note: `Vita3K (${vita3k}) n’est pas installé sur la console : téléchargement et transfert du firmware ignorés.`,
      }),
    ]
  }

  const steps: StepResult[] = [makeStep(detectLabel, 'success', { lastValue: vita3k })]
  const delivered: string[] = []

  for (const pkg of packages) {
    const remote = firmwareRemotePath(pkg)
    let localPath = ''
    let downloadedSha = ''
    let fromCache = false

    const download = await runVerifiedAction<string>({
      label: `${LABEL} — Téléchargement ${pkg.displayName}`,
      apply: async () => {
        const r = await ipc.downloadFirmware(pkg.id)
        localPath = r.localPath
        downloadedSha = r.sha256
        fromCache = r.fromCache
      },
      check: async () => downloadedSha,
      expected: (sha) => sha === pkg.sha256,
      expectedDescription: `SHA-256 officiel ${pkg.sha256}`,
      ...retry,
    })
    steps.push(
      download.status === 'success'
        ? { ...download, note: fromCache ? 'Déjà en cache, intégrité revérifiée.' : `Téléchargé depuis ${new URL(pkg.url).host}.` }
        : download
    )

    const transferLabel = `${LABEL} — Transfert console ${pkg.displayName}`
    if (download.status !== 'success') {
      steps.push(
        makeStep(transferLabel, 'failed_after_retries', {
          attempts: 0,
          error: 'Prérequis non rempli : fichier non téléchargé ou intégrité non vérifiée — rien n’a été transféré.',
        })
      )
      continue
    }

    let alreadyOnDevice = false
    const transfer = await runVerifiedAction<string>({
      label: transferLabel,
      apply: async () => {
        // Idempotence : fichier déjà présent et identique → pas de nouveau transfert.
        // (sha256sum sur un fichier absent échoue : traité comme « absent ».)
        const existing = await ipc.sha256Device(serial, remote).catch(() => '')
        if (existing === pkg.sha256) {
          alreadyOnDevice = true
          return
        }
        await ipc.ensureRemoteDir(serial, firmwareRemoteDir(pkg))
        await ipc.pushFile(serial, localPath, remote)
      },
      check: () => ipc.sha256Device(serial, remote),
      expected: (sha) => sha === pkg.sha256,
      expectedDescription: `${remote} identique au fichier officiel (SHA-256)`,
      ...retry,
    })
    if (transfer.status === 'success') delivered.push(remote)
    steps.push(
      transfer.status === 'success'
        ? { ...transfer, note: alreadyOnDevice ? `Déjà présent et identique : ${remote}` : `Déposé : ${remote}` }
        : transfer
    )
  }

  steps.push(
    makeStep(`${LABEL} — Installation dans Vita3K`, 'skipped', {
      lastValue: delivered,
      note:
        delivered.length > 0
          ? `Installation non automatisable : Vita3K stocke le firmware dans Android/data (inaccessible par ADB sans root). Dans Vita3K → Install Firmware, sélectionner successivement : ${delivered.join(' ; ')}.`
          : 'Aucun fichier déposé sur la console : installation impossible.',
    })
  )
  return steps
}
