import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { downloadVerifiedFile, type VerifiedFileSpec } from '../firmwareDownload'
import firmwareJson from '../../../../src/modules/vita/vitaFirmware.json'

const CONTENT = new TextEncoder().encode('SCEUF — contenu PUP factice')
const SPEC: VerifiedFileSpec = {
  id: 'font',
  fileName: 'PSP2UPDAT.PUP',
  url: 'http://dus01.psp2.update.playstation.net/test/PSP2UPDAT.PUP',
  sha256: createHash('sha256').update(CONTENT).digest('hex'),
  size: CONTENT.length,
}

let root = ''
const tmp = () => (root = mkdtempSync(join(tmpdir(), 'thor-fw-')))
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  root = ''
})

const fetchOf = (body: Uint8Array) =>
  vi.fn(async () => new Response(body as unknown as BodyInit)) as unknown as typeof fetch

describe('downloadVerifiedFile', () => {
  it('télécharge et vérifie le SHA-256 attendu', async () => {
    const cache = tmp()
    const r = await downloadVerifiedFile(SPEC, cache, fetchOf(CONTENT))
    expect(r).toEqual({ localPath: join(cache, 'font', 'PSP2UPDAT.PUP'), sha256: SPEC.sha256, fromCache: false })
  })

  it('fichier en cache intact : réutilisé sans réseau', async () => {
    const cache = tmp()
    mkdirSync(join(cache, 'font'), { recursive: true })
    writeFileSync(join(cache, 'font', 'PSP2UPDAT.PUP'), CONTENT)
    const fetchImpl = fetchOf(CONTENT)
    const r = await downloadVerifiedFile(SPEC, cache, fetchImpl)
    expect(r.fromCache).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('cache altéré : retéléchargé', async () => {
    const cache = tmp()
    mkdirSync(join(cache, 'font'), { recursive: true })
    writeFileSync(join(cache, 'font', 'PSP2UPDAT.PUP'), new Uint8Array(CONTENT.length))
    const fetchImpl = fetchOf(CONTENT)
    expect((await downloadVerifiedFile(SPEC, cache, fetchImpl)).fromCache).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('contenu non conforme : rejeté et supprimé', async () => {
    const cache = tmp()
    const altered = new Uint8Array(CONTENT)
    altered[0] ^= 0xff
    await expect(downloadVerifiedFile(SPEC, cache, fetchOf(altered))).rejects.toThrow(/Intégrité invalide.*SHA-256 attendu/)
    expect(existsSync(join(cache, 'font', 'PSP2UPDAT.PUP'))).toBe(false)
  })
})

describe('vitaFirmware.json — paquets officiels verrouillés', () => {
  it('uniquement des serveurs Sony, empreintes SHA-256 complètes et tailles connues', () => {
    expect(firmwareJson.packages.map((p) => p.id).sort()).toEqual(['firmware', 'font', 'preinstall'])
    for (const p of firmwareJson.packages) {
      expect(new URL(p.url).host).toMatch(/\.update\.playstation\.net$/)
      expect(p.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(p.size).toBeGreaterThan(10 * 1024 * 1024)
    }
  })

  it('firmware 3.74 : fichier et empreinte relevés sur le serveur officiel', () => {
    const fw = firmwareJson.packages.find((p) => p.id === 'firmware')!
    expect(fw.fileName).toBe('PSVUPDAT.PUP')
    expect(fw.sha256).toBe('6ef6dc8da6db026f28647713e473486d770087a605c52a8d751bfca7478386cf')
  })
})
