/**
 * Détection et classification des fichiers BIOS et Firmwares dans le dossier d'import.
 */

export interface BiosCandidate {
  localPath: string
  fileName: string
  system: string
  targetRemotePaths: string[]
}

const KNOWN_BIOS_MAP: Record<string, { system: string; name: string }> = {
  // Sony PlayStation 1
  'scph1001.bin': { system: 'PlayStation 1', name: 'scph1001.bin' },
  'scph5500.bin': { system: 'PlayStation 1', name: 'scph5500.bin' },
  'scph5501.bin': { system: 'PlayStation 1', name: 'scph5501.bin' },
  'scph5502.bin': { system: 'PlayStation 1', name: 'scph5502.bin' },
  'scph7001.bin': { system: 'PlayStation 1', name: 'scph7001.bin' },
  'psxonpsp660.bin': { system: 'PlayStation 1', name: 'psxonpsp660.bin' },

  // Sony PlayStation 2
  'scph39001.bin': { system: 'PlayStation 2', name: 'scph39001.bin' },
  'scph39001.nvm': { system: 'PlayStation 2', name: 'scph39001.nvm' },
  'scph70012.bin': { system: 'PlayStation 2', name: 'scph70012.bin' },
  'scph70012.nvm': { system: 'PlayStation 2', name: 'scph70012.nvm' },

  // Nintendo Switch (Clés système)
  'prod.keys': { system: 'Nintendo Switch', name: 'prod.keys' },
  'title.keys': { system: 'Nintendo Switch', name: 'title.keys' },

  // Game Boy Advance / Game Boy
  'gba_bios.bin': { system: 'Game Boy Advance', name: 'gba_bios.bin' },
  'gb_bios.bin': { system: 'Game Boy', name: 'gb_bios.bin' },
  'gbc_bios.bin': { system: 'Game Boy Color', name: 'gbc_bios.bin' },

  // Nintendo DS
  'bios7.bin': { system: 'Nintendo DS', name: 'bios7.bin' },
  'bios9.bin': { system: 'Nintendo DS', name: 'bios9.bin' },
  'firmware.bin': { system: 'Nintendo DS', name: 'firmware.bin' },

  // Sega Saturn & Dreamcast
  'sega_101.bin': { system: 'Sega Saturn', name: 'sega_101.bin' },
  'mpr-17933.bin': { system: 'Sega Saturn', name: 'mpr-17933.bin' },
  'dc_boot.bin': { system: 'Sega Dreamcast', name: 'dc_boot.bin' },
  'dc_flash.bin': { system: 'Sega Dreamcast', name: 'dc_flash.bin' },

  // Neo Geo
  'neogeo.zip': { system: 'Neo Geo', name: 'neogeo.zip' },
}

function getBasename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function isBiosFile(path: string): boolean {
  const norm = path.replace(/\\/g, '/').toLowerCase()
  const base = getBasename(path).toLowerCase()

  if (KNOWN_BIOS_MAP[base]) return true
  if (norm.includes('/bios/') || norm.includes('/firmware/')) return true
  if (base.endsWith('.keys')) return true

  return false
}

export function identifyBios(path: string): BiosCandidate | null {
  if (!isBiosFile(path)) return null

  const base = getBasename(path)
  const lowerBase = base.toLowerCase()
  const known = KNOWN_BIOS_MAP[lowerBase]

  const system = known ? known.system : 'Système'
  const fileName = base

  // Emplacements standardisés sur Android pour que tous les émulateurs et frontends les trouvent
  const targetRemotePaths = [
    `/storage/emulated/0/BIOS/${fileName}`,
    `/storage/emulated/0/ROMs/bios/${fileName}`,
  ]

  return {
    localPath: path,
    fileName,
    system,
    targetRemotePaths,
  }
}

export function selectBiosFiles(files: string[]): BiosCandidate[] {
  const candidates: BiosCandidate[] = []
  for (const f of files) {
    const identified = identifyBios(f)
    if (identified) {
      candidates.push(identified)
    }
  }
  return candidates
}
