/**
 * Comparaison de versions d'émulateurs : les numéros viennent tantôt d'un tag
 * GitHub (« v1.20.4 »), tantôt d'un versionName F-Droid (« 1.19.3 »), tantôt du
 * `dumpsys package` de la console (« 0.7.0.rc5 »). On compare les segments
 * numériques, puis on considère qu'un suffixe de pré-version (rc, beta…) est
 * antérieur à la version finale de même numéro.
 */

export interface ParsedVersion {
  numbers: number[]
  /** Suffixe non numérique éventuel (rc5, beta2…), en minuscules. */
  prerelease: string | null
}

const PRERELEASE_RE = /^(rc|beta|alpha|dev|nightly|pre|snapshot)/i

export function parseVersion(raw: string): ParsedVersion | null {
  const cleaned = raw.trim().replace(/^[vV]/, '')
  if (!cleaned) return null
  const segments = cleaned.split(/[.\-+_]/).filter(Boolean)
  const numbers: number[] = []
  let prerelease: string | null = null
  for (const seg of segments) {
    if (prerelease === null && /^\d+$/.test(seg)) {
      numbers.push(Number(seg))
      continue
    }
    prerelease = prerelease === null ? seg.toLowerCase() : `${prerelease}.${seg.toLowerCase()}`
  }
  if (numbers.length === 0) return null
  return { numbers, prerelease }
}

/** -1 si a < b, 0 si équivalentes, 1 si a > b ; null si non comparables. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  if (!va || !vb) return null

  const len = Math.max(va.numbers.length, vb.numbers.length)
  for (let i = 0; i < len; i++) {
    const na = va.numbers[i] ?? 0
    const nb = vb.numbers[i] ?? 0
    if (na !== nb) return na < nb ? -1 : 1
  }

  const preA = va.prerelease !== null && PRERELEASE_RE.test(va.prerelease)
  const preB = vb.prerelease !== null && PRERELEASE_RE.test(vb.prerelease)
  if (preA !== preB) return preA ? -1 : 1 // une pré-version précède la version finale
  if (va.prerelease === vb.prerelease) return 0
  return (va.prerelease ?? '') < (vb.prerelease ?? '') ? -1 : 1
}
