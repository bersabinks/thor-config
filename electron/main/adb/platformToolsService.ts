import { BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import { detectAdb, internalPlatformToolsDir } from './adbPath'
import { ensurePlatformTools, type AdbSetupState } from './platformTools'
import { extractArchive } from '../vita/archive'

let state: AdbSetupState = { phase: 'checking' }
let running: Promise<AdbSetupState> | null = null
let lastProgressSent = 0

/** Diffuse l'état aux fenêtres ; la progression est limitée à 4 envois par seconde. */
function publish(next: AdbSetupState): void {
  state = next
  if (next.phase === 'downloading') {
    const now = Date.now()
    const finished = next.totalBytes !== null && next.receivedBytes >= next.totalBytes
    if (!finished && now - lastProgressSent < 250) return
    lastProgressSent = now
  }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('adb:setupState', next)
}

function verifyAdb(adbPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(adbPath, ['version'], { timeout: 15_000, windowsHide: true }, (err, stdout) => {
      if (err) return reject(err)
      const first = String(stdout).split(/\r?\n/)[0].trim()
      if (!/Android Debug Bridge/i.test(first)) {
        return reject(new Error(`sortie inattendue de « adb version » : ${first}`))
      }
      resolve(first)
    })
  })
}

export function getAdbSetupState(): AdbSetupState {
  return state
}

/** Lance (ou rejoint) la vérification/installation d'adb. */
export function startAdbSetup(): Promise<AdbSetupState> {
  if (running) return running

  const installDir = internalPlatformToolsDir()
  if (process.platform !== 'win32' || !installDir) {
    const found = detectAdb()
    publish(
      found && found.source !== 'internal'
        ? { phase: 'system', path: found.path, source: found.source }
        : { phase: 'error', message: 'Téléchargement automatique d’ADB disponible uniquement sous Windows.' }
    )
    return Promise.resolve(state)
  }

  running = ensurePlatformTools(
    { detect: () => detectAdb(), installDir, extractZip: extractArchive, verifyAdb },
    publish
  ).finally(() => {
    running = null
  })
  return running
}
