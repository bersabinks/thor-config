import type { SavesIpc } from './savesProcess'
import { SAVE_PATHS } from './savesProcess'

/**
 * Chemin local virtuel `saves://<emu>/<id>/<rel>` : le renderer le compose de
 * façon pure, le process main le résout en chemin réel sous userData/backups.
 */
function virtualPath(emulatorId: string, backupId: string, ...rel: string[]): string {
  return `saves://${emulatorId}/${backupId}/${rel.join('/')}`
}

/** IPC réel : opérations device (ADB) + stockage local, côté main. */
export function makeDefaultSavesIpc(): SavesIpc {
  const s = window.electronAPI.saves
  return {
    listDeviceFiles: (serial, dir) => s.listDeviceFiles(serial, dir),
    sha256Device: (serial, p) => s.sha256Device(serial, p),
    deviceFileSize: (serial, p) => s.deviceFileSize(serial, p),
    pullFile: (serial, dp, lp) => s.pullFile(serial, dp, lp),
    pushFile: (serial, lp, dp) => s.pushFile(serial, lp, dp),
    ensureRemoteDir: (serial, dir) => s.ensureRemoteDir(serial, dir),
    sha256Local: (lp) => s.sha256Local(lp),
    writeText: (lp, c) => s.writeText(lp, c),
    readText: (lp) => s.readText(lp),
    localBackupPath: virtualPath,
  }
}

// ── Simulation : device en mémoire pré-rempli, sans appareil ni fichiers ──────

/** Hash déterministe 64-hex (pas un vrai SHA-256, mais cohérent local↔device). */
function fakeSha(content: string): string {
  let h = 0
  for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0').repeat(8)
}

/** Saves fictives par émulateur (première racine connue de chaque). */
function seedDevice(): Map<string, string> {
  const device = new Map<string, string>()
  const seed: Record<string, string[]> = {
    'watermelonds': ['Pokemon HeartGold.sav', 'Mario Kart DS.sav'],
    azahar: ['title/000/data.bin'],
    dolphin: ['MemoryCardA.USA.raw'],
    cemu: ['80000000/user/common/data.bin'],
  }
  for (const [emu, files] of Object.entries(seed)) {
    const root = SAVE_PATHS[emu]?.[0]
    if (!root) continue
    for (const f of files) device.set(`${root.devicePath}/${f}`, `${emu}:${f}:contenu-sauvegarde`)
  }
  return device
}

/**
 * IPC de simulation, avec état partagé (une même instance sert un backup PUIS
 * une restauration), pour dérouler le flux sensible sans risque.
 */
export function makeSimulationSavesIpc(): SavesIpc {
  const device = seedDevice()
  const local = new Map<string, string>()

  return {
    async listDeviceFiles(_s, dir) {
      const prefix = dir.endsWith('/') ? dir : dir + '/'
      return [...device.keys()].filter((k) => k.startsWith(prefix))
    },
    async sha256Device(_s, p) {
      if (!device.has(p)) throw new Error('device: absent ' + p)
      return fakeSha(device.get(p)!)
    },
    async deviceFileSize(_s, p) {
      return (device.get(p) ?? '').length
    },
    async pullFile(_s, dp, lp) {
      if (!device.has(dp)) throw new Error('device: absent ' + dp)
      local.set(lp, device.get(dp)!)
    },
    async pushFile(_s, lp, dp) {
      if (!local.has(lp)) throw new Error('local: absent ' + lp)
      device.set(dp, local.get(lp)!)
    },
    async ensureRemoteDir() {
      /* no-op */
    },
    async sha256Local(lp) {
      if (!local.has(lp)) throw new Error('local: absent ' + lp)
      return fakeSha(local.get(lp)!)
    },
    async writeText(lp, c) {
      local.set(lp, c)
    },
    async readText(lp) {
      if (!local.has(lp)) throw new Error('local: absent ' + lp)
      return local.get(lp)!
    },
    localBackupPath: virtualPath,
  }
}
