import { app } from 'electron'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import * as archive from './archive'
import { TITLE_ID_RE } from '../../../src/modules/vita/sfo'
import firmwareJson from '../../../src/modules/vita/vitaFirmware.json'
import { downloadVerifiedFile, type FirmwareDownloadResult } from './firmwareDownload'

function vitaCacheRoot(): string {
  return join(app.getPath('userData'), 'cache', 'vita')
}

function assertInside(root: string, target: string): void {
  const rel = relative(resolve(root), resolve(target))
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Chemin hors du cache PS Vita refusé : ${target}`)
  }
}

export async function listArchive(archivePath: string): Promise<string[]> {
  return archive.listArchive(archivePath)
}

export async function extractArchive(
  archivePath: string
): Promise<{ workDir: string; files: string[] }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const workDir = join(vitaCacheRoot(), 'work', stamp)
  return { workDir, files: await archive.extractArchive(archivePath, workDir) }
}

export async function readLocalBytes(localPath: string): Promise<Uint8Array> {
  return readFileSync(localPath)
}

export async function prepareOutputDir(titleId: string): Promise<string> {
  if (!TITLE_ID_RE.test(titleId)) throw new Error(`Title ID invalide : ${titleId}`)
  const dir = join(vitaCacheRoot(), 'out', titleId)
  mkdirSync(dir, { recursive: true })
  return dir
}

export async function createZipFromDir(sourceDir: string, outPath: string): Promise<void> {
  archive.createZipFromDir(sourceDir, outPath)
}

export async function writeText(localPath: string, content: string): Promise<void> {
  mkdirSync(dirname(localPath), { recursive: true })
  writeFileSync(localPath, content, 'utf-8')
}

export async function readText(localPath: string): Promise<string> {
  return readFileSync(localPath, 'utf-8')
}

export async function sha256Local(localPath: string): Promise<string> {
  return archive.sha256File(localPath)
}

export async function fileSize(localPath: string): Promise<number> {
  return archive.fileSize(localPath)
}

export async function copyLocal(sourcePath: string, destPath: string): Promise<void> {
  archive.copyFile(sourcePath, destPath)
}

/** Dossier configuré, ou Documents/ThorConfig/PSVita par défaut ; créé si absent. */
export async function resolvePcOutputDir(configured: string): Promise<string> {
  const dir = configured || join(app.getPath('documents'), 'ThorConfig', 'PSVita')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Télécharge un paquet firmware Vita3K. Le renderer ne transmet qu'un id : URL,
 * taille et SHA-256 viennent du JSON embarqué, jamais de l'appelant.
 */
export async function downloadFirmware(id: string): Promise<FirmwareDownloadResult> {
  const pkg = firmwareJson.packages.find((p) => p.id === id)
  if (!pkg) throw new Error(`Paquet firmware inconnu : ${id}`)
  return downloadVerifiedFile(pkg, join(vitaCacheRoot(), 'firmware'))
}

/** Supprime un dossier de travail — refusé en dehors du cache PS Vita. */
export async function removeWorkDir(workDir: string): Promise<void> {
  assertInside(join(vitaCacheRoot(), 'work'), workDir)
  archive.removeDir(workDir)
}
