import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { MockAdbClient, MOCK_SERIAL } from '../mockClient'
import { AdbError } from '../errors'
import sources from '../../../../src/modules/emulators/sources.json'
import { configureLauncher, LAUNCHER_CONFIG } from '../../../../src/modules/launcher/launcherProcess'

const S = MOCK_SERIAL

function fresh(scenario: 'fresh' | 'configured' = 'fresh') {
  return new MockAdbClient({ scenario, latency: 'none', quiet: true })
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e
  )
  expect(err).toBeInstanceOf(AdbError)
  return (err as AdbError).code
}

let tmp: string | null = null
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  tmp = null
})

describe('MockAdbClient — console à état', () => {
  it('scénario fresh : navigation 3 boutons, aucun émulateur ni ROM', async () => {
    const c = fresh()
    await expect(c.shell(S, 'settings get secure navigation_mode')).resolves.toBe('0')
    for (const s of sources) await expect(c.getPackageInfo(S, s.packageName)).resolves.toBeNull()
    await expect(c.shell(S, "find '/sdcard/ROMs' -type f 2>/dev/null | wc -l")).resolves.toBe('0\n')
  })

  it('scénario configured : émulateurs installés et ROMs déjà poussées', async () => {
    const c = fresh('configured')
    await expect(c.shell(S, 'settings get secure navigation_mode')).resolves.toBe('2')
    for (const s of sources) await expect(c.getPackageInfo(S, s.packageName)).resolves.not.toBeNull()
    await expect(c.shell(S, "find '/sdcard/ROMs' -type f 2>/dev/null | wc -l")).resolves.toBe('3\n')
  })

  it('settings put modifie la valeur relue', async () => {
    const c = fresh()
    await c.shell(S, 'settings put secure navigation_mode 2')
    await expect(c.shell(S, 'settings get secure navigation_mode')).resolves.toBe('2')
  })

  it('installApk (chemin du cache) rend le paquet visible', async () => {
    const c = fresh()
    await c.installApk(S, '/mock/cache/apk/azahar/sim-1.0/azahar.apk')
    await expect(c.getPackageInfo(S, 'org.azahar_emu.azahar')).resolves.toMatchObject({ versionName: 'sim-1.0' })
    await expect(c.shell(S, 'pm list packages azahar')).resolves.toBe('package:org.azahar_emu.azahar')
    expect(await codeOf(c.installApk(S, '/tmp/inconnu.apk'))).toBe('COMMAND_FAILED')
  })

  it('grep sans résultat échoue comme sur la vraie console, sauf `|| true`', async () => {
    const c = fresh()
    expect(await codeOf(c.shell(S, 'pm list packages | grep dolphin'))).toBe('COMMAND_FAILED')
    await expect(c.shell(S, 'pm list packages | grep dolphin || true')).resolves.toBe('')
    await expect(c.shell(S, 'pm list packages | grep ayn')).resolves.toBe('package:com.ayn.settings')
  })

  it('push puis sha256sum / cat / wc / find restent cohérents', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'thor-mock-'))
    const local = join(tmp, 'FFX.m3u')
    writeFileSync(local, 'Disc 1.chd\nDisc 2.chd\n')
    const sha = createHash('sha256').update('Disc 1.chd\nDisc 2.chd\n').digest('hex')
    const c = fresh()

    await c.shell(S, "mkdir -p '/sdcard/ROMs/ps2'")
    await c.pushFile(S, local, '/sdcard/ROMs/ps2/FFX.m3u')
    await expect(c.shell(S, "sha256sum '/sdcard/ROMs/ps2/FFX.m3u'")).resolves.toBe(`${sha}  /sdcard/ROMs/ps2/FFX.m3u`)
    await expect(c.shell(S, "cat '/sdcard/ROMs/ps2/FFX.m3u'")).resolves.toContain('Disc 2.chd')
    await expect(c.shell(S, "wc -c < '/sdcard/ROMs/ps2/FFX.m3u'")).resolves.toBe('22')
    await expect(c.shell(S, "find '/sdcard/ROMs' -type f 2>/dev/null")).resolves.toBe('/sdcard/ROMs/ps2/FFX.m3u')
    expect(await codeOf(c.shell(S, "sha256sum '/sdcard/ROMs/absent.iso'"))).toBe('COMMAND_FAILED')
  })

  it('Android/data est refusé (constaté sur la console du testeur)', async () => {
    const c = fresh()
    expect(await codeOf(c.pushFile(S, 'x.ini', '/sdcard/Android/data/org.azahar_emu.azahar/files/config.ini'))).toBe(
      'PERMISSION_DENIED'
    )
    expect(await codeOf(c.shell(S, "mkdir -p '/sdcard/Android/data/x'"))).toBe('PERMISSION_DENIED')
  })

  it('les commandes Launcher suivent l’état (module Prompt 7 réel)', async () => {
    const c = fresh()
    const steps = await configureLauncher(S, { shell: (s, cmd) => c.shell(s, cmd) }, { retryDelayMs: 0, maxRetries: 0 })
    const status = (label: string) => steps.find((s) => s.label.includes(label))?.status
    expect(status('Présence du launcher')).toBe('success')
    expect(status('Définition comme Home')).toBe('success')
    expect(status('Launcher actif')).toBe('success')
    expect(c.device.home).toBe(LAUNCHER_CONFIG.packageName)
  })
})

describe('MockAdbClient — pannes et connexion', () => {
  it('une panne injectée ne touche que les appels ciblés, le nombre de fois demandé', async () => {
    const c = fresh()
    c.injectFault({ code: 'TIMEOUT', match: 'settings get', times: 1 })
    await expect(c.shell(S, 'getprop ro.product.model')).resolves.toBe('AYN Thor Max')
    expect(await codeOf(c.shell(S, 'settings get secure navigation_mode'))).toBe('TIMEOUT')
    await expect(c.shell(S, 'settings get secure navigation_mode')).resolves.toBe('0')
  })

  it('console débranchée : plus listée, commandes en DEVICE_DISCONNECTED', async () => {
    const c = fresh()
    c.setConnectionState('disconnected')
    await expect(c.listDevices()).resolves.toEqual([])
    expect(await codeOf(c.shell(S, 'getprop'))).toBe('DEVICE_DISCONNECTED')
    c.setConnectionState('device')
    await expect(c.listDevices()).resolves.toHaveLength(1)
  })

  it('console non autorisée : listée « unauthorized », commandes refusées', async () => {
    const c = fresh()
    c.setConnectionState('unauthorized')
    await expect(c.listDevices()).resolves.toMatchObject([{ state: 'unauthorized' }])
    expect(await codeOf(c.getPackageInfo(S, 'x'))).toBe('DEVICE_UNAUTHORIZED')
  })

  it('waitForDevice attend le retour de la console, sinon TIMEOUT', async () => {
    const c = fresh()
    c.setConnectionState('disconnected')
    setTimeout(() => c.setConnectionState('device'), 100)
    await expect(c.waitForDevice(S, 5000)).resolves.toBeUndefined()

    c.setConnectionState('disconnected')
    expect(await codeOf(c.waitForDevice(S, 300))).toBe('TIMEOUT')
  })
})
