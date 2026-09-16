import { app } from 'electron'
import { join, dirname } from 'path'
import { createHash } from 'crypto'
import {
  createReadStream,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'fs'
import { getAdbClient } from '../adb/factory'

function backupsRoot(): string {
  return join(app.getPath('userData'), 'backups')
}

/** Résout un chemin virtuel `saves://<emu>/<id>/<rel>` en chemin disque réel. */
function resolveLocal(virtualPath: string): string {
  const m = /^saves:\/\/(.+)$/.exec(virtualPath)
  if (!m) return virtualPath
  return join(backupsRoot(), ...m[1].split('/'))
}

export async function listDeviceFiles(serial: string, deviceDir: string): Promise<string[]> {
  // Dossier absent (émulateur jamais lancé) → find sort en code 1, que le client
  // réel transforme en erreur : `|| true` le ramène à « aucune sauvegarde ».
  const out = await getAdbClient().shell(serial, `find '${deviceDir}' -type f 2>/dev/null || true`)
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('/'))
}

export async function sha256Device(serial: string, devicePath: string): Promise<string> {
  const out = await getAdbClient().shell(serial, `sha256sum '${devicePath}'`)
  const m = /([a-f0-9]{64})/i.exec(out)
  return m ? m[1].toLowerCase() : ''
}

export async function deviceFileSize(serial: string, devicePath: string): Promise<number> {
  const out = await getAdbClient().shell(serial, `wc -c < '${devicePath}'`)
  const n = parseInt(out.trim(), 10)
  return Number.isFinite(n) ? n : 0
}

export async function ensureRemoteDir(serial: string, deviceDir: string): Promise<void> {
  await getAdbClient().shell(serial, `mkdir -p '${deviceDir}'`)
}

export async function pullFile(
  serial: string,
  devicePath: string,
  localVirtual: string
): Promise<void> {
  const local = resolveLocal(localVirtual)
  mkdirSync(dirname(local), { recursive: true })
  await getAdbClient().pullFile(serial, devicePath, local)
}

export async function pushFile(
  serial: string,
  localVirtual: string,
  devicePath: string
): Promise<void> {
  await getAdbClient().pushFile(serial, resolveLocal(localVirtual), devicePath)
}

export async function sha256Local(localVirtual: string): Promise<string> {
  const local = resolveLocal(localVirtual)
  const hash = createHash('sha256')
  const stream = createReadStream(local)
  for await (const chunk of stream) hash.update(chunk)
  return hash.digest('hex')
}

export async function writeText(localVirtual: string, content: string): Promise<void> {
  const local = resolveLocal(localVirtual)
  mkdirSync(dirname(local), { recursive: true })
  writeFileSync(local, content, 'utf-8')
}

export async function readText(localVirtual: string): Promise<string> {
  return readFileSync(resolveLocal(localVirtual), 'utf-8')
}

// ── Historique (UI) ─────────────────────────────────────────────────────────

export async function listBackups(emulatorId: string): Promise<string[]> {
  const dir = join(backupsRoot(), emulatorId)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort()
}

export async function readManifest(emulatorId: string, backupId: string): Promise<string | null> {
  const path = join(backupsRoot(), emulatorId, backupId, 'manifest.json')
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf-8')
}
