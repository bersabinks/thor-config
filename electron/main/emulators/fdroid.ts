/**
 * Résolution d'un APK sur un dépôt F-Droid (sans dépendance Electron).
 *
 * Le dépôt officiel expose une API JSON simple (api/v1/packages/<pkg>) et des
 * APK nommés `<packageName>_<versionCode>.apk` — vérifié le 2026-09-16 sur
 * org.ppsspp.ppsspp. Les dépôts tiers (ex. Dolphin) n'ont pas cette API :
 * il faut lire leur index (index-v2.json), non implémenté pour l'instant.
 */

export const OFFICIAL_FDROID_REPO = 'https://f-droid.org/repo'

export interface FdroidPackagesResponse {
  packageName: string
  suggestedVersionCode: number
  packages: { versionName: string; versionCode: number }[]
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

/** Version publiée retenue : celle suggérée par F-Droid, sinon le plus grand versionCode. */
export function pickFdroidVersion(resp: FdroidPackagesResponse): { versionName: string; versionCode: number } {
  const suggested = resp.packages?.find((p) => p.versionCode === resp.suggestedVersionCode)
  if (suggested) return suggested
  const sorted = [...(resp.packages ?? [])].sort((a, b) => b.versionCode - a.versionCode)
  if (sorted.length === 0) throw new Error(`Aucune version publiée pour ${resp.packageName} sur F-Droid`)
  return sorted[0]
}
