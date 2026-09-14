/**
 * Structure attendue par Vita3K pour installer un jeu.
 *
 * Sur PS Vita, une application installée vit dans ux0:app/<TITLE_ID>/ et est
 * montée en "app0:" au lancement. Contenu de app0 :
 *   eboot.bin                  exécutable principal            (obligatoire)
 *   sce_sys/param.sfo          métadonnées TITLE, TITLE_ID…    (obligatoire)
 *   sce_sys/icon0.png, sce_sys/livearea/…                      (optionnels)
 *   sce_sys/package/work.bin   licence NoNpDrm                 (dumps)
 *   sce_module/…, données du jeu                               (selon le jeu)
 *
 * Sortie générée : <TITLE_ID>.vpk = archive zip dont la RACINE est le contenu
 * de app0 (format VPK), installable par Vita3K via son installation d'archive
 * (.zip / .vpk).
 *
 * ⚠ À VÉRIFIER dans la documentation officielle Vita3K avant de considérer ce
 * format comme définitif :
 *   - https://vita3k.org/quickstart.html (installation des jeux)
 *   - code source Vita3K : vita3k/interface.cpp (installation d'archive)
 * La vérification post-génération (verifyTree) compare l'arborescence du .vpk
 * produit à la liste des fichiers extraits de app0, plus REQUIRED_APP_FILES.
 */

export const PARAM_SFO_REL = 'sce_sys/param.sfo'
export const REQUIRED_APP_FILES = ['eboot.bin', PARAM_SFO_REL]

/** Dossiers de contenu additionnel (NoNpDrm) qui ne sont pas des jeux de base. */
const EXTRA_CONTENT_DIRS = ['patch', 'addcont']

export function normalizeEntry(p: string): string {
  return p.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '')
}

/**
 * Racines app0 d'une liste de fichiers : tout dossier contenant sce_sys/param.sfo.
 * Une racine imbriquée dans une autre est ignorée (elle fait partie de la première).
 */
export function findAppRoots(entries: string[]): string[] {
  const roots = new Set<string>()
  for (const raw of entries) {
    const e = normalizeEntry(raw)
    const lower = e.toLowerCase()
    if (lower === PARAM_SFO_REL) roots.add('')
    else if (lower.endsWith('/' + PARAM_SFO_REL)) {
      roots.add(e.slice(0, e.length - PARAM_SFO_REL.length - 1))
    }
  }
  const all = [...roots].sort()
  return all.filter(
    (r) => !all.some((other) => other !== r && (other === '' || r.startsWith(other + '/')))
  )
}

export function classifyRoots(entries: string[]): { games: string[]; extras: string[] } {
  const games: string[] = []
  const extras: string[] = []
  for (const root of findAppRoots(entries)) {
    const segments = root.toLowerCase().split('/')
    if (segments.some((s) => EXTRA_CONTENT_DIRS.includes(s))) extras.push(root)
    else games.push(root)
  }
  return { games, extras }
}

/** true si l'archive contient au moins un jeu PS Vita reconnaissable. */
export function isVitaStructure(entries: string[]): boolean {
  return classifyRoots(entries).games.length > 0
}

/** Fichiers sous une racine, relatifs à celle-ci, triés. */
export function filesUnderRoot(files: string[], root: string): string[] {
  const prefix = root ? root + '/' : ''
  return files
    .map(normalizeEntry)
    .filter((f) => f.startsWith(prefix) && !f.endsWith('/') && f.length > prefix.length)
    .map((f) => f.slice(prefix.length))
    .sort()
}

export function missingRequiredFiles(files: string[]): string[] {
  const lower = new Set(files.map((f) => normalizeEntry(f).toLowerCase()))
  return REQUIRED_APP_FILES.filter((r) => !lower.has(r))
}

export interface TreeCheck {
  ok: boolean
  missing: string[]
  unexpected: string[]
}

/** Compare l'arborescence produite à celle attendue (fichiers obligatoires inclus). */
export function verifyTree(produced: string[], expected: string[]): TreeCheck {
  const prod = new Set(produced.map(normalizeEntry).filter((e) => e && !e.endsWith('/')))
  const exp = new Set(expected.map(normalizeEntry))
  const missing = [...exp].filter((e) => !prod.has(e))
  for (const req of missingRequiredFiles([...prod])) {
    if (!missing.some((m) => m.toLowerCase() === req)) missing.push(req)
  }
  const unexpected = [...prod].filter((e) => !exp.has(e))
  return { ok: missing.length === 0 && unexpected.length === 0, missing, unexpected }
}

export function vpkFileName(titleId: string): string {
  return `${titleId}.vpk`
}
