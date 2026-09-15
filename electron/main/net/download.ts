import { createHash } from 'crypto'
import { mkdirSync, renameSync, rmSync } from 'fs'
import { open } from 'fs/promises'
import { dirname } from 'path'

export interface DownloadProgress {
  receivedBytes: number
  /** null si le serveur n'annonce pas de taille. */
  totalBytes: number | null
}

export interface DownloadOptions {
  fetchImpl?: typeof fetch
  onProgress?: (progress: DownloadProgress) => void
  /** Taille maximale acceptée : au-delà, le téléchargement est interrompu. */
  maxBytes?: number
}

export interface DownloadResult {
  path: string
  bytes: number
  sha256: string
}

/**
 * Télécharge `url` vers `destPath` en flux (fichier `.part` puis renommage), en
 * calculant le SHA-256 à la volée. Un échec ne laisse aucun fichier partiel.
 */
export async function downloadToFile(
  url: string,
  destPath: string,
  options: DownloadOptions = {}
): Promise<DownloadResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const part = `${destPath}.part`
  mkdirSync(dirname(destPath), { recursive: true })

  const resp = await fetchImpl(url, { headers: { 'User-Agent': 'ThorConfig/1.0' } })
  if (!resp.ok || !resp.body) {
    throw new Error(`Téléchargement impossible (HTTP ${resp.status}) : ${url}`)
  }
  const announced = Number(resp.headers.get('content-length'))
  const totalBytes = Number.isFinite(announced) && announced > 0 ? announced : null
  // Contenu compressé par le transport : la taille reçue ne correspond plus à content-length.
  const encoded = resp.headers.has('content-encoding')

  const hash = createHash('sha256')
  const file = await open(part, 'w')
  let received = 0
  let ok = false
  try {
    const reader = resp.body.getReader()
    options.onProgress?.({ receivedBytes: 0, totalBytes })
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (options.maxBytes !== undefined && received > options.maxBytes) {
        throw new Error(`Réponse plus volumineuse que prévu (> ${options.maxBytes} octets) : ${url}`)
      }
      hash.update(value)
      await file.write(value)
      options.onProgress?.({ receivedBytes: received, totalBytes })
    }
    if (totalBytes !== null && !encoded && received !== totalBytes) {
      throw new Error(`Téléchargement incomplet : ${received}/${totalBytes} octets (${url})`)
    }
    ok = true
  } finally {
    await file.close()
    if (!ok) rmSync(part, { force: true })
  }

  rmSync(destPath, { force: true })
  renameSync(part, destPath)
  return { path: destPath, bytes: received, sha256: hash.digest('hex') }
}
