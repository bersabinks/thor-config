import { app } from 'electron'
import { join } from 'path'
import { createHash } from 'crypto'
import {
  createReadStream,
  openSync,
  readSync,
  closeSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
} from 'fs'
import { spawn, spawnSync } from 'child_process'
import { getAdbClient } from '../adb/factory'

/** Lit les `length` premiers octets d'un fichier local. */
export async function readHeader(localPath: string, length: number): Promise<Buffer> {
  const fd = openSync(localPath, 'r')
  try {
    const buf = Buffer.alloc(length)
    const read = readSync(fd, buf, 0, length, 0)
    return buf.subarray(0, read)
  } finally {
    closeSync(fd)
  }
}

export async function sha256Local(localPath: string): Promise<string> {
  const hash = createHash('sha256')
  const stream = createReadStream(localPath)
  for await (const chunk of stream) hash.update(chunk)
  return hash.digest('hex')
}

let chdmanPathCache: string | null | undefined
function resolveChdman(): string | null {
  if (chdmanPathCache !== undefined) return chdmanPathCache
  const finder = process.platform === 'win32' ? 'where' : 'which'
  try {
    const r = spawnSync(finder, ['chdman'], { encoding: 'utf-8' })
    chdmanPathCache =
      r.status === 0 && r.stdout.trim() ? r.stdout.trim().split(/\r?\n/)[0].trim() : null
  } catch {
    chdmanPathCache = null
  }
  return chdmanPathCache
}

export async function hasChdman(): Promise<boolean> {
  return resolveChdman() !== null
}

export async function chdmanConvert(localPath: string): Promise<string> {
  const chdman = resolveChdman()
  if (!chdman) throw new Error('chdman introuvable dans le PATH')
  const outDir = join(app.getPath('userData'), 'cache', 'chd')
  mkdirSync(outDir, { recursive: true })
  const stem = (localPath.split(/[\\/]/).pop() ?? 'rom').replace(/\.[^.]+$/, '')
  const out = join(outDir, `${stem}.chd`)

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(chdman, ['createcd', '-i', localPath, '-o', out, '-f'])
    proc.on('error', reject)
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`chdman a échoué (code ${code})`))
    )
  })
  return out
}

export async function ensureRemoteDir(serial: string, remoteDir: string): Promise<void> {
  await getAdbClient().shell(serial, `mkdir -p '${remoteDir}'`)
}

/** sha256 du fichier sur l'appareil, via `adb shell sha256sum`. */
export async function sha256Device(serial: string, remotePath: string): Promise<string> {
  const out = await getAdbClient().shell(serial, `sha256sum '${remotePath}'`)
  const m = /([a-f0-9]{64})/i.exec(out)
  return m ? m[1].toLowerCase() : ''
}

/** Écrit un fichier texte (ex. .m3u) sur l'appareil via fichier temporaire + push. */
export async function writeRemoteText(
  serial: string,
  remotePath: string,
  content: string
): Promise<void> {
  const tmpDir = join(app.getPath('userData'), 'cache', 'tmp')
  mkdirSync(tmpDir, { recursive: true })
  const tmp = join(tmpDir, `m3u-${Date.now()}`)
  writeFileSync(tmp, content)
  try {
    await getAdbClient().pushFile(serial, tmp, remotePath)
  } finally {
    try {
      unlinkSync(tmp)
    } catch {
      /* nettoyage best-effort */
    }
  }
}

export async function readRemoteText(serial: string, remotePath: string): Promise<string> {
  return getAdbClient().shell(serial, `cat '${remotePath}'`)
}
