import { extensionOf } from './identify'

export type ContentKind = 'base' | 'update' | 'dlc'

export interface DiscInfo {
  /** Titre normalisé sans le marqueur de disque ni l'extension. */
  title: string
  /** Numéro de disque (1-based) si détecté, sinon null. */
  disc: number | null
}

export interface MultiDiscGroup {
  title: string
  /** Fichiers du même titre, triés par numéro de disque croissant. */
  files: string[]
}

const DISC_RE = /\((?:disc|disk|cd)\s*(\d+)\)/i
const UPDATE_RE = /\b(update|upd|patch)\b|\[upd\]|\(update\)/i
const DLC_RE = /\bdlc\b|\[dlc\]|\(dlc\)/i

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function stripExtension(name: string): string {
  const ext = extensionOf(name)
  return ext ? name.slice(0, name.length - ext.length) : name
}

/** Extrait le titre normalisé et le numéro de disque d'un nom de fichier. */
export function parseDiscInfo(path: string): DiscInfo {
  const nameNoExt = stripExtension(basename(path))
  const match = DISC_RE.exec(nameNoExt)
  const disc = match ? parseInt(match[1], 10) : null
  // Titre = nom sans le marqueur (Disc N) et espaces superflus.
  const title = nameNoExt.replace(DISC_RE, '').replace(/\s{2,}/g, ' ').trim()
  return { title, disc }
}

/** Classe un fichier en base / update / dlc d'après son nom (heuristique). */
export function classifyContent(path: string): ContentKind {
  const name = basename(path)
  if (DLC_RE.test(name)) return 'dlc'
  if (UPDATE_RE.test(name)) return 'update'
  return 'base'
}

/**
 * Regroupe les fichiers multi-disques d'un même titre. Un groupe n'est renvoyé
 * que s'il contient au moins deux disques numérotés — les jeux mono-fichier sont
 * ignorés (pas de .m3u nécessaire).
 */
export function groupMultiDisc(paths: string[]): MultiDiscGroup[] {
  const byTitle = new Map<string, { path: string; disc: number }[]>()

  for (const p of paths) {
    const { title, disc } = parseDiscInfo(p)
    if (disc === null) continue
    const key = title.toLowerCase()
    if (!byTitle.has(key)) byTitle.set(key, [])
    byTitle.get(key)!.push({ path: basename(p), disc })
  }

  const groups: MultiDiscGroup[] = []
  for (const items of byTitle.values()) {
    if (items.length < 2) continue
    items.sort((a, b) => a.disc - b.disc)
    groups.push({
      title: parseDiscInfo(items[0].path).title,
      files: items.map((i) => i.path),
    })
  }
  return groups
}

/** Génère le contenu d'une playlist .m3u (un fichier par ligne, ordre disque). */
export function generateM3u(group: MultiDiscGroup): string {
  return group.files.join('\n') + '\n'
}

/** Nom de fichier .m3u pour un groupe multi-disques. */
export function m3uFileName(group: MultiDiscGroup): string {
  return `${group.title}.m3u`
}
