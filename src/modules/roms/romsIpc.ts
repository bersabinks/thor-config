import type { RomsIpc } from './romsProcess'

/** IPC réel : opérations fichiers/chdman côté main + transfert ADB. */
export function makeDefaultRomsIpc(): RomsIpc {
  return {
    readHeader: (localPath, length) => window.electronAPI.roms.readHeader(localPath, length),
    sha256Local: (localPath) => window.electronAPI.roms.sha256Local(localPath),
    hasChdman: () => window.electronAPI.roms.hasChdman(),
    chdmanConvert: (localPath) => window.electronAPI.roms.chdmanConvert(localPath),
    ensureRemoteDir: (serial, remoteDir) =>
      window.electronAPI.roms.ensureRemoteDir(serial, remoteDir),
    pushRom: (serial, localPath, remotePath) =>
      window.electronAPI.adb.pushFile(serial, localPath, remotePath),
    sha256Device: (serial, remotePath) =>
      window.electronAPI.roms.sha256Device(serial, remotePath),
    writeRemoteText: (serial, remotePath, content) =>
      window.electronAPI.roms.writeRemoteText(serial, remotePath, content),
    readRemoteText: (serial, remotePath) =>
      window.electronAPI.roms.readRemoteText(serial, remotePath),
  }
}

// ── Simulation : lot d'exemple + IPC déterministe, sans appareil ni fichiers ──

interface Sample {
  path: string
  header: Uint8Array
}

/** Construit un en-tête avec une signature à un offset donné (reste à zéro). */
function headerWithMagic(offset: number, hex: string, totalLen: number): Uint8Array {
  const buf = new Uint8Array(totalLen)
  for (let i = 0; i < hex.length / 2; i++) {
    buf[offset + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return buf
}

const GC_MAGIC = headerWithMagic(28, 'C2339F3D', 64)
const PS2_MAGIC = headerWithMagic(32769, '4344303031', 0x8010)
const EMPTY = new Uint8Array(0)

const SIM_SAMPLES: Sample[] = [
  { path: 'Mario Kart DS (USA).nds', header: EMPTY }, // nds par extension
  { path: 'Metroid Prime (USA).iso', header: GC_MAGIC }, // gc par signature (.iso ambigu)
  { path: 'Final Fantasy X (USA) (Disc 1).iso', header: PS2_MAGIC }, // ps2 + multi-disque
  { path: 'Final Fantasy X (USA) (Disc 2).iso', header: PS2_MAGIC },
  { path: 'Wii Sports (USA).wbfs', header: EMPTY }, // wii par extension
]

export const SIMULATION_SAMPLE_FILES = SIM_SAMPLES.map((s) => s.path)

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

/** Hash factice déterministe dérivé du nom de fichier (local == device en sim). */
function fakeHash(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0').repeat(8)
}

/**
 * IPC de simulation : headers/ hash déterministes, chdman absent (démontre le
 * chemin "skipped"), transferts et écritures en no-op vérifiables.
 */
export function makeSimulationRomsIpc(): RomsIpc {
  const headers = new Map(SIM_SAMPLES.map((s) => [basename(s.path), s.header]))
  const remoteText = new Map<string, string>()

  return {
    async readHeader(localPath) {
      return headers.get(basename(localPath)) ?? EMPTY
    },
    async sha256Local(localPath) {
      return fakeHash(basename(localPath))
    },
    async hasChdman() {
      return false // en simulation, on illustre l'étape CHD ignorée
    },
    async chdmanConvert(localPath) {
      return localPath.replace(/\.[^.]+$/, '.chd')
    },
    async ensureRemoteDir() {
      /* no-op */
    },
    async pushRom() {
      /* no-op */
    },
    async sha256Device(_serial, remotePath) {
      // Le device "contient" ce qui a été poussé : même hash que le local.
      return fakeHash(basename(remotePath))
    },
    async writeRemoteText(_serial, remotePath, content) {
      remoteText.set(remotePath, content)
    },
    async readRemoteText(_serial, remotePath) {
      return remoteText.get(remotePath) ?? ''
    },
  }
}
