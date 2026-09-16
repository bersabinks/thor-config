import { describe, expect, it, vi } from 'vitest'
import {
  firmwareRemotePath,
  installVitaFirmware,
  VITA_FIRMWARE_PACKAGES,
  type VitaFirmwareIpc,
} from '../firmware'
import { makeSimulationVitaFirmwareIpc } from '../vitaIpc'
import { VITA_TARGETS } from '../vitaProcess'

const SERIAL = 'thor'
const opts = { retryDelayMs: 0, maxRetries: 1 }

/** Console en mémoire ; `corrupt` fait renvoyer un mauvais hash au téléchargement. */
function fakeIpc(o: { installed?: boolean; corrupt?: string[]; onDevice?: string[] } = {}) {
  const device = new Map<string, string>()
  for (const id of o.onDevice ?? []) {
    const p = VITA_FIRMWARE_PACKAGES.find((x) => x.id === id)!
    device.set(firmwareRemotePath(p), p.sha256)
  }
  const ipc = {
    getPackageInfo: vi.fn(async (_s: string, pkg: string) =>
      (o.installed ?? true) && pkg === VITA_TARGETS.vita3kPackageName ? { versionName: '1' } : null
    ),
    downloadFirmware: vi.fn(async (id: string) => {
      const p = VITA_FIRMWARE_PACKAGES.find((x) => x.id === id)!
      return { localPath: `C:/cache/${id}`, sha256: o.corrupt?.includes(id) ? '0'.repeat(64) : p.sha256, fromCache: false }
    }),
    ensureRemoteDir: vi.fn(async () => {}),
    pushFile: vi.fn(async (_s: string, local: string, remote: string) => {
      const p = VITA_FIRMWARE_PACKAGES.find((x) => local.endsWith(x.id))!
      device.set(remote, p.sha256)
    }),
    sha256Device: vi.fn(async (_s: string, remote: string) => {
      const sha = device.get(remote)
      if (!sha) throw new Error(`[ADB:COMMAND_FAILED] sha256sum: ${remote}: No such file or directory`)
      return sha
    }),
  } satisfies VitaFirmwareIpc
  return ipc
}

const byLabel = <T extends { label: string }>(steps: T[], part: string): T[] =>
  steps.filter((s) => s.label.includes(part))

describe('installVitaFirmware', () => {
  it('Vita3K absent : étape ignorée, aucun téléchargement', async () => {
    const ipc = fakeIpc({ installed: false })
    const steps = await installVitaFirmware(SERIAL, ipc, opts)
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ status: 'skipped' })
    expect(steps[0].note).toMatch(/Vita3K .* n’est pas installé/)
    expect(ipc.downloadFirmware).not.toHaveBeenCalled()
  })

  it('aucune console : ignoré', async () => {
    const steps = await installVitaFirmware('', fakeIpc(), opts)
    expect(steps.map((s) => s.status)).toEqual(['skipped'])
  })

  it('console injoignable : échec de détection', async () => {
    const ipc = fakeIpc()
    ipc.getPackageInfo.mockRejectedValueOnce(new Error('[ADB:DEVICE_DISCONNECTED] Console déconnectée'))
    const steps = await installVitaFirmware(SERIAL, ipc, opts)
    expect(steps[0].status).toBe('failed_after_retries')
    expect(steps[0].error).toMatch(/Console déconnectée/)
  })

  it('Vita3K présent : chaque paquet téléchargé, vérifié, déposé puis installation guidée', async () => {
    const ipc = fakeIpc()
    const steps = await installVitaFirmware(SERIAL, ipc, opts)

    expect(byLabel(steps, 'Téléchargement').map((s) => s.status)).toEqual(['success', 'success', 'success'])
    expect(byLabel(steps, 'Transfert console').map((s) => s.status)).toEqual(['success', 'success', 'success'])
    expect(ipc.pushFile).toHaveBeenCalledTimes(VITA_FIRMWARE_PACKAGES.length)
    // Préinstallation et polices ont le même nom : dossiers distincts.
    expect(new Set(VITA_FIRMWARE_PACKAGES.map(firmwareRemotePath)).size).toBe(VITA_FIRMWARE_PACKAGES.length)

    const guided = steps.at(-1)!
    expect(guided).toMatchObject({ status: 'skipped' })
    expect(guided.note).toMatch(/Install Firmware/)
    expect(guided.note).toContain('/sdcard/PSVita/firmware/PSVUPDAT.PUP')
  })

  it('fichiers déjà présents et identiques : aucun nouveau transfert', async () => {
    const ipc = fakeIpc({ onDevice: VITA_FIRMWARE_PACKAGES.map((p) => p.id) })
    const steps = await installVitaFirmware(SERIAL, ipc, opts)
    expect(ipc.pushFile).not.toHaveBeenCalled()
    expect(byLabel(steps, 'Transfert console').every((s) => s.status === 'success')).toBe(true)
  })

  it('empreinte non conforme : rien n’est transféré pour ce paquet', async () => {
    const ipc = fakeIpc({ corrupt: ['font'] })
    const steps = await installVitaFirmware(SERIAL, ipc, opts)
    const font = VITA_FIRMWARE_PACKAGES.find((p) => p.id === 'font')!

    expect(byLabel(steps, `Téléchargement ${font.displayName}`)[0].status).toBe('failed_after_retries')
    const transfer = byLabel(steps, `Transfert console ${font.displayName}`)[0]
    expect(transfer.status).toBe('failed_after_retries')
    expect(transfer.error).toMatch(/intégrité non vérifiée/)
    expect(ipc.pushFile).not.toHaveBeenCalledWith(SERIAL, expect.anything(), firmwareRemotePath(font))
    expect(ipc.pushFile).toHaveBeenCalledTimes(VITA_FIRMWARE_PACKAGES.length - 1)
  })

  it('IPC de simulation : parcours complet sans réseau ni console', async () => {
    const ipc = makeSimulationVitaFirmwareIpc()
    const steps = await installVitaFirmware(SERIAL, ipc, opts)
    expect(steps.filter((s) => s.status === 'failed_after_retries')).toEqual([])
    expect(ipc.pushed).toEqual(VITA_FIRMWARE_PACKAGES.map(firmwareRemotePath))
  })
})
