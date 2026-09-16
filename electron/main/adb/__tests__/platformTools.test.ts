import { afterEach, describe, expect, it, vi } from 'vitest'
import AdmZip from 'adm-zip'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ensurePlatformTools, PLATFORM_TOOLS_URL, type AdbSetupState, type PlatformToolsDeps } from '../platformTools'
import { extractArchive } from '../../vita/archive'

const VERSION = 'Android Debug Bridge version 1.0.41'

function platformToolsZip(files = ['adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll', 'fastboot.exe']): BodyInit {
  const zip = new AdmZip()
  for (const f of files) zip.addFile(`platform-tools/${f}`, Buffer.from(`binaire ${f}`))
  return new Uint8Array(zip.toBuffer()) as unknown as BodyInit
}

let root = ''
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  root = ''
})

function setup(overrides: Partial<PlatformToolsDeps> = {}) {
  root = mkdtempSync(join(tmpdir(), 'thor-pt-'))
  const installDir = join(root, 'ThorConfig', 'platform-tools')
  const fetchImpl = vi.fn(async () => new Response(platformToolsZip()))
  const states: AdbSetupState[] = []
  const deps: PlatformToolsDeps = {
    detect: () => null,
    installDir,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    extractZip: extractArchive,
    verifyAdb: async () => VERSION,
    ...overrides,
  }
  return { deps, installDir, fetchImpl, states, onState: (s: AdbSetupState) => states.push(s) }
}

describe('ensurePlatformTools — Zero-Setup ADB', () => {
  it('adb déjà présent sur le poste : aucun téléchargement', async () => {
    const { deps, fetchImpl, onState } = setup({ detect: () => ({ path: 'C:\\pt\\adb.exe', source: 'path' }) })
    const res = await ensurePlatformTools(deps, onState)
    expect(res).toEqual({ phase: 'system', path: 'C:\\pt\\adb.exe', source: 'path' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('aucun adb : télécharge l’archive officielle, extrait, vérifie et installe', async () => {
    const { deps, installDir, fetchImpl, states, onState } = setup()
    const res = await ensurePlatformTools(deps, onState)

    expect(fetchImpl).toHaveBeenCalledWith(PLATFORM_TOOLS_URL, expect.anything())
    expect(res).toEqual({ phase: 'ready', path: join(installDir, 'adb.exe'), version: VERSION })
    expect(existsSync(join(installDir, 'AdbWinUsbApi.dll'))).toBe(true)
    expect(states.map((s) => s.phase)).toEqual(expect.arrayContaining(['checking', 'downloading', 'extracting', 'ready']))
    // Ni archive ni dossier de transit laissés à côté de l'installation.
    expect(readdirSync(join(root, 'ThorConfig'))).toEqual(['platform-tools'])
  })

  it('copie interne déjà installée et fonctionnelle : réutilisée', async () => {
    const { deps, fetchImpl } = setup()
    const adb = join(deps.installDir, 'adb.exe')
    const res = await ensurePlatformTools({ ...deps, detect: () => ({ path: adb, source: 'internal' }) })
    expect(res).toEqual({ phase: 'ready', path: adb, version: VERSION })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('copie interne corrompue : retéléchargée', async () => {
    const { deps, fetchImpl } = setup()
    mkdirSync(deps.installDir, { recursive: true })
    writeFileSync(join(deps.installDir, 'adb.exe'), 'corrompu')
    let calls = 0
    const res = await ensurePlatformTools({
      ...deps,
      detect: () => ({ path: join(deps.installDir, 'adb.exe'), source: 'internal' }),
      verifyAdb: async () => {
        if (calls++ === 0) throw new Error('not a valid Win32 application')
        return VERSION
      },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(res.phase).toBe('ready')
  })

  it('archive incomplète : erreur explicite, rien d’installé', async () => {
    const { deps, installDir } = setup({
      fetchImpl: (async () => new Response(platformToolsZip(['adb.exe', 'AdbWinApi.dll']))) as unknown as typeof fetch,
    })
    const res = await ensurePlatformTools(deps)
    expect(res.phase).toBe('error')
    expect(res.phase === 'error' && res.message).toMatch(/AdbWinUsbApi\.dll/)
    expect(existsSync(installDir)).toBe(false)
  })

  it('pas de réseau : erreur, aucun fichier résiduel', async () => {
    const { deps } = setup({
      fetchImpl: (async () => {
        throw new TypeError('fetch failed')
      }) as unknown as typeof fetch,
    })
    const res = await ensurePlatformTools(deps)
    expect(res.phase === 'error' && res.message).toMatch(/fetch failed/)
    // Le dossier parent (userData de l'app) peut exister ; ni archive, ni transit, ni installation partielle.
    const parent = join(root, 'ThorConfig')
    expect(existsSync(parent) ? readdirSync(parent) : []).toEqual([])
  })

  it('adb extrait mais inutilisable : désinstallé pour ne pas être détecté ensuite', async () => {
    const { deps, installDir } = setup({
      verifyAdb: async () => {
        throw new Error('sortie inattendue')
      },
    })
    const res = await ensurePlatformTools(deps)
    expect(res.phase).toBe('error')
    expect(existsSync(installDir)).toBe(false)
  })
})
