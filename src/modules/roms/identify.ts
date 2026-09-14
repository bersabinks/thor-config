import systemMapJson from './systemMap.json'

export interface MagicSignature {
  offset: number
  hex: string
}

export interface SystemDef {
  id: string
  displayName: string
  folder: string
  extensions: string[]
  chd: boolean
  magic: MagicSignature[]
}

export const SYSTEMS = systemMapJson as SystemDef[]

/** Nombre d'octets d'en-tête à lire pour couvrir toutes les signatures connues
 *  (la plus lointaine est le "CD001" ISO9660 de la PS2 à l'offset 0x8001). */
export const HEADER_READ_LENGTH = 0x8010

export type IdentificationMethod = 'magic' | 'extension' | 'none'

export interface Identification {
  system: SystemDef | null
  method: IdentificationMethod
  /** Renseigné quand system est null : 'unknown' (extension inconnue) ou
   *  'ambiguous' (extension partagée par plusieurs systèmes, magic non concluant). */
  reason?: 'unknown' | 'ambiguous'
  /** Systèmes candidats quand l'extension est ambiguë (ex. .iso → gc/wii/ps2). */
  candidates?: string[]
}

export function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename
  const dot = base.lastIndexOf('.')
  return dot >= 0 ? base.slice(dot).toLowerCase() : ''
}

function hexAt(header: Uint8Array, offset: number, byteLen: number): string | null {
  if (offset < 0 || offset + byteLen > header.length) return null
  let out = ''
  for (let i = 0; i < byteLen; i++) {
    out += header[offset + i].toString(16).padStart(2, '0')
  }
  return out.toUpperCase()
}

function magicMatches(header: Uint8Array, sig: MagicSignature): boolean {
  const byteLen = sig.hex.length / 2
  const actual = hexAt(header, sig.offset, byteLen)
  return actual !== null && actual === sig.hex.toUpperCase()
}

/**
 * Identifie le système d'un fichier à partir de son nom (extension) et,
 * si fourni, de son en-tête binaire (signature magique).
 *
 * Stratégie :
 *  1. Une signature magique qui matche l'emporte toujours (fiable, désambiguïse
 *     les extensions partagées comme .iso entre GameCube / Wii / PS2).
 *  2. Sinon, si l'extension ne correspond qu'à un seul système → ce système.
 *  3. Sinon → null, avec reason 'ambiguous' (extension multi-systèmes) ou
 *     'unknown' (extension inconnue).
 */
export function identifySystem(filename: string, header?: Uint8Array): Identification {
  if (header && header.length > 0) {
    for (const system of SYSTEMS) {
      if (system.magic.some((sig) => magicMatches(header, sig))) {
        return { system, method: 'magic' }
      }
    }
  }

  const ext = extensionOf(filename)
  if (!ext) return { system: null, method: 'none', reason: 'unknown' }

  const byExt = SYSTEMS.filter((s) => s.extensions.includes(ext))
  if (byExt.length === 1) {
    return { system: byExt[0], method: 'extension' }
  }
  if (byExt.length > 1) {
    return {
      system: null,
      method: 'none',
      reason: 'ambiguous',
      candidates: byExt.map((s) => s.id),
    }
  }
  return { system: null, method: 'none', reason: 'unknown' }
}
