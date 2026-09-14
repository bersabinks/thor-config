import { describe, it, expect, vi } from 'vitest'
import { processRom, type RomsIpc } from '../romsProcess'

function header(offset: number, hex: string, len: number): Uint8Array {
  const b = new Uint8Array(len)
  for (let i = 0; i < hex.length / 2; i++) b[offset + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return b
}

const PS2_HEADER = header(32769, '4344303031', 0x8010)

function makeIpc(over: Partial<RomsIpc> = {}): RomsIpc {
  return {
    readHeader: vi.fn().mockResolvedValue(new Uint8Array(0)),
    sha256Local: vi.fn().mockResolvedValue('deadbeef'),
    hasChdman: vi.fn().mockResolvedValue(false),
    chdmanConvert: vi.fn().mockResolvedValue('/cache/out.chd'),
    ensureRemoteDir: vi.fn().mockResolvedValue(undefined),
    pushRom: vi.fn().mockResolvedValue(undefined),
    sha256Device: vi.fn().mockResolvedValue('deadbeef'),
    writeRemoteText: vi.fn().mockResolvedValue(undefined),
    readRemoteText: vi.fn().mockResolvedValue(''),
    ...over,
  }
}

const FAST = { maxRetries: 1, retryDelayMs: 0 }

describe('processRom — nominal', () => {
  it('identifie par extension puis transfère avec vérification de hash', async () => {
    const ipc = makeIpc()
    const res = await processRom('serial', 'Mario Kart DS.nds', ipc, FAST)

    expect(res.system?.id).toBe('nds')
    expect(res.steps.map((s) => s.status)).toEqual(['success', 'success'])
    expect(res.remotePath).toBe('/sdcard/ROMs/nds/Mario Kart DS.nds')
    expect(ipc.pushRom).toHaveBeenCalledWith(
      'serial',
      'Mario Kart DS.nds',
      '/sdcard/ROMs/nds/Mario Kart DS.nds'
    )
  })
})

describe('processRom — identification impossible', () => {
  it('échoue proprement et ne transfère pas', async () => {
    const ipc = makeIpc()
    const res = await processRom('serial', 'notes.xyz', ipc, FAST)

    expect(res.system).toBeNull()
    expect(res.steps).toHaveLength(1)
    expect(res.steps[0].status).toBe('failed_after_retries')
    expect(ipc.pushRom).not.toHaveBeenCalled()
  })
})

describe('processRom — conversion CHD', () => {
  it('chdman absent → étape CHD ignorée (skipped), fichier original poussé', async () => {
    const ipc = makeIpc({
      readHeader: vi.fn().mockResolvedValue(PS2_HEADER),
      hasChdman: vi.fn().mockResolvedValue(false),
    })
    const res = await processRom('serial', 'FFX.iso', ipc, FAST)

    expect(res.system?.id).toBe('ps2')
    expect(res.steps.map((s) => s.status)).toEqual(['success', 'skipped', 'success'])

    const chd = res.steps.find((s) => s.label.includes('Conversion CHD'))!
    expect(chd.status).toBe('skipped')
    expect(chd.status).not.toBe('success') // garde anti-régression
    expect(chd.note).toMatch(/chdman/i)
    expect(ipc.chdmanConvert).not.toHaveBeenCalled()
    expect(ipc.pushRom).toHaveBeenCalledWith('serial', 'FFX.iso', '/sdcard/ROMs/ps2/FFX.iso')
  })

  it('chdman présent → convertit et pousse le .chd', async () => {
    const ipc = makeIpc({
      readHeader: vi.fn().mockResolvedValue(PS2_HEADER),
      hasChdman: vi.fn().mockResolvedValue(true),
      chdmanConvert: vi.fn().mockResolvedValue('/cache/FFX.chd'),
    })
    const res = await processRom('serial', 'FFX.iso', ipc, FAST)

    expect(res.steps.map((s) => s.status)).toEqual(['success', 'success', 'success'])
    expect(ipc.chdmanConvert).toHaveBeenCalledWith('FFX.iso')
    expect(ipc.pushRom).toHaveBeenCalledWith('serial', '/cache/FFX.chd', '/sdcard/ROMs/ps2/FFX.chd')
    expect(res.remotePath).toBe('/sdcard/ROMs/ps2/FFX.chd')
  })
})

describe('processRom — transfert vérifié', () => {
  it('hash local ≠ hash device → failed_after_retries', async () => {
    const ipc = makeIpc({ sha256Device: vi.fn().mockResolvedValue('cafe') })
    const res = await processRom('serial', 'Mario.nds', ipc, { maxRetries: 1, retryDelayMs: 0 })

    const transfer = res.steps.find((s) => s.label.includes('Transfert'))!
    expect(transfer.status).toBe('failed_after_retries')
    expect(res.remotePath).toBeUndefined()
  })

  it('reprise : échoue au 1er essai puis réussit (device reconnecté)', async () => {
    let n = 0
    const ipc = makeIpc({
      sha256Device: vi.fn().mockImplementation(async () => (++n < 2 ? 'mismatch' : 'deadbeef')),
    })
    const res = await processRom('serial', 'Mario.nds', ipc, { maxRetries: 2, retryDelayMs: 0 })

    const transfer = res.steps.find((s) => s.label.includes('Transfert'))!
    expect(transfer.status).toBe('success')
    expect(transfer.attempts).toBe(2)
  })
})
