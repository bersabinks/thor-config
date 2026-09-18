import { runVerifiedAction, type StepResult } from '../../verification'
import type { BiosCandidate } from './biosDetect'

export interface BiosIpc {
  sha256Local(localPath: string): Promise<string>
  sha256Device(serial: string, remotePath: string): Promise<string>
  ensureRemoteDir(serial: string, remoteDir: string): Promise<void>
  pushFile(serial: string, localPath: string, remotePath: string): Promise<void>
}

export interface RunBiosOptions {
  serial: string
  candidates: BiosCandidate[]
  onStep: (step: StepResult) => void
  ipc: BiosIpc
  maxRetries?: number
  retryDelayMs?: number
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i > 0 ? path.slice(0, i) : '/'
}

export async function processBios(
  serial: string,
  candidate: BiosCandidate,
  ipc: BiosIpc,
  options: { maxRetries?: number; retryDelayMs?: number } = {}
): Promise<StepResult[]> {
  const steps: StepResult[] = []
  const maxRetries = options.maxRetries ?? 2
  const retryDelayMs = options.retryDelayMs ?? 1000

  let localHash: string
  try {
    localHash = await ipc.sha256Local(candidate.localPath)
  } catch (err) {
    steps.push({
      label: `BIOS ${candidate.system} (${candidate.fileName}) — Hash local`,
      status: 'failed_after_retries',
      attempts: 1,
      lastValue: null,
      error: `Lecture du hash local impossible : ${String(err)}`,
      timestamp: Date.now(),
    })
    return steps
  }

  // Déploiement vérifié sur chaque chemin cible (ex: /sdcard/BIOS et /sdcard/ROMs/bios)
  for (const remotePath of candidate.targetRemotePaths) {
    const result = await runVerifiedAction<string>({
      label: `BIOS ${candidate.system} — ${candidate.fileName}`,
      apply: async () => {
        // Idempotence : si le fichier existe déjà avec le bon hash, pas de transfert
        try {
          const existingHash = await ipc.sha256Device(serial, remotePath)
          if (existingHash.toLowerCase() === localHash.toLowerCase()) {
            return
          }
        } catch {
          // Absent ou illisible, on procède au push
        }

        await ipc.ensureRemoteDir(serial, dirname(remotePath))
        await ipc.pushFile(serial, candidate.localPath, remotePath)
      },
      check: async () => ipc.sha256Device(serial, remotePath),
      expected: (hash) => hash.toLowerCase() === localHash.toLowerCase(),
      expectedDescription: `SHA-256 console identique au fichier source (${localHash.slice(0, 8)}…)`,
      maxRetries,
      retryDelayMs,
    })

    steps.push(result)
  }

  return steps
}

export async function runBios({
  serial,
  candidates,
  onStep,
  ipc,
  maxRetries,
  retryDelayMs,
}: RunBiosOptions): Promise<StepResult[]> {
  const allSteps: StepResult[] = []

  if (candidates.length === 0) {
    const infoStep: StepResult = {
      label: 'BIOS & Firmwares — Détection',
      status: 'skipped',
      attempts: 1,
      lastValue: 0,
      note: 'Aucun fichier BIOS détecté dans le dossier d’import (optionnel si vos jeux ne requièrent pas de BIOS externe).',
      timestamp: Date.now(),
    }
    onStep(infoStep)
    allSteps.push(infoStep)
    return allSteps
  }

  for (const candidate of candidates) {
    const steps = await processBios(serial, candidate, ipc, { maxRetries, retryDelayMs })
    for (const s of steps) {
      onStep(s)
      allSteps.push(s)
    }
  }

  return allSteps
}
