import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, statSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { getSettings } from '../settings'

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

  const data = (await resp.json()) as {
    tag_name: string
    assets: { name: string; browser_download_url: string }[]
  }

  const pattern = new RegExp(assetPattern, 'i')
  const apkAsset = data.assets.find((a) => pattern.test(a.name))
  if (!apkAsset) {
    throw new Error(
      `Aucun asset correspondant au pattern "${assetPattern}" dans les releases de ${githubRepo}`
    )
  }

  // Cherche un fichier de checksums SHA-256 parmi les assets
  const checksumAsset = data.assets.find(
    (a) =>
      /sha256|checksum|hash/i.test(a.name) &&
      /\.(txt|sha256sum)$/i.test(a.name)
  )
  let sha256: string | undefined
  if (checksumAsset) {
    try {
      const hashResp = await githubFetch(checksumAsset.browser_download_url)
      const content = await hashResp.text()
      // Format attendu : "<hash>  <filename>"
      const match = /([a-f0-9]{64})\s/i.exec(content)
      sha256 = match?.[1]?.toLowerCase()
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

export async function prepareApk(
  id: string,
  githubRepo: string,
  assetPattern: string
): Promise<PrepareApkResult> {
  if (getSettings().simulationMode) {
    return { localPath: `/mock/cache/apk/${id}/sim-1.0/${id}.apk`, version: 'sim-1.0' }
  }

  const release = await fetchLatestRelease(githubRepo, assetPattern)
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
