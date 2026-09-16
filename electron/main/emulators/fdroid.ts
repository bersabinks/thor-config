/**
 * Résolution d'un APK sur un dépôt F-Droid, sans client F-Droid installé
 * (aucune dépendance Electron : fonctions pures + un fetch injectable).
 *
 * Deux chemins, vérifiés le 2026-09-16 :
 * - dépôt OFFICIEL f-droid.org : API JSON `api/v1/packages/<pkg>` (versions +
 *   versionCode suggéré), APK à `<repo>/<pkg>_<versionCode>.apk`. Pas d'empreinte
 *   publiée par cette API.
 * - dépôt TIERS (ex. Dolphin) : index du dépôt `index-v2.json`, qui contient
 *   pour chaque version le nom de fichier de l'APK, sa taille et son SHA-256
 *   (format relevé sur un dépôt réel : packages.<pkg>.versions.<hash>.file
 *   { name, sha256, size } + .manifest { versionName, versionCode }).
 */

export const OFFICIAL_FDROID_REPO = 'https://f-droid.org/repo'

export interface FdroidPackagesResponse {
  packageName: string
  suggestedVersionCode: number
  packages: { versionName: string; versionCode: number }[]
}

/** Sous-ensemble utilisé de index-v2.json. */
export interface FdroidIndexV2 {
  packages?: Record<
    string,
    {
      versions?: Record<
        string,
        {
          added?: number
          file?: { name?: string; sha256?: string; size?: number }
          manifest?: { versionName?: string; versionCode?: number }
        }
      >
    }
  >
}

export interface FdroidApk {
  version: string
  downloadUrl: string
  sha256?: string
  size?: number
}

function normalize(repoUrl: string): string {
  return repoUrl.replace(/\/+$/, '')
}

export function isOfficialFdroidRepo(repoUrl: string): boolean {
  return normalize(repoUrl) === OFFICIAL_FDROID_REPO
}

export function fdroidApiUrl(packageName: string): string {
  return `https://f-droid.org/api/v1/packages/${packageName}`
}

export function fdroidApkUrl(repoUrl: string, packageName: string, versionCode: number): string {
  return `${normalize(repoUrl)}/${packageName}_${versionCode}.apk`
}

export function fdroidIndexUrl(repoUrl: string): string {
  return `${normalize(repoUrl)}/index-v2.json`
}

/** Version publiée retenue : celle suggérée par F-Droid, sinon le plus grand versionCode. */
export function pickFdroidVersion(resp: FdroidPackagesResponse): { versionName: string; versionCode: number } {
  const suggested = resp.packages?.find((p) => p.versionCode === resp.suggestedVersionCode)
  if (suggested) return suggested
  const sorted = [...(resp.packages ?? [])].sort((a, b) => b.versionCode - a.versionCode)
  if (sorted.length === 0) throw new Error(`Aucune version publiée pour ${resp.packageName} sur F-Droid`)
  return sorted[0]
}

/**
 * Dernière version d'un paquet dans un index-v2.json : plus grand versionCode
 * (à égalité, la plus récemment ajoutée). Renvoie l'URL absolue de l'APK et son
 * empreinte publiée par le dépôt.
 */
export function pickApkFromIndexV2(index: FdroidIndexV2, repoUrl: string, packageName: string): FdroidApk {
  const versions = index.packages?.[packageName]?.versions
  const entries = Object.values(versions ?? {}).filter((v) => v.file?.name)
  if (entries.length === 0) {
    throw new Error(`Paquet ${packageName} absent de l'index du dépôt ${repoUrl}`)
  }
  entries.sort((a, b) => {
    const code = (b.manifest?.versionCode ?? 0) - (a.manifest?.versionCode ?? 0)
    return code !== 0 ? code : (b.added ?? 0) - (a.added ?? 0)
  })
  const best = entries[0]
  const name = best.file!.name!
  return {
    version: best.manifest?.versionName ?? String(best.manifest?.versionCode ?? 'inconnue'),
    downloadUrl: `${normalize(repoUrl)}${name.startsWith('/') ? '' : '/'}${name}`,
    sha256: best.file?.sha256,
    size: best.file?.size,
  }
}
