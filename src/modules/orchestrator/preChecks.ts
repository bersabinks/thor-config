import type { StepResult } from '../../verification'
import type { AdbDevice } from '../../../electron/main/adb/types'

/** Sous-ensemble d'ADB nécessaire aux pré-vérifications (injectable pour les tests). */
export interface PreCheckIpc {
  listDevices(): Promise<AdbDevice[]>
  shell(serial: string, cmd: string): Promise<string>
}

export interface PreCheckOptions {
  /** Espace libre minimal exigé sur /sdcard (défaut 2 Gio). */
  requiredFreeBytes?: number
  /** Point de montage interrogé par df (défaut /sdcard). */
  storagePath?: string
}

export interface PreCheckResult {
  steps: StepResult[]
  /** Faux si une condition bloquante (adb, device, autorisation) n'est pas remplie. */
  canProceed: boolean
  /** Serial du premier appareil autorisé, sinon null. */
  serial: string | null
}

const DEFAULT_REQUIRED_FREE = 2 * 1024 * 1024 * 1024 // 2 Gio

function ok(label: string, note: string, lastValue: unknown = true): StepResult {
  return { label, status: 'success', attempts: 1, lastValue, note, timestamp: Date.now() }
}

function ko(label: string, error: string, lastValue: unknown = null): StepResult {
  return { label, status: 'failed_after_retries', attempts: 1, lastValue, error, timestamp: Date.now() }
}

function skip(label: string, note: string): StepResult {
  return { label, status: 'skipped', attempts: 0, lastValue: null, note, timestamp: Date.now() }
}

/**
 * Parse la colonne « Available » de `df -k <path>` (blocs de 1 Kio) → octets.
 * Renvoie null si la sortie n'est pas exploitable.
 */
export function parseDfAvailableBytes(dfOutput: string): number | null {
  const lines = dfOutput.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return null
  // La ligne de données peut être « repliée » : on prend la dernière ligne non vide.
  const cols = lines[lines.length - 1].trim().split(/\s+/)
  // Format busybox/toybox : Filesystem 1K-blocks Used Available Use% Mounted
  // Available est l'avant-avant-dernière quand Use% et Mounted suivent.
  const availIdx = cols.length >= 6 ? cols.length - 3 : 3
  const kib = Number(cols[availIdx])
  return Number.isFinite(kib) ? kib * 1024 : null
}

function formatGiB(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} Gio`
}

/**
 * Pré-vérifications avant l'orchestration : plate-forme ADB joignable, console
 * connectée, débogage USB autorisé, espace de stockage suffisant. Les trois
 * premières sont bloquantes ; l'espace disque est indicatif (échec non bloquant).
 */
export async function runPreChecks(
  ipc: PreCheckIpc,
  options: PreCheckOptions = {}
): Promise<PreCheckResult> {
  const requiredFree = options.requiredFreeBytes ?? DEFAULT_REQUIRED_FREE
  const storagePath = options.storagePath ?? '/sdcard'
  const steps: StepResult[] = []

  // ── 1. Plate-forme ADB / platform-tools disponible ────────────────────────
  let devices: AdbDevice[]
  try {
    devices = await ipc.listDevices()
    steps.push(ok('Plate-forme ADB disponible', 'Le binaire adb répond et liste les appareils.'))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    steps.push(
      ko(
        'Plate-forme ADB disponible',
        `adb introuvable ou injoignable : ${msg}. Installez les platform-tools Android.`
      )
    )
    return { steps, canProceed: false, serial: null }
  }

  // ── 2. Console connectée ──────────────────────────────────────────────────
  if (devices.length === 0) {
    steps.push(ko('Console connectée', 'Aucun appareil détecté. Branchez la console en USB.'))
    return { steps, canProceed: false, serial: null }
  }
  const device = devices[0]
  steps.push(ok('Console connectée', `${device.model} (${device.serial})`, device.serial))

  // ── 3. Débogage USB autorisé ──────────────────────────────────────────────
  if (device.state !== 'device') {
    const reason =
      device.state === 'unauthorized'
        ? 'Autorisez le débogage USB sur l’écran de la console (case « toujours autoriser »).'
        : `Appareil en état « ${device.state} » — reconnectez la console.`
    steps.push(ko('Débogage USB autorisé', reason, device.state))
    return { steps, canProceed: false, serial: null }
  }
  steps.push(ok('Débogage USB autorisé', 'La console a accepté ce poste (état « device »).'))

  // ── 4. Espace de stockage suffisant (non bloquant) ────────────────────────
  try {
    const df = await ipc.shell(device.serial, `df -k ${storagePath}`)
    const free = parseDfAvailableBytes(df)
    if (free === null) {
      steps.push(
        skip(
          'Espace de stockage suffisant',
          `Impossible de lire l’espace libre sur ${storagePath} — vérification ignorée.`
        )
      )
    } else if (free < requiredFree) {
      steps.push(
        ko(
          'Espace de stockage suffisant',
          `Seulement ${formatGiB(free)} libres sur ${storagePath} (minimum ${formatGiB(requiredFree)}). Libérez de l’espace.`,
          free
        )
      )
    } else {
      steps.push(
        ok('Espace de stockage suffisant', `${formatGiB(free)} libres sur ${storagePath}.`, free)
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    steps.push(skip('Espace de stockage suffisant', `df a échoué (${msg}) — vérification ignorée.`))
  }

  return { steps, canProceed: true, serial: device.serial }
}

/** IPC réel : réutilise le pont ADB déjà exposé (mocké automatiquement en simulation). */
export function makeDefaultPreCheckIpc(): PreCheckIpc {
  return {
    listDevices: () => window.electronAPI.adb.listDevices(),
    shell: (serial, cmd) => window.electronAPI.adb.shell(serial, cmd),
  }
}
