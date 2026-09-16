import { describe, expect, it, vi } from 'vitest'
import { checkUpdate, checkUpdates, isObtainiumInstalled, updateEmulator, type UpdatesIpc } from '../updates'
import sourcesJson from '../sources.json'
import type { EmulatorSource } from '../emulatorInstall'
import type { StepResult } from '../../../verification'

const sources = sourcesJson as EmulatorSource[]
const wm = sources.find((s) => s.id === 'watermelonds')!
const duck = sources.find((s) => s.sourceType === 'playstore')!
const FAST = { retryDelayMs: 0, maxRetries: 0 }

function ipcWith(over: Partial<UpdatesIpc> = {}): UpdatesIpc {
  return {
    prepareApk: vi.fn(async ({ id }: { id: string }) => ({ localPath: `/cache/${id}.apk`, version: '0.7.0' })),
    installApk: vi.fn(async () => {}),
    getPackageInfo: vi.fn(async () => ({ versionName: '0.7.0' })),
    applyConfig: vi.fn(async () => {}),
    verifyConfig: vi.fn(async () => ({})),
    latestVersion: vi.fn(async () => ({ version: '0.7.0' })),
    ...over,
  } as UpdatesIpc
}

describe('checkUpdate', () => {
  it('versions identiques → à jour', async () => {
    const r = await checkUpdate('s', wm, ipcWith())
    expect(r).toMatchObject({ state: 'up-to-date', installedVersion: '0.7.0', latestVersion: '0.7.0' })
  })

  it('version publiée plus récente → mise à jour disponible', async () => {
    const ipc = ipcWith({
      getPackageInfo: vi.fn(async () => ({ versionName: '0.6.1' })),
      latestVersion: vi.fn(async () => ({ version: '0.7.0' })),
    })
    expect(await checkUpdate('s', wm, ipc)).toMatchObject({ state: 'update-available', latestVersion: '0.7.0' })
  })

  it('pré-version installée → mise à jour vers la finale', async () => {
    const ipc = ipcWith({ getPackageInfo: vi.fn(async () => ({ versionName: '0.7.0.rc5' })) })
    expect((await checkUpdate('s', wm, ipc)).state).toBe('update-available')
  })

  it('paquet absent → non installé, sans interroger le dépôt', async () => {
    const ipc = ipcWith({ getPackageInfo: vi.fn(async () => null) })
    expect((await checkUpdate('s', wm, ipc)).state).toBe('not-installed')
    expect(ipc.latestVersion).not.toHaveBeenCalled()
  })

  it('Google Play : version publiée non consultable → mise à jour manuelle', async () => {
    const ipc = ipcWith()
    const r = await checkUpdate('s', duck, ipc)
    expect(r).toMatchObject({ state: 'manual', installedVersion: '0.7.0', latestVersion: null })
    expect(ipc.latestVersion).not.toHaveBeenCalled()
  })

  it('dépôt injoignable → état inconnu avec l’erreur, jamais « à jour »', async () => {
    const ipc = ipcWith({
      latestVersion: vi.fn(async () => {
        throw new Error('[ADB:COMMAND_FAILED] Dépôt F-Droid injoignable (HTTP 403)')
      }),
    })
    const r = await checkUpdate('s', wm, ipc)
    expect(r.state).toBe('unknown')
    expect(r.error).toMatch(/HTTP 403/)
  })

  it('versions non comparables → inconnu (et pas un faux « à jour »)', async () => {
    const ipc = ipcWith({ latestVersion: vi.fn(async () => ({ version: 'latest' })) })
    const r = await checkUpdate('s', wm, ipc)
    expect(r.state).toBe('unknown')
    expect(r.error).toMatch(/non comparables/)
  })
})

describe('checkUpdates', () => {
  it('couvre tous les émulateurs de sources.json, dans l’ordre', async () => {
    const all = await checkUpdates('s', ipcWith())
    expect(all.map((r) => r.source.id)).toEqual(sources.map((s) => s.id))
  })
})

describe('updateEmulator', () => {
  it('rejoue le pipeline téléchargement + installation vérifiée', async () => {
    const ipc = ipcWith()
    const steps: StepResult[] = []
    const res = await updateEmulator('s', wm, ipc, (st) => steps.push(st), FAST)

    expect(res.map((r) => r.label)).toEqual([
      `${wm.displayName} — Téléchargement APK`,
      `${wm.displayName} — Installation`,
    ])
    expect(res.every((r) => r.status === 'success')).toBe(true)
    expect(ipc.installApk).toHaveBeenCalledWith('s', '/cache/watermelonds.apk')
    // Aucune configuration appliquée : les profils ne sont pas validés.
    expect(ipc.applyConfig).not.toHaveBeenCalled()
    expect(steps).toHaveLength(2)
  })

  it('Google Play : étapes ignorées, aucun APK installé', async () => {
    const ipc = ipcWith()
    const res = await updateEmulator('s', duck, ipc, () => {}, FAST)
    expect(res.every((r) => r.status === 'skipped')).toBe(true)
    expect(ipc.installApk).not.toHaveBeenCalled()
  })
})

describe('isObtainiumInstalled', () => {
  it('vrai si le paquet répond, faux si absent ou console injoignable', async () => {
    expect(await isObtainiumInstalled('s', ipcWith())).toBe(true)
    expect(await isObtainiumInstalled('s', ipcWith({ getPackageInfo: vi.fn(async () => null) }))).toBe(false)
    expect(
      await isObtainiumInstalled(
        's',
        ipcWith({
          getPackageInfo: vi.fn(async () => {
            throw new Error('déconnectée')
          }),
        })
      )
    ).toBe(false)
  })
})
