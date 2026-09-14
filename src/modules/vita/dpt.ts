import type { VitaTitleInfo } from './sfo'

/**
 * Fichier .dpt : descripteur d'un jeu PS Vita (un fichier par jeu).
 *
 * TODO format à confirmer : aucune spécification publique n'a été vérifiée
 * pour ce format. On écrit un format clé=valeur minimal contenant le titre et
 * le Title ID lus dans param.sfo ; à aligner sur le format réel attendu par
 * le launcher dès qu'il est connu.
 */
export function generateDpt(info: VitaTitleInfo): string {
  return `title=${info.title.replace(/[\r\n]+/g, ' ')}\ntitleId=${info.titleId}\n`
}

export function parseDpt(content: string): Partial<VitaTitleInfo> {
  const out: Partial<VitaTitleInfo> = {}
  for (const line of content.split(/\r?\n/)) {
    const i = line.indexOf('=')
    if (i <= 0) continue
    const key = line.slice(0, i)
    const value = line.slice(i + 1)
    if (key === 'title') out.title = value
    if (key === 'titleId') out.titleId = value
  }
  return out
}

/** Nom de fichier sûr sous Windows et Android : "<Titre> [<TITLE_ID>].dpt". */
export function dptFileName(info: VitaTitleInfo): string {
  const safe = info.title
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, '')
  return safe ? `${safe} [${info.titleId}].dpt` : `${info.titleId}.dpt`
}
