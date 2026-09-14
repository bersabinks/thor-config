import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import AdmZip from 'adm-zip'
import * as archive from '../../../../electron/main/vita/archive'
import { run, selectVitaArchives, type VitaIpc } from '../index'
import { buildSfo } from '../sfo'

/**
 * Critère d'acceptation du Prompt 6 sur de vrais fichiers : une archive
 * contenant une structure PS Vita factice (.zip via adm-zip, .7z via 7za)
 * produit une sortie conforme, copiée et vérifiée dans un dossier PC.
 */

const APP0: Record<string, Uint8Array> = {
  'eboot.bin': new TextEncoder().encode('eboot-factice'),
  'sce_sys/param.sfo': buildSfo({ TITLE: 'Demo Vita Homebrew', TITLE_ID: 'TEST00001' }),
  'sce_sys/icon0.png': new TextEncoder().encode('icone-factice'),
  'sce_module/libfactice.suprx': new TextEncoder().encode('module-factice'),
}
const EXPECTED_VPK = Object.keys(APP0).sort()
const FAST = { maxRetries: 0, retryDelayMs: 0 }

let root: string
let sourceDir: string

function makeNodeIpc(base: string): VitaIpc {
  let workCounter = 0
  const noDevice = async (): Promise<never> => {
    throw new Error('aucune console dans ce test')
  }
  return {
    listArchive: (p) => archive.listArchive(p),
    extractArchive: async (p) => {
      const workDir = join(base, 'work', String(++workCounter))
      return { workDir, files: await archive.extractArchive(p, workDir) }
    },
    readLocalBytes: async (p) => readFileSync(p),
    prepareOutputDir: async (titleId) => {
      const dir = join(base, 'out', titleId)
      mkdirSync(dir, { recursive: true })
      return dir
    },
    createZipFromDir: async (src, out) => archive.createZipFromDir(src, out),
    writeText: async (p, content) => {
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, content, 'utf-8')
    },
    readText: async (p) => readFileSync(p, 'utf-8'),
    sha256Local: (p) => archive.sha256File(p),
    fileSize: async (p) => archive.fileSize(p),
    copyLocal: async (src, dest) => archive.copyFile(src, dest),
    resolvePcOutputDir: async (configured) => {
      mkdirSync(configured, { recursive: true })
      return configured
    },
    removeWorkDir: async (dir) => archive.removeDir(dir),
    getPackageInfo: async () => null, // Vita3K absent → cible PC
    ensureRemoteDir: noDevice,
    pushFile: noDevice,
    sha256Device: noDevice,
  }
}

function vpkEntries(vpkPath: string): string[] {
  return new AdmZip(vpkPath)
    .getEntries()
    .filter((e) => !e.isDirectory)
    .map((e) => e.entryName)
    .sort()
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'thor-vita-'))
  sourceDir = join(root, 'source')
  for (const [rel, bytes] of Object.entries(APP0)) {
    const full = join(sourceDir, 'TEST00001', ...rel.split('/'))
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, bytes)
  }
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('module PS Vita — archives réelles', () => {
  it('.zip déposé dans le dossier d’import → .vpk conforme + .dpt copiés et vérifiés sur le PC', async () => {
    const importDir = join(root, 'import-zip')
    mkdirSync(importDir, { recursive: true })
    const zipPath = join(importDir, 'Demo Vita Homebrew.zip')
    const zip = new AdmZip()
    zip.addLocalFolder(sourceDir)
    zip.writeZip(zipPath)
    const otherZip = join(importDir, 'Documents.zip')
    const other = new AdmZip()
    other.addFile('lisez-moi.txt', Buffer.from('pas un jeu'))
    other.writeZip(otherZip)

    const base = join(root, 'run-zip')
    const ipc = makeNodeIpc(base)
    const selected = await selectVitaArchives([zipPath, otherZip, join(importDir, 'x.nds')], ipc)
    expect(selected).toEqual([zipPath])

    const pcDir = join(root, 'pc-zip')
    const res = await run({
      serial: '',
      files: selected,
      onStep: () => {},
      ipc,
      options: { ...FAST, pcOutputDir: pcDir },
    })

    expect(res.steps.filter((s) => s.status !== 'success')).toEqual([])
    const vpk = join(pcDir, 'TEST00001.vpk')
    expect(vpkEntries(vpk)).toEqual(EXPECTED_VPK)
    expect(new AdmZip(vpk).getEntry('sce_sys/param.sfo')!.getData()).toEqual(
      Buffer.from(APP0['sce_sys/param.sfo'])
    )
    expect(readFileSync(join(pcDir, 'Demo Vita Homebrew [TEST00001].dpt'), 'utf-8')).toBe(
      'title=Demo Vita Homebrew\ntitleId=TEST00001\n'
    )
    expect(existsSync(join(base, 'work', '1'))).toBe(false)
  })

  it('.7z déposé dans PSVita/ → extrait via 7za, même sortie conforme', async () => {
    const importDir = join(root, 'import-7z', 'PSVita')
    mkdirSync(importDir, { recursive: true })
    const sevenPath = join(importDir, 'Demo Vita Homebrew.7z')
    await new Promise<void>((done, reject) => {
      const stream = archive.Seven.add(sevenPath, join(sourceDir, '*'), {
        $bin: archive.sevenZipBinary(),
        recursive: true,
      })
      stream.on('end', () => done())
      stream.on('error', reject)
    })

    const ipc = makeNodeIpc(join(root, 'run-7z'))
    expect((await archive.listArchive(sevenPath)).sort()).toEqual(
      EXPECTED_VPK.map((f) => `TEST00001/${f}`).sort()
    )

    const pcDir = join(root, 'pc-7z')
    const res = await run({
      serial: '',
      files: await selectVitaArchives([sevenPath], ipc),
      onStep: () => {},
      ipc,
      options: { ...FAST, pcOutputDir: pcDir },
    })

    expect(res.steps.filter((s) => s.status !== 'success')).toEqual([])
    expect(vpkEntries(join(pcDir, 'TEST00001.vpk'))).toEqual(EXPECTED_VPK)
  })

  it('refuse d’extraire une entrée qui sort du dossier de travail (zip-slip)', async () => {
    const evilPath = join(root, 'evil.zip')
    const zip = new AdmZip()
    zip.addFile('placeholder.txt', Buffer.from('x'))
    zip.getEntry('placeholder.txt')!.entryName = '../evil.txt'
    zip.writeZip(evilPath)

    await expect(archive.extractArchive(evilPath, join(root, 'evil-work'))).rejects.toThrow(
      /hors du dossier d'extraction/
    )
    expect(existsSync(join(root, 'evil.txt'))).toBe(false)
  })
})
