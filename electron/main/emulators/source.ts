import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, statSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { getSettings } from '../settings'
import { parseSha256, selectApkAsset, selectChecksumAsset, type ReleaseAsset } from './releaseAssets'
import {
  fdroidApiUrl,
  fdroidApkUrl,
  fdroidIndexUrl,
  isOfficialFdroidRepo,
  pickApkFromIndexV2,
  pickFdroidVersion,
  type FdroidIndexV2,
  type FdroidPackagesResponse,
} from './fdroid'
import type { PrepareApkSource } from '../../../src/modules/emulators/emulatorInstall'

export interface ReleaseInfo {
  version: string
  downloadUrl: string
  sha256?: string
}

export interface PrepareApkResult {
  localPath: string
  version: string
}

async function githubFetch(url: string): Promise<Response> {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'ThorConfig/1.0',
      Accept: 'application/vnd.github+json',
    },
  })
  return resp
}

export async function fetchLatestRelease(
  githubRepo: string,
  assetPattern: string
): Promise<ReleaseInfo> {
  const apiUrl = `https://api.github.com/repos/${githubRepo}/releases/latest`
  const resp = await githubFetch(apiUrl)
  if (!resp.ok) {
    throw new Error(`GitHub API ${resp.status} pour ${githubRepo}: ${await resp.text()}`)
  }

  const data = (await resp.json()) as { tag_name: string; assets: ReleaseAsset[] }

  const apkAsset = selectApkAsset(data.assets, assetPattern)
  if (!apkAsset) {
    throw new Error(
      `Aucun asset correspondant au pattern "${assetPattern}" dans les releases de ${githubRepo}`
    )
  }

  // Empreinte publiée avec la release (fichier <apk>.sha256 ou fichier de sommes)
  const checksumAsset = selectChecksumAsset(data.assets, apkAsset.name)
  let sha256: string | undefined
  if (checksumAsset) {
    try {
      const hashResp = await githubFetch(checksumAsset.browser_download_url)
      sha256 = parseSha256(await hashResp.text(), apkAsset.name)
    } catch {
      // Le hash est optionnel, on continue sans
    }
  }

  return { version: data.tag_name, downloadUrl: apkAsset.browser_download_url, sha256 }
}

async function verifySha256(filePath: string, expectedHash: string): Promise<void> {
  const hash = createHash('sha256')
  const stream = createReadStream(filePath)
  for await (const chunk of stream) hash.update(chunk)
  const actual = hash.digest('hex').toLowerCase()
  if (actual !== expectedHash.toLowerCase()) {
    throw new Error(`SHA-256 invalide : attendu ${expectedHash}, obtenu ${actual}`)
  }
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const resp = await githubFetch(url)
  if (!resp.ok) throw new Error(`Téléchargement échoué (${resp.status}): ${url}`)
  const buffer = await resp.arrayBuffer()
  writeFileSync(destPath, Buffer.from(buffer))
}

function getCachePath(id: string, version: string): string {
  return join(app.getPath('userData'), 'cache', 'apk', id, version, `${id}.apk`)
}

function isCached(filePath: string): boolean {
  try {
    return statSync(filePath).size > 0
  } catch {
    return false
  }
}

/**
 * Dernière version publiée sur un dépôt F-Droid, sans client F-Droid :
 * API JSON pour le dépôt officiel, index-v2.json (avec SHA-256) pour les
 * dépôts tiers comme celui de Dolphin.
 */
export async function fetchFdroidRelease(
  repoUrl: string,
  packageName: string
): Promise<ReleaseInfo> {
  if (!repoUrl) throw new Error(`fdroidRepo manquant pour ${packageName}`)

  if (isOfficialFdroidRepo(repoUrl)) {
    const resp = await githubFetch(fdroidApiUrl(packageName))
    if (!resp.ok) {
      throw new Error(`F-Droid ${resp.status} pour ${packageName}`)
    }
    const data = (await resp.json()) as FdroidPackagesResponse
    const version = pickFdroidVersion(data)
    return {
      version: version.versionName,
      downloadUrl: fdroidApkUrl(repoUrl, packageName, version.versionCode),
    }
  }

  const indexUrl = fdroidIndexUrl(repoUrl)
  const resp = await githubFetch(indexUrl)
  if (!resp.ok) {
    if (packageName === 'org.dolphinemu.dolphinemu') {
      try {
        return await fetchDolphinOfficialRelease()
      } catch {
        // En cas d'échec du fallback, lever l'erreur F-Droid
      }
    }
    throw new Error(`Dépôt F-Droid injoignable (HTTP ${resp.status}) : ${indexUrl}`)
  }
  const apk = pickApkFromIndexV2((await resp.json()) as FdroidIndexV2, repoUrl, packageName)
  return { version: apk.version, downloadUrl: apk.downloadUrl, sha256: apk.sha256 }
}

/** Fallback officiel pour Dolphin via son API de mise à jour beta. */
export async function fetchDolphinOfficialRelease(): Promise<ReleaseInfo> {
  const resp = await githubFetch('https://dolphin-emu.org/update/latest/beta')
  if (!resp.ok) {
    throw new Error(`Dolphin API ${resp.status}`)
  }
  const data = (await resp.json()) as {
    shortrev: string
    artifacts: Array<{ system: string; url: string }>
  }
  const android = data.artifacts?.find((a) => a.system === 'Android')
  if (!android) throw new Error('Aucun artifact Android dans la release Dolphin')
  return {
    version: data.shortrev,
    downloadUrl: android.url,
  }
}

/** Dernière version disponible, sans rien télécharger (écran « Mises à jour »). */
export async function fetchLatestVersion(source: PrepareApkSource): Promise<{ version: string }> {
  if (source.sourceType === 'playstore') {
    throw new Error(`${source.id} : version publiée non consultable (Google Play)`)
  }
  const release =
    source.sourceType === 'fdroid'
      ? await fetchFdroidRelease(source.fdroidRepo ?? '', source.packageName)
      : await fetchLatestRelease(source.githubRepo ?? '', source.assetPattern ?? '')
  return { version: release.version }
}

export async function prepareApk(source: PrepareApkSource): Promise<PrepareApkResult> {
  const { id, sourceType, packageName } = source
  if (getSettings().simulationMode) {
    return { localPath: `/mock/cache/apk/${id}/sim-1.0/${id}.apk`, version: 'sim-1.0' }
  }

  if (sourceType === 'playstore') {
    throw new Error(`${id} : distribué uniquement via Google Play, aucun APK à télécharger`)
  }

  const release =
    sourceType === 'fdroid'
      ? await fetchFdroidRelease(source.fdroidRepo ?? '', packageName)
      : await fetchLatestRelease(source.githubRepo ?? '', source.assetPattern ?? '')
  const localPath = getCachePath(id, release.version)

  if (!isCached(localPath)) {
    mkdirSync(join(localPath, '..'), { recursive: true })
    await downloadFile(release.downloadUrl, localPath)
  }

  if (release.sha256) {
    await verifySha256(localPath, release.sha256)
  }

  return { localPath, version: release.version }
}
