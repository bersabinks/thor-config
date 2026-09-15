import { describe, it, expect } from 'vitest'
import { runPreChecks, parseDfAvailableBytes, type PreCheckIpc } from '../preChecks'
import type { AdbDevice } from '../../../../electron/main/adb/types'

const DEVICE: AdbDevice = { serial: 'THOR123', model: 'AYN Thor Max', state: 'device' }
const DF_OK =
  'Filesystem     1K-blocks     Used Available Use% Mounted on\n/dev/fuse      117440512 27262976  90177536  24% /storage/emulated'

function ipc(over: Partial<PreCheckIpc> = {}): PreCheckIpc {
  return {
    listDevices: async () => [DEVICE],
    shell: async () => DF_OK,
    ...over,
  }
}

function labels(steps: { label: string; status: string }[]) {
  return steps.map((s) => [s.label, s.status])
}

describe('parseDfAvailableBytes', () => {
  it('extrait la colonne Available (Kio → octets)', () => {
    expect(parseDfAvailableBytes(DF_OK)).toBe(90177536 * 1024)
  })
  it('renvoie null sur une sortie inexploitable', () => {
    expect(parseDfAvailableBytes('')).toBeNull()
    expect(parseDfAvailableBytes('Filesystem 1K-blocks')).toBeNull()
  })
})

describe('runPreChecks — chemin nominal', () => {
  it('valide adb, device, autorisation et espace disque', async () => {
    const res = await runPreChecks(ipc())
    expect(res.canProceed).toBe(true)
    expect(res.serial).toBe('THOR123')
    expect(labels(res.steps)).toEqual([
      ['Plate-forme ADB disponible', 'success'],
      ['Console connectée', 'success'],
      ['Débogage USB autorisé', 'success'],
      ['Espace de stockage suffisant', 'success'],
    ])
  })
})

describe('runPreChecks — blocages', () => {
  it('adb injoignable → bloquant, s’arrête immédiatement', async () => {
    const res = await runPreChecks(
      ipc({
        listDevices: async () => {
          throw new Error('adb not found')
        },
      })
    )
    expect(res.canProceed).toBe(false)
    expect(res.steps).toHaveLength(1)
    expect(res.steps[0].status).toBe('failed_after_retries')
  })

  it('aucun appareil → bloquant', async () => {
    const res = await runPreChecks(ipc({ listDevices: async () => [] }))
    expect(res.canProceed).toBe(false)
    expect(res.steps.at(-1)?.label).toBe('Console connectée')
  })

  it('appareil non autorisé → bloquant avec message clair', async () => {
    const res = await runPreChecks(
      ipc({ listDevices: async () => [{ ...DEVICE, state: 'unauthorized' }] })
    )
    expect(res.canProceed).toBe(false)
    const last = res.steps.at(-1)!
    expect(last.label).toBe('Débogage USB autorisé')
    expect(last.error).toMatch(/Autorisez le débogage USB/)
  })
})

describe('runPreChecks — espace disque non bloquant', () => {
  it('disque insuffisant → étape en échec mais canProceed reste vrai', async () => {
    const lowDf =
      'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/fuse 117440512 117000000 500000 99% /storage/emulated'
    const res = await runPreChecks(ipc({ shell: async () => lowDf }), { requiredFreeBytes: 2 ** 31 })
    expect(res.canProceed).toBe(true)
    const disk = res.steps.at(-1)!
    expect(disk.label).toBe('Espace de stockage suffisant')
    expect(disk.status).toBe('failed_after_retries')
  })

  it('df illisible → étape ignorée, run possible', async () => {
    const res = await runPreChecks(ipc({ shell: async () => 'nonsense' }))
    expect(res.canProceed).toBe(true)
    expect(res.steps.at(-1)?.status).toBe('skipped')
  })
})
