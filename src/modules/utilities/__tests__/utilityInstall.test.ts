import { describe, it, expect, vi } from 'vitest'
import { installUtility, type UtilityIpc, type UtilitySource } from '../utilityInstall'
import { run } from '../index'

function makeMockIpc(overrides: Partial<UtilityIpc> = {}): UtilityIpc {
  return {
    prepareApk: vi.fn().mockResolvedValue({
      localPath: '/mock/cache/apk/test/v1.0/test.apk',
      version: 'v1.0',
    }),
    installApk: vi.fn().mockResolvedValue(undefined),
    getPackageInfo: vi.fn().mockResolvedValue({ versionName: '1.0' }),
    shell: vi.fn().mockResolvedValue(''),
    ...overrides,
  }
}

describe('installUtility', () => {
  it('installe ClusterTune et active la tuile de volet rapide', async () => {
    const ipc = makeMockIpc()
    const source: UtilitySource = {
      id: 'clustertune',
      displayName: 'ClusterTune',
      sourceType: 'github',
      githubRepo: 'AurelioB/ClusterTune',
      assetPattern: '\\.apk$',
      packageName: 'com.aure.clustertune',
      tileService: 'com.aure.clustertune/.tile.ClusterTuneTileService',
    }

    const steps = await installUtility('device-001', source, ipc, { retryDelayMs: 0 })

    expect(ipc.prepareApk).toHaveBeenCalledWith('clustertune', 'AurelioB/ClusterTune', '\\.apk$')
    expect(ipc.installApk).toHaveBeenCalledWith('device-001', '/mock/cache/apk/test/v1.0/test.apk')
    expect(ipc.shell).toHaveBeenCalledWith(
      'device-001',
      'cmd statusbar add-tile com.aure.clustertune/.tile.ClusterTuneTileService'
    )

    expect(steps).toHaveLength(3)
    expect(steps.every((s) => s.status === 'success')).toBe(true)
    expect(steps[0].label).toContain('Téléchargement APK')
    expect(steps[1].label).toContain('Installation')
    expect(steps[2].label).toContain('Tuile paramètres rapides')
  })

  it('installe Final ROM et prépare le dossier de travail /sdcard/ROMs', async () => {
    const ipc = makeMockIpc()
    const source: UtilitySource = {
      id: 'finalrom',
      displayName: 'Final ROM',
      sourceType: 'github',
      githubRepo: 'Yasome/FinalRom',
      assetPattern: '\\.apk$',
      packageName: 'com.yasome.final_rom',
      targetDir: '/sdcard/ROMs',
    }

    const steps = await installUtility('device-001', source, ipc, { retryDelayMs: 0 })

    expect(ipc.prepareApk).toHaveBeenCalledWith('finalrom', 'Yasome/FinalRom', '\\.apk$')
    expect(ipc.installApk).toHaveBeenCalledWith('device-001', '/mock/cache/apk/test/v1.0/test.apk')
    expect(ipc.shell).toHaveBeenCalledWith('device-001', "mkdir -p '/sdcard/ROMs'")

    expect(steps).toHaveLength(3)
    expect(steps.every((s) => s.status === 'success')).toBe(true)
    expect(steps[2].label).toContain('Dossier de travail')
  })

  it('détecte ZArchiver comme déjà installé si présent sur la console', async () => {
    const ipc = makeMockIpc({
      getPackageInfo: vi.fn().mockResolvedValue({ versionName: '1.0.8' }),
    })
    const source: UtilitySource = {
      id: 'zarchiver',
      displayName: 'ZArchiver',
      sourceType: 'playstore',
      packageName: 'ru.zdevs.zarchiver',
    }

    const steps = await installUtility('device-001', source, ipc, { retryDelayMs: 0 })

    expect(ipc.prepareApk).not.toHaveBeenCalled()
    expect(ipc.installApk).not.toHaveBeenCalled()
    expect(steps).toHaveLength(1)
    expect(steps[0].status).toBe('success')
    expect(steps[0].label).toContain('Détection')
    expect(steps[0].note).toContain('Déjà installé')
  })

  it('marque ZArchiver comme ignoré (skipped) et ouvre le Play Store si absent', async () => {
    const ipc = makeMockIpc({
      getPackageInfo: vi.fn().mockResolvedValue(null),
    })
    const source: UtilitySource = {
      id: 'zarchiver',
      displayName: 'ZArchiver',
      sourceType: 'playstore',
      packageName: 'ru.zdevs.zarchiver',
    }

    const steps = await installUtility('device-001', source, ipc, { retryDelayMs: 0 })

    expect(ipc.shell).toHaveBeenCalledWith(
      'device-001',
      'am start -a android.intent.action.VIEW -d "market://details?id=ru.zdevs.zarchiver"'
    )
    expect(steps).toHaveLength(1)
    expect(steps[0].status).toBe('skipped')
    expect(steps[0].note).toContain('Play Store')
  })

  it('gère l échec de téléchargement proprement sans planter', async () => {
    const ipc = makeMockIpc({
      prepareApk: vi.fn().mockRejectedValue(new Error('GitHub 404')),
    })
    const source: UtilitySource = {
      id: 'clustertune',
      displayName: 'ClusterTune',
      sourceType: 'github',
      githubRepo: 'AurelioB/ClusterTune',
      packageName: 'com.aure.clustertune',
    }

    const steps = await installUtility('device-001', source, ipc, { retryDelayMs: 0, maxRetries: 1 })

    expect(steps).toHaveLength(2)
    expect(steps[0].status).toBe('failed_after_retries')
    expect(steps[1].status).toBe('failed_after_retries')
    expect(ipc.installApk).not.toHaveBeenCalled()
  })
})

describe('run (module utilities)', () => {
  it('exécute l ensemble des utilitaires du manifest', async () => {
    const ipc = makeMockIpc()
    const collectedSteps: any[] = []

    const result = await run({
      serial: 'device-001',
      onStep: (s) => collectedSteps.push(s),
      ipc,
      options: { retryDelayMs: 0 },
    })

    expect(result.moduleId).toBe('utilities')
    expect(result.steps.length).toBeGreaterThan(0)
    expect(collectedSteps.length).toBe(result.steps.length)
  })
})
