import { describe, it, expect, vi } from 'vitest'
import { isBiosFile, identifyBios, selectBiosFiles } from '../biosDetect'
import { runBios, type BiosIpc } from '../biosProcess'

describe('BIOS module — Détection des fichiers', () => {
  it('reconnaît les BIOS courants par leur nom', () => {
    expect(isBiosFile('C:\\Roms\\scph5501.bin')).toBe(true)
    expect(isBiosFile('C:\\Roms\\SCPH39001.BIN')).toBe(true)
    expect(isBiosFile('C:\\Roms\\prod.keys')).toBe(true)
    expect(isBiosFile('C:\\Roms\\title.keys')).toBe(true)
    expect(isBiosFile('C:\\Roms\\gba_bios.bin')).toBe(true)
    expect(isBiosFile('C:\\Roms\\mpr-17933.bin')).toBe(true)
    expect(isBiosFile('C:\\Roms\\Mario.iso')).toBe(false)
  })

  it('reconnaît les fichiers dans un sous-dossier bios ou firmware', () => {
    expect(isBiosFile('C:\\Import\\BIOS\\custom_ps2.bin')).toBe(true)
    expect(isBiosFile('C:\\Import\\firmware\\sys.bin')).toBe(true)
  })

  it('génère les chemins cibles standardisés sur la console', () => {
    const candidate = identifyBios('C:\\Games\\scph5501.bin')
    expect(candidate).not.toBeNull()
    expect(candidate!.system).toBe('PlayStation 1')
    expect(candidate!.targetRemotePaths).toContain('/storage/emulated/0/BIOS/scph5501.bin')
    expect(candidate!.targetRemotePaths).toContain('/storage/emulated/0/ROMs/bios/scph5501.bin')
  })

  it('selectBiosFiles filtre et extrait les candidats', () => {
    const files = [
      'C:\\Games\\Mario.nds',
      'C:\\Games\\scph5501.bin',
      'C:\\Games\\prod.keys',
      'C:\\Games\\Zelda.iso',
    ]
    const candidates = selectBiosFiles(files)
    expect(candidates).toHaveLength(2)
    expect(candidates.map((c) => c.fileName)).toEqual(['scph5501.bin', 'prod.keys'])
  })
})

describe('BIOS module — Déploiement et Idempotence', () => {
  it('si aucun fichier BIOS n’est présent, génère une étape skipped explicite', async () => {
    const ipc: BiosIpc = {
      sha256Local: vi.fn(),
      sha256Device: vi.fn(),
      ensureRemoteDir: vi.fn(),
      pushFile: vi.fn(),
    }
    const onStep = vi.fn()
    const results = await runBios({
      serial: 'SER123',
      candidates: [],
      onStep,
      ipc,
    })

    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('skipped')
    expect(results[0].note).toContain('Aucun fichier BIOS détecté')
  })

  it('transfère et vérifie les fichiers BIOS avec succès', async () => {
    const filesOnDevice = new Map<string, string>()
    const ipc: BiosIpc = {
      sha256Local: vi.fn().mockResolvedValue('hash1234'),
      sha256Device: vi.fn().mockImplementation(async (_s, p) => filesOnDevice.get(p) ?? 'none'),
      ensureRemoteDir: vi.fn().mockResolvedValue(undefined),
      pushFile: vi.fn().mockImplementation(async (_s, _l, remote) => {
        filesOnDevice.set(remote, 'hash1234')
      }),
    }
    const onStep = vi.fn()
    const candidates = selectBiosFiles(['C:\\scph5501.bin'])
    const results = await runBios({
      serial: 'SER123',
      candidates,
      onStep,
      ipc,
    })

    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.every((r) => r.status === 'success')).toBe(true)
    expect(ipc.pushFile).toHaveBeenCalled()
  })

  it('idempotence : si le fichier a déjà le bon hash sur la console, aucun re-transfert', async () => {
    const ipc: BiosIpc = {
      sha256Local: vi.fn().mockResolvedValue('hash1234'),
      sha256Device: vi.fn().mockResolvedValue('hash1234'),
      ensureRemoteDir: vi.fn().mockResolvedValue(undefined),
      pushFile: vi.fn().mockResolvedValue(undefined),
    }
    const onStep = vi.fn()
    const candidates = selectBiosFiles(['C:\\scph5501.bin'])
    const results = await runBios({
      serial: 'SER123',
      candidates,
      onStep,
      ipc,
    })

    expect(results.every((r) => r.status === 'success')).toBe(true)
    expect(ipc.pushFile).not.toHaveBeenCalled()
  })
})
