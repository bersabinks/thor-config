import { runVerifiedAction, type StepResult } from '../../verification'
import { identifySystem, HEADER_READ_LENGTH, type SystemDef, extensionOf } from './identify'

export interface RomsIpc {
  /** Lit les `length` premiers octets d'un fichier local (pour la signature). */
  readHeader(localPath: string, length: number): Promise<Uint8Array>
  sha256Local(localPath: string): Promise<string>
  /** true si le binaire `chdman` est présent dans le PATH. */
  hasChdman(): Promise<boolean>
  /** Convertit un fichier disque en .chd et renvoie le chemin local du .chd. */
  chdmanConvert(localPath: string): Promise<string>
  ensureRemoteDir(serial: string, remoteDir: string): Promise<void>
  pushRom(serial: string, localPath: string, remotePath: string): Promise<void>
  /** sha256 côté appareil, via `adb shell sha256sum`. */
  sha256Device(serial: string, remotePath: string): Promise<string>
  writeRemoteText(serial: string, remotePath: string, content: string): Promise<void>
  readRemoteText(serial: string, remotePath: string): Promise<string>
}

export interface ProcessOptions {
  /** Racine ROMs sur l'appareil (convention ES-DE). */
  romsRemoteBase?: string
  maxRetries?: number
  retryDelayMs?: number
}

export interface ProcessResult {
  file: string
  system: SystemDef | null
  steps: StepResult[]
  /** Chemin distant final si le transfert a réussi. */
  remotePath?: string
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

function makeSkipped(label: string, reason: string): StepResult {
  return { label, status: 'skipped', attempts: 0, lastValue: null, note: reason, timestamp: Date.now() }
}

/**
 * Traite un fichier ROM : identification → (conversion CHD si applicable) →
 * transfert vérifié vers roms/<systeme>/. Chaque étape passe par runVerifiedAction.
 * Court-circuite proprement si l'identification échoue.
 */
export async function processRom(
  serial: string,
  filePath: string,
  ipc: RomsIpc,
  options: ProcessOptions = {}
): Promise<ProcessResult> {
  const base = options.romsRemoteBase ?? '/sdcard/ROMs'
  const maxRetries = options.maxRetries ?? 2
  const retryDelayMs = options.retryDelayMs ?? 2000
  const name = basename(filePath)
  const steps: StepResult[] = []

  // ── Étape 1 : Identification du système (déterministe, sans retry) ─────────
  let header: Uint8Array | undefined
  try {
    header = await ipc.readHeader(filePath, HEADER_READ_LENGTH)
  } catch {
    header = undefined
  }
  const ident = identifySystem(filePath, header)
  const system: SystemDef | null = ident.system

  if (!system) {
    if (ident.reason === 'ignored') {
      steps.push(
        makeSkipped(
          `${name} — Identification`,
          `Fichier ignoré (documentation ou métadonnée ${extensionOf(filePath)})`
        )
      )
      return { file: name, system: null, steps }
    }

    steps.push({
      label: `${name} — Identification`,
      status: 'failed_after_retries',
      attempts: 1,
      lastValue: null,
      error:
        ident.reason === 'ambiguous'
          ? `Extension ambiguë (candidats : ${ident.candidates?.join(', ')}) et signature non concluante`
          : 'Extension inconnue et aucune signature reconnue',
      timestamp: Date.now(),
    })
    return { file: name, system: null, steps }
  }

  steps.push({
    label: `${name} — Identification`,
    status: 'success',
    attempts: 1,
    lastValue: system.id,
    timestamp: Date.now(),
  })

  // ── Étape 2 (optionnelle) : Conversion CHD ─────────────────────────────────
  let localToPush = filePath
  let finalName = name
  if (system.chd) {
    const hasChdman = await ipc.hasChdman()
    if (!hasChdman) {
      // Spec : logguer comme bloquant plutôt que planter — on pousse l'original.
      steps.push(
        makeSkipped(
          `${name} — Conversion CHD`,
          'chdman introuvable dans le PATH — conversion ignorée, fichier poussé tel quel.'
        )
      )
    } else {
      let chdPath = ''
      const chdStep = await runVerifiedAction<string>({
        label: `${name} — Conversion CHD`,
        apply: async () => {
          chdPath = await ipc.chdmanConvert(filePath)
        },
        check: async () => chdPath,
        expected: (p) => p !== '' && p.toLowerCase().endsWith('.chd'),
        expectedDescription: 'fichier .chd généré par chdman',
        maxRetries,
        retryDelayMs,
      })
      steps.push(chdStep)
      if (chdStep.status === 'success') {
        localToPush = chdPath
        finalName = basename(chdPath)
      }
      // Si la conversion échoue, on pousse tout de même l'original (localToPush inchangé).
    }
  }

  // ── Étape 3 : Transfert vérifié vers roms/<systeme>/ ───────────────────────
  const remoteDir = `${base}/${system.folder}`
  const remotePath = `${remoteDir}/${finalName}`
  const transferStep = await runVerifiedAction<boolean>({
    label: `${name} — Transfert vérifié`,
    apply: async () => {
      await ipc.ensureRemoteDir(serial, remoteDir)
      await ipc.pushRom(serial, localToPush, remotePath)
    },
    check: async () => {
      const [local, device] = await Promise.all([
        ipc.sha256Local(localToPush),
        ipc.sha256Device(serial, remotePath),
      ])
      return local.length > 0 && local.toLowerCase() === device.toLowerCase()
    },
    expected: (match) => match === true,
    expectedDescription: 'hash SHA-256 identique entre le fichier local et le fichier sur la console',
    maxRetries,
    retryDelayMs,
  })
  steps.push(transferStep)

  return {
    file: name,
    system,
    steps,
    remotePath: transferStep.status === 'success' ? remotePath : undefined,
  }
}
