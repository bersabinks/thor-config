import AdmZip from 'adm-zip'
import * as SevenNs from 'node-7z'
import { path7za } from '7zip-bin'
import { createHash } from 'crypto'
import { copyFileSync, createReadStream, mkdirSync, readdirSync, rmSync, statSync } from 'fs'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'path'

/**
 * Opérations d'archives du module PS Vita, sans dépendance à Electron
 * (testables directement sous Node). Chemins relatifs renvoyés avec '/'.
 */

// node-7z exporte un objet CommonJS non analysable statiquement : selon le
// chargeur (bundle electron-vite ou import Node natif), les commandes sont sur
// l'espace de noms ou sur `default`.
export const Seven = (SevenNs as unknown as { default?: typeof SevenNs }).default ?? SevenNs

/** Binaire 7za embarqué, y compris une fois empaqueté (voir asarUnpack). */
export function sevenZipBinary(): string {
  return path7za.includes('app.asar.unpacked')
    ? path7za
    : path7za.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`)
}

const isZipLike = (p: string) => /\.(zip|vpk)$/i.test(p)
const is7z = (p: string) => /\.7z$/i.test(p)

function unsupported(p: string): Error {
  return new Error(`Format d'archive non pris en charge : ${extname(p) || p}`)
}

function assertInside(root: string, target: string): void {
  const rel = relative(resolve(root), resolve(target))
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Entrée d'archive hors du dossier d'extraction refusée : ${target}`)
  }
}

export async function listArchive(archivePath: string): Promise<string[]> {
  if (isZipLike(archivePath)) {
    return new AdmZip(archivePath)
      .getEntries()
      .filter((e) => !e.isDirectory)
      .map((e) => e.entryName.replace(/\\/g, '/'))
  }
  if (is7z(archivePath)) {
    return new Promise((resolveList, reject) => {
      const files: string[] = []
      const stream = Seven.list(archivePath, { $bin: sevenZipBinary() })
      stream.on('data', (d) => {
        if (!d.attributes?.startsWith('D')) files.push(d.file.replace(/\\/g, '/'))
      })
      stream.on('end', () => resolveList(files))
      stream.on('error', reject)
    })
  }
  throw unsupported(archivePath)
}

/** Extrait l'archive dans destDir (vidé au préalable) et renvoie les fichiers extraits. */
export async function extractArchive(archivePath: string, destDir: string): Promise<string[]> {
  if (!isZipLike(archivePath) && !is7z(archivePath)) throw unsupported(archivePath)
  rmSync(destDir, { recursive: true, force: true })
  mkdirSync(destDir, { recursive: true })

  if (isZipLike(archivePath)) {
    const zip = new AdmZip(archivePath)
    for (const entry of zip.getEntries()) assertInside(destDir, join(destDir, entry.entryName))
    zip.extractAllTo(destDir, true)
  } else {
    await new Promise<void>((done, reject) => {
      const stream = Seven.extractFull(archivePath, destDir, { $bin: sevenZipBinary(), yes: true })
      stream.on('end', () => done())
      stream.on('error', reject)
    })
  }
  return listFilesRecursive(destDir)
}

export function listFilesRecursive(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) out.push(relative(root, full).split(sep).join('/'))
    }
  }
  walk(root)
  return out.sort()
}

/** Zip dont la racine est le contenu de sourceDir (format .vpk). */
export function createZipFromDir(sourceDir: string, outPath: string): void {
  const files = listFilesRecursive(sourceDir)
  if (files.length === 0) throw new Error(`Dossier source vide : ${sourceDir}`)
  mkdirSync(dirname(outPath), { recursive: true })
  const zip = new AdmZip()
  for (const rel of files) {
    const slash = rel.lastIndexOf('/')
    zip.addLocalFile(join(sourceDir, ...rel.split('/')), slash >= 0 ? rel.slice(0, slash) : '')
  }
  zip.writeZip(outPath)
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export function fileSize(path: string): number {
  return statSync(path).size
}

export function copyFile(sourcePath: string, destPath: string): void {
  mkdirSync(dirname(destPath), { recursive: true })
  copyFileSync(sourcePath, destPath)
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}
