import { describe, it, expect, vi } from 'vitest'
import { installEmulator, type EmulatorIpc, type EmulatorSource } from '../emulatorInstall'

const SIM_SOURCE: EmulatorSource = {
  id: 'dolphin',
  displayName: 'Dolphin (dev build)',
  githubRepo: 'dolphin-emu/dolphin',
  assetPattern: '.*android.*\\.apk$',
  packageName: 'org.dolphinemu.dolphinemu',
}

function makeSuccessIpc(version = 'sim-1.0'): EmulatorIpc {
  return {
    prepareApk: vi.fn().mockResolvedValue({ localPath: `/mock/cache/dolphin/${version}.apk`, version }),
    applyConfig: vi.fn().mockResolvedValue(undefined),
    verifyConfig: vi.fn().mockResolvedValue({
      InternalResolution: '4',
      AspectRatio: '0',
      UseExtendedAccessibilitySettings: 'False',
      ExternalDisplayResolution: 'Auto',
      BorderLeft: '0',
      BorderRight: '0',
      HotkeyScreenSwap: 'Button_Select',
      GCPad1Type: '6',
    }),
    installApk: vi.fn().mockResolvedValue(undefined),
    getPackageInfo: vi.fn().mockResolvedValue({ versionName: version, versionCode: 10000, packageName: SIM_SOURCE.packageName }),
  }
}

const FAST = { retryDelayMs: 0, maxRetries: 2 }

describe('installEmulator — cas nominal (simulation)', () => {
  it('retourne 3 StepResult par émulateur (téléchargement, installation, configuration)', async () => {
    const ipc = makeSuccessIpc()
    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST)
    expect(results).toHaveLength(3)
  })

  it('les 3 étapes sont en succès quand les IPC répondent correctement', async () => {
    const ipc = makeSuccessIpc()
    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST)
    for (const r of results) {
      expect(r.status).toBe('success')
    }
  })

  it("les labels contiennent le nom de l'émulateur et le type d'étape", async () => {
    const ipc = makeSuccessIpc()
    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST)
    expect(results[0].label).toContain('Dolphin')
    expect(results[0].label).toContain('Téléchargement')
    expect(results[1].label).toContain('Installation')
    expect(results[2].label).toContain('Configuration')
  })

  it('appelle installApk avec le chemin APK renvoyé par prepareApk', async () => {
    const ipc = makeSuccessIpc()
    await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST)
    expect(ipc.installApk).toHaveBeenCalledWith('mock-serial', '/mock/cache/dolphin/sim-1.0.apk')
  })

  it('appelle getPackageInfo avec le bon packageName', async () => {
    const ipc = makeSuccessIpc()
    await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST)
    expect(ipc.getPackageInfo).toHaveBeenCalledWith('mock-serial', SIM_SOURCE.packageName)
  })

  it('appelle applyConfig et verifyConfig avec le bon configPath', async () => {
    const ipc = makeSuccessIpc()
    await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST)
    expect(ipc.applyConfig).toHaveBeenCalledWith(
      'mock-serial',
      '/sdcard/dolphin-emu/Config/Dolphin.ini',
      expect.any(Object)
    )
    expect(ipc.verifyConfig).toHaveBeenCalledWith(
      'mock-serial',
      '/sdcard/dolphin-emu/Config/Dolphin.ini',
      expect.any(Object)
    )
  })
})

describe('installEmulator — gestion des échecs', () => {
  it("court-circuite installation+config si le téléchargement échoue", async () => {
    const ipc = makeSuccessIpc()
    ;(ipc.prepareApk as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'))

    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST)

    expect(results).toHaveLength(3)
    expect(results[0].status).toBe('failed_after_retries')
    expect(results[1].status).toBe('failed_after_retries')
    expect(results[2].status).toBe('failed_after_retries')

    // L'installation ne doit pas être tentée
    expect(ipc.installApk).not.toHaveBeenCalled()
    expect(ipc.applyConfig).not.toHaveBeenCalled()
  })

  it('marque installation comme echouee si getPackageInfo retourne null', async () => {
    const ipc = makeSuccessIpc()
    ;(ipc.getPackageInfo as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST)

    expect(results[0].status).toBe('success') // download OK
    expect(results[1].status).toBe('failed_after_retries') // install KO
    // config est tentée malgré l'échec install
    expect(ipc.applyConfig).toHaveBeenCalled()
  })

  it("reessaie prepareApk jusqu'a maxRetries fois en cas d'exception", async () => {
    const ipc = makeSuccessIpc()
    let callCount = 0
    ;(ipc.prepareApk as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++
      if (callCount < 3) throw new Error('timeout')
      return { localPath: '/mock/cache/dolphin/sim-1.0.apk', version: 'sim-1.0' }
    })

    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST)

    expect(results[0].status).toBe('success')
    expect(results[0].attempts).toBe(3)
  })

  it("inclut un message d'erreur lisible dans le step echoue", async () => {
    const ipc = makeSuccessIpc()
    ;(ipc.prepareApk as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('403 Forbidden'))

    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST)

    expect(results[0].error).toBeDefined()
    expect(results[0].error).toContain('403 Forbidden')
  })
})

describe('installEmulator — vérification de configuration', () => {
  it('échoue si verifyConfig retourne des valeurs différentes du profil', async () => {
    const ipc = makeSuccessIpc()
    ;(ipc.verifyConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      InternalResolution: '2', // attendu: 4
      AspectRatio: '0',
      UseExtendedAccessibilitySettings: 'False',
      ExternalDisplayResolution: 'Auto',
      BorderLeft: '0',
      BorderRight: '0',
      HotkeyScreenSwap: 'Button_Select',
      GCPad1Type: '6',
    })

    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST)
    expect(results[2].status).toBe('failed_after_retries')
    expect(results[2].error).toContain('InternalResolution')
  })
})
