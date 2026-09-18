/** Sélection des fichiers d'une release GitHub (sans dépendance Electron, testable). */

export interface ReleaseAsset {
  name: string
  browser_download_url: string
}

/** APK de la release correspondant au motif (insensible à la casse). */
export function selectApkAsset(assets: ReleaseAsset[], assetPattern: string): ReleaseAsset | undefined {
  const pattern = new RegExp(assetPattern, 'i')
  return assets.find((a) => pattern.test(a.name))
}

/**
 * Fichier d'empreinte de l'APK : d'abord le fichier compagnon `<apk>.sha256`
 * (publié par ex. par Obtainium), sinon un fichier de sommes générique.
 */
export function selectChecksumAsset(assets: ReleaseAsset[], apkName: string): ReleaseAsset | undefined {
  return (
    assets.find((a) => a.name === `${apkName}.sha256` || a.name === `${apkName}.sha256sum`) ??
    assets.find(
      (a) =>
        /^(sha256sums?|checksums?|hashes?)(\.txt|\.sha256sum)?$/i.test(a.name) ||
        (/sha256|checksum|hash/i.test(a.name) &&
          /\.(txt|sha256sum)$/i.test(a.name) &&
          !/\.(tar|tar\.\w+|zip|gz|xz|7z|dmg|exe|pkg)\.sha256sum$/i.test(a.name))
    )
  )
}

/**
 * SHA-256 d'un fichier d'empreinte : « <hash> » seul, ou lignes « <hash>  <nom> »
 * (on privilégie la ligne qui cite l'APK).
 */
export function parseSha256(content: string, apkName?: string): string | undefined {
  const lines = content.split(/\r?\n/).filter((l) => /\b[a-f0-9]{64}\b/i.test(l))
  if (lines.length === 0) return undefined

  if (apkName) {
    const matchingLine = lines.find((l) => l.includes(apkName))
    if (matchingLine) {
      return /\b([a-f0-9]{64})\b/i.exec(matchingLine)?.[1].toLowerCase()
    }
    // Si apkName n'est pas dans le fichier, mais qu'il n'y a qu'une seule ligne
    // et qu'elle ne mentionne aucun autre nom de fichier (hash pur) :
    if (lines.length === 1 && !/\.(apk|tar|zip|gz|xz|7z|dmg|exe|pkg|aab)\b/i.test(lines[0])) {
      return /\b([a-f0-9]{64})\b/i.exec(lines[0])?.[1].toLowerCase()
    }
    return undefined
  }

  return /\b([a-f0-9]{64})\b/i.exec(lines[0])?.[1].toLowerCase()
}
