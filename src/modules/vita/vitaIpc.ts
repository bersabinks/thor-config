import { buildSfo } from './sfo'
import { VITA_TARGETS, type VitaIpc } from './vitaProcess'
import { VITA_FIRMWARE_PACKAGES, type VitaFirmwareIpc } from './firmware'

/** IPC réel du firmware Vita3K : téléchargement vérifié côté main + ADB. */
export function makeDefaultVitaFirmwareIpc(): VitaFirmwareIpc {
  const adb = window.electronAPI.adb
  const roms = window.electronAPI.roms
  return {
    getPackageInfo: (serial, pkg) => adb.getPackageInfo(serial, pkg),
    downloadFirmware: (id) => window.electronAPI.vita.downloadFirmware(id),
    ensureRemoteDir: (serial, dir) => roms.ensureRemoteDir(serial, dir),
    pushFile: (serial, local, remote) => adb.pushFile(serial, local, remote),
    sha256Device: (serial, remote) => roms.sha256Device(serial, remote),
  }
}

export interface SimulationVitaFirmwareOptions {
  /** Vita3K présent sur la console simulée (défaut true). */
  vita3kInstalled?: boolean
}

/** Firmware en simulation : aucun téléchargement, hash officiels, console en mémoire. */
export function makeSimulationVitaFirmwareIpc(
  opts: SimulationVitaFirmwareOptions = {}
): VitaFirmwareIpc & { pushed: string[] } {
  const installed = opts.vita3kInstalled ?? true
  const local = new Map<string, string>()
  const device = new Map<string, string>()
  const pushed: string[] = []

  return {
    pushed,
    async getPackageInfo(_serial, pkg) {
      return installed && pkg === VITA_TARGETS.vita3kPackageName ? { versionName: 'sim-1.0' } : null
    },
    async downloadFirmware(id) {
      const pkg = VITA_FIRMWARE_PACKAGES.find((p) => p.id === id)
      if (!pkg) throw new Error(`Paquet firmware inconnu : ${id}`)
      const localPath = `sim://firmware/${id}/${pkg.fileName}`
      local.set(localPath, pkg.sha256)
      return { localPath, sha256: pkg.sha256, fromCache: false }
    },
    async ensureRemoteDir() {
      /* no-op */
    },
    async pushFile(_serial, localPath, remotePath) {
      const sha = local.get(localPath)
      if (!sha) throw new Error(`local : absent ${localPath}`)
      device.set(remotePath, sha)
      pushed.push(remotePath)
    },
    async sha256Device(_serial, remotePath) {
      const sha = device.get(remotePath)
      if (!sha) throw new Error(`sha256sum: ${remotePath}: No such file or directory`)
      return sha
    },
  }
}

/** IPC réel : archives et fichiers locaux côté main, opérations ADB existantes. */
export function makeDefaultVitaIpc(): VitaIpc {
  const v = window.electronAPI.vita
  const adb = window.electronAPI.adb
  const roms = window.electronAPI.roms
  return {
    listArchive: (p) => v.listArchive(p),
    extractArchive: (p) => v.extractArchive(p),
    readLocalBytes: (p) => v.readLocalBytes(p),
    prepareOutputDir: (titleId) => v.prepareOutputDir(titleId),
    createZipFromDir: (src, out) => v.createZipFromDir(src, out),
    writeText: (p, c) => v.writeText(p, c),
    readText: (p) => v.readText(p),
    sha256Local: (p) => v.sha256Local(p),
    fileSize: (p) => v.fileSize(p),
    copyLocal: (src, dest) => v.copyLocal(src, dest),
    resolvePcOutputDir: (configured) => v.resolvePcOutputDir(configured),
    removeWorkDir: (dir) => v.removeWorkDir(dir),
    getPackageInfo: (serial, pkg) => adb.getPackageInfo(serial, pkg),
    ensureRemoteDir: (serial, dir) => roms.ensureRemoteDir(serial, dir),
    pushFile: (serial, local, remote) => adb.pushFile(serial, local, remote),
    sha256Device: (serial, remote) => roms.sha256Device(serial, remote),
  }
}

// ── Simulation : archives factices en mémoire, sans appareil ni fichiers ──────

const enc = new TextEncoder()
const dec = new TextDecoder()
const text = (s: string) => enc.encode(s)

/** Archives d'exemple : structures PS Vita factices (Title ID TEST*), aucun vrai jeu. */
const SIM_ARCHIVES: Record<string, Record<string, Uint8Array>> = {
  'C:/ThorImport/Demo Vita Homebrew.7z': {
    'TEST00001/eboot.bin': text('eboot-factice'),
    'TEST00001/sce_sys/param.sfo': buildSfo({
      APP_VER: '01.00',
      ATTRIBUTE: 0,
      CATEGORY: 'gd',
      TITLE: 'Demo Vita Homebrew',
      TITLE_ID: 'TEST00001',
    }),
    'TEST00001/sce_sys/icon0.png': text('icone-factice'),
    'TEST00001/sce_module/libfactice.suprx': text('module-factice'),
  },
  'C:/ThorImport/PSVita/Demo Vita Puzzle.zip': {
    'eboot.bin': text('eboot-factice-2'),
    'sce_sys/param.sfo': buildSfo({ TITLE: 'Demo Vita Puzzle', TITLE_ID: 'TEST00002' }),
  },
  'C:/ThorImport/Documents divers.zip': {
    'lisez-moi.txt': text('archive sans jeu PS Vita'),
  },
}

export const SIMULATION_IMPORT_FILES = [
  ...Object.keys(SIM_ARCHIVES),
  'C:/ThorImport/Jeu DS (exemple).nds',
]

/** Hash factice déterministe 64-hex (FNV-1a), cohérent local ↔ device. */
function fakeHash(bytes: Uint8Array): string {
  let h = 0x811c9dc5
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0').repeat(8)
}

function serializeArchive(entries: Map<string, Uint8Array>): Uint8Array {
  const lines = [...entries.entries()].sort(([a], [b]) => a.localeCompare(b))
  return text(lines.map(([name, bytes]) => `${name}:${fakeHash(bytes)}`).join('\n'))
}

export interface SimulationVitaOptions {
  /** true (défaut) : Vita3K "installé" sur la console simulée → cible console. */
  vita3kInstalled?: boolean
  /** Archives factices supplémentaires (chemin → fichiers), ajoutées aux exemples. */
  archives?: Record<string, Record<string, Uint8Array>>
}

export function makeSimulationVitaIpc(opts: SimulationVitaOptions = {}): VitaIpc {
  const vita3kInstalled = opts.vita3kInstalled ?? true
  const archives = new Map<string, Map<string, Uint8Array>>(
    Object.entries({ ...SIM_ARCHIVES, ...opts.archives }).map(([p, e]) => [
      p,
      new Map(Object.entries(e)),
    ])
  )
  const local = new Map<string, Uint8Array>()
  for (const [p, entries] of archives) local.set(p, serializeArchive(entries))
  const device = new Map<string, Uint8Array>()
  let workCounter = 0

  function need<T>(map: Map<string, T>, p: string, where: string): T {
    const v = map.get(p)
    if (v === undefined) throw new Error(`${where} : absent ${p}`)
    return v
  }

  return {
    async listArchive(p) {
      return [...need(archives, p, 'archive').keys()]
    },
    async extractArchive(p) {
      const entries = need(archives, p, 'archive')
      const workDir = `sim://work/${++workCounter}`
      for (const [rel, bytes] of entries) local.set(`${workDir}/${rel}`, bytes)
      return { workDir, files: [...entries.keys()] }
    },
    async readLocalBytes(p) {
      return need(local, p, 'local')
    },
    async prepareOutputDir(titleId) {
      return `sim://out/${titleId}`
    },
    async createZipFromDir(src, out) {
      const prefix = src.endsWith('/') ? src : src + '/'
      const entries = new Map<string, Uint8Array>()
      for (const [p, bytes] of local) {
        if (p.startsWith(prefix)) entries.set(p.slice(prefix.length), bytes)
      }
      if (entries.size === 0) throw new Error(`dossier source vide : ${src}`)
      archives.set(out, entries)
      local.set(out, serializeArchive(entries))
    },
    async writeText(p, content) {
      local.set(p, text(content))
    },
    async readText(p) {
      return dec.decode(need(local, p, 'local'))
    },
    async sha256Local(p) {
      return fakeHash(need(local, p, 'local'))
    },
    async fileSize(p) {
      return need(local, p, 'local').length
    },
    async copyLocal(src, dest) {
      local.set(dest, need(local, src, 'local'))
      const archive = archives.get(src)
      if (archive) archives.set(dest, archive)
    },
    async resolvePcOutputDir(configured) {
      return configured || 'sim://pc/PSVita'
    },
    async removeWorkDir(dir) {
      const prefix = dir + '/'
      for (const k of [...local.keys()]) if (k.startsWith(prefix)) local.delete(k)
    },
    async getPackageInfo(_serial, pkg) {
      return vita3kInstalled && pkg === VITA_TARGETS.vita3kPackageName
        ? { versionName: 'sim-1.0' }
        : null
    },
    async ensureRemoteDir() {
      /* no-op */
    },
    async pushFile(_serial, localPath, remotePath) {
      device.set(remotePath, need(local, localPath, 'local'))
    },
    async sha256Device(_serial, remotePath) {
      const bytes = device.get(remotePath)
      return bytes ? fakeHash(bytes) : ''
    },
  }
}
