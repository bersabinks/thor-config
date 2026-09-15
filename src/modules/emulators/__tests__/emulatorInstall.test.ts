import { describe, it, expect, vi } from 'vitest'
import {
  installApp,
  installEmulator,
  type EmulatorIpc,
  type EmulatorSource,
  type ConfigProfile,
} from '../emulatorInstall'

const SIM_SOURCE: EmulatorSource = {
  id: 'dolphin',
  displayName: 'Dolphin (dev build)',
  sourceType: 'github',
  githubRepo: 'dolphin-emu/dolphin',
  assetPattern: '.*android.*\\.apk$',
  packageName: 'org.dolphinemu.dolphinemu',
}

const DOLPHIN_SETTINGS = {
  InternalResolution: '4',
  AspectRatio: '0',
  UseExtendedAccessibilitySettings: 'False',
  ExternalDisplayResolution: 'Auto',
  BorderLeft: '0',
  BorderRight: '0',
  HotkeyScreenSwap: 'Button_Select',
  GCPad1Type: '6',
}

// Profil validé : l'étape de configuration doit réellement s'appliquer + se vérifier.
const CONFIRMED_PROFILE: ConfigProfile = {
  configPath: '/sdcard/dolphin-emu/Config/Dolphin.ini',
  _confirmed: true,
  settings: DOLPHIN_SETTINGS,
}

// Profil non validé : l'étape de configuration doit être ignorée (skipped).
const UNCONFIRMED_PROFILE: ConfigProfile = {
  configPath: '/sdcard/dolphin-emu/Config/Dolphin.ini',
  _confirmed: false,
  settings: DOLPHIN_SETTINGS,
}

function makeSuccessIpc(version = 'sim-1.0'): EmulatorIpc {
  return {
    prepareApk: vi.fn().mockResolvedValue({ localPath: `/mock/cache/dolphin/${version}.apk`, version }),
    applyConfig: vi.fn().mockResolvedValue(undefined),
    verifyConfig: vi.fn().mockResolvedValue({ ...DOLPHIN_SETTINGS }),
    installApk: vi.fn().mockResolvedValue(undefined),
    getPackageInfo: vi.fn().mockResolvedValue({ versionName: version, versionCode: 10000, packageName: SIM_SOURCE.packageName }),
  }
}

const FAST = { retryDelayMs: 0, maxRetries: 2 }

describe('installEmulator — cas nominal (profil validé)', () => {
  it('retourne 3 StepResult par émulateur (téléchargement, installation, configuration)', async () => {
    const ipc = makeSuccessIpc()
    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST, CONFIRMED_PROFILE)
    expect(results).toHaveLength(3)
  })

  it('les 3 étapes sont en succès quand les IPC répondent correctement', async () => {
    const ipc = makeSuccessIpc()
    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST, CONFIRMED_PROFILE)
    for (const r of results) {
      expect(r.status).toBe('success')
    }
  })

  it("les labels contiennent le nom de l'émulateur et le type d'étape", async () => {
    const ipc = makeSuccessIpc()
    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST, CONFIRMED_PROFILE)
    expect(results[0].label).toContain('Dolphin')
    expect(results[0].label).toContain('Téléchargement')
    expect(results[1].label).toContain('Installation')
    expect(results[2].label).toContain('Configuration')
  })

  it('appelle installApk avec le chemin APK renvoyé par prepareApk', async () => {
    const ipc = makeSuccessIpc()
    await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST, CONFIRMED_PROFILE)
    expect(ipc.installApk).toHaveBeenCalledWith('mock-serial', '/mock/cache/dolphin/sim-1.0.apk')
  })

  it('appelle getPackageInfo avec le bon packageName', async () => {
    const ipc = makeSuccessIpc()
    await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST, CONFIRMED_PROFILE)
    expect(ipc.getPackageInfo).toHaveBeenCalledWith('mock-serial', SIM_SOURCE.packageName)
  })

  it('appelle applyConfig et verifyConfig avec le bon configPath', async () => {
    const ipc = makeSuccessIpc()
    await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST, CONFIRMED_PROFILE)
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

describe('installApp — pipeline commun (sans configuration)', () => {
  it('renvoie téléchargement + installation, sans toucher à la configuration', async () => {
    const ipc = makeSuccessIpc()
    const results = await installApp('mock-serial', SIM_SOURCE, ipc, FAST)
    expect(results.map((r) => r.label)).toEqual(['Dolphin (dev build) — Téléchargement APK', 'Dolphin (dev build) — Installation'])
    expect(results.every((r) => r.status === 'success')).toBe(true)
    expect(ipc.applyConfig).not.toHaveBeenCalled()
  })

  it('téléchargement en échec : installation en échec, APK jamais installé', async () => {
    const ipc = makeSuccessIpc()
    ;(ipc.prepareApk as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'))
    const results = await installApp('mock-serial', SIM_SOURCE, ipc, FAST)
    expect(results.map((r) => r.status)).toEqual(['failed_after_retries', 'failed_after_retries'])
    expect(ipc.installApk).not.toHaveBeenCalled()
  })
})

describe('installEmulator — gestion des échecs', () => {
  it("court-circuite installation+config si le téléchargement échoue", async () => {
    const ipc = makeSuccessIpc()
    ;(ipc.prepareApk as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'))

    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST, CONFIRMED_PROFILE)

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

    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST, CONFIRMED_PROFILE)

    expect(results[0].status).toBe('success') // download OK
    expect(results[1].status).toBe('failed_after_retries') // install KO
    // config est tentée malgré l'échec install (profil validé)
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

    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST, CONFIRMED_PROFILE)

    expect(results[0].status).toBe('success')
    expect(results[0].attempts).toBe(3)
  })

  it("inclut un message d'erreur lisible dans le step echoue", async () => {
    const ipc = makeSuccessIpc()
    ;(ipc.prepareApk as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('403 Forbidden'))

    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST, CONFIRMED_PROFILE)

    expect(results[0].error).toBeDefined()
    expect(results[0].error).toContain('403 Forbidden')
  })
})

describe('installEmulator — vérification de configuration (profil validé)', () => {
  it('échoue si verifyConfig retourne des valeurs différentes du profil', async () => {
    const ipc = makeSuccessIpc()
    ;(ipc.verifyConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DOLPHIN_SETTINGS,
      InternalResolution: '2', // attendu: 4
    })

    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST, CONFIRMED_PROFILE)
    expect(results[2].status).toBe('failed_after_retries')
    expect(results[2].error).toContain('InternalResolution')
  })
})

describe('installEmulator — profil non validé (skipped)', () => {
  // GARDE ANTI-RÉGRESSION : une config non confirmée ne doit JAMAIS ressortir en 'success'.
  it("une étape Configuration avec _confirmed: false ressort en 'skipped', jamais en 'success'", async () => {
    const ipc = makeSuccessIpc() // verifyConfig renverrait un succès SI on l'appelait
    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST, UNCONFIRMED_PROFILE)

    const config = results.find((r) => r.label.includes('Configuration'))!
    expect(config.status).toBe('skipped')
    expect(config.status).not.toBe('success')

    // Le mock ne doit pas avoir court-circuité la logique : rien n'est appliqué ni vérifié.
    expect(ipc.applyConfig).not.toHaveBeenCalled()
    expect(ipc.verifyConfig).not.toHaveBeenCalled()

    // Un message d'explication accompagne l'étape ignorée.
    expect(config.note).toBeDefined()
    expect(config.note).toMatch(/non validé|manuel/i)
  })

  it("un profil sans flag _confirmed (undefined) est également ignoré", async () => {
    const ipc = makeSuccessIpc()
    const profileNoFlag: ConfigProfile = { configPath: '/x/y.ini', settings: DOLPHIN_SETTINGS }

    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST, profileNoFlag)

    const config = results.find((r) => r.label.includes('Configuration'))!
    expect(config.status).toBe('skipped')
    expect(ipc.applyConfig).not.toHaveBeenCalled()
  })

  it("le profil réel embarqué (dolphin.json) n'est pas confirmé → config ignorée", async () => {
    const ipc = makeSuccessIpc()
    // Pas de profil injecté → utilise le vrai profil chargé depuis dolphin.json.
    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST)

    const config = results.find((r) => r.label.includes('Configuration'))!
    expect(config.status).toBe('skipped')
    expect(config.status).not.toBe('success')
    expect(ipc.applyConfig).not.toHaveBeenCalled()
  })

  it("téléchargement + installation réussissent alors que la config est ignorée", async () => {
    const ipc = makeSuccessIpc()
    const results = await installEmulator('mock-serial', SIM_SOURCE, ipc, FAST, UNCONFIRMED_PROFILE)

    expect(results[0].status).toBe('success') // téléchargement
    expect(results[1].status).toBe('success') // installation
    expect(results[2].status).toBe('skipped') // configuration
  })
})
