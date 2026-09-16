import { existsSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { downloadToFile } from '../net/download'
import { sha256File } from './archive'

export interface VerifiedFileSpec {
  id: string
  fileName: string
  url: string
  sha256: string
  size: number
}

export interface FirmwareDownloadResult {
  localPath: string
  sha256: string
  fromCache: boolean
}

/**
 * Télécharge un fichier dont l'empreinte est connue à l'avance, dans
 * `<cacheRoot>/<id>/<fileName>`. Un fichier en cache n'est réutilisé qu'après
 * revérification ; un téléchargement non conforme est supprimé et signalé.
 */
export async function downloadVerifiedFile(
  spec: VerifiedFileSpec,
  cacheRoot: string,
  fetchImpl?: typeof fetch
): Promise<FirmwareDownloadResult> {
  const dest = join(cacheRoot, spec.id, spec.fileName)

  if (existsSync(dest) && statSync(dest).size === spec.size && (await sha256File(dest)) === spec.sha256) {
    return { localPath: dest, sha256: spec.sha256, fromCache: true }
  }

  const r = await downloadToFile(spec.url, dest, { fetchImpl, maxBytes: spec.size })
  if (r.sha256 !== spec.sha256 || r.bytes !== spec.size) {
    rmSync(dest, { force: true })
    throw new Error(
      `Intégrité invalide pour ${spec.fileName} (${spec.id}) : SHA-256 attendu ${spec.sha256}, obtenu ${r.sha256} (${r.bytes}/${spec.size} octets)`
    )
  }
  return { localPath: dest, sha256: r.sha256, fromCache: false }
}
