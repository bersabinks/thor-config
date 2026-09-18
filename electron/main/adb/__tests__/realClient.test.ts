import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('child_process', () => ({ execFile: vi.fn() }))

import { execFile } from 'child_process'
import { ADB_TIMEOUTS, RealAdbClient } from '../realClient'
import { AdbError } from '../errors'

interface Reply {
  error?: { code?: string | number | null; killed?: boolean; signal?: string; message?: string }
  stdout?: string
  stderr?: string
}

type ExecCall = [string, string[], { timeout: number; windowsHide: boolean }]

const execMock = execFile as unknown as ReturnType<typeof vi.fn>

/** Simule le binaire adb : la fonction reçoit les arguments et décrit la sortie. */
function adbReplies(fn: (args: string[]) => Reply) {
  execMock.mockImplementation(
    (_bin: string, args: string[], _opts: unknown, cb: (e: unknown, out: string, err: string) => void) => {
      const r = fn(args)
      const error = r.error ? Object.assign(new Error(r.error.message ?? 'Command failed'), r.error) : null
      cb(error, r.stdout ?? '', r.stderr ?? '')
    }
  )
}

async function rejection(p: Promise<unknown>): Promise<AdbError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e
  )
  expect(err).toBeInstanceOf(AdbError)
  return err as AdbError
}

const client = new RealAdbClient('adb-test')

// Accolades obligatoires : une fonction renvoyée par beforeEach est appelée comme hook de nettoyage.
beforeEach(() => {
  execMock.mockReset()
})

describe('RealAdbClient — exécution', () => {
  it('shell : arguments, délai et fenêtre masquée', async () => {
    adbReplies(() => ({ stdout: '2\r\n' }))
    await expect(client.shell('SER', 'settings get secure navigation_mode')).resolves.toBe('2')
    const [bin, args, opts] = execMock.mock.calls[0] as ExecCall
    expect(bin).toBe('adb-test')
    expect(args).toEqual(['-s', 'SER', 'shell', 'settings get secure navigation_mode'])
    expect(opts.timeout).toBe(ADB_TIMEOUTS.shell)
    expect(opts.windowsHide).toBe(true)
  })

  it('les transferts ont un délai adapté aux gros fichiers', async () => {
    adbReplies(() => ({ stdout: '1 file pushed' }))
    await client.pushFile('SER', 'C:\\roms\\a.iso', '/sdcard/ROMs/a.iso')
    expect((execMock.mock.calls[0] as ExecCall)[2].timeout).toBe(ADB_TIMEOUTS.transfer)
  })

  it('listDevices gère les fins de ligne Windows', async () => {
    adbReplies(() => ({
      stdout:
        'List of devices attached\r\nR5CT1\tdevice usb:1-1 product:thor model:AYN_Thor_Max device:thor\r\nR5CT2\tunauthorized usb:1-2\r\n',
    }))
    await expect(client.listDevices()).resolves.toEqual([
      { serial: 'R5CT1', model: 'AYN Thor Max', state: 'device' },
      { serial: 'R5CT2', model: 'Unknown', state: 'unauthorized' },
    ])
  })

  it('listDevices parse correctement la sortie réelle avec padding d’espaces et logs du daemon', async () => {
    adbReplies(() => ({
      stdout:
        '* daemon not running; starting now at tcp:5037\r\n' +
        '* daemon started successfully\r\n' +
        'List of devices attached\r\n' +
        'c35b322a              device product:odin2 model:AYN_Thor device:odin2 transport_id:1\r\n',
    }))
    await expect(client.listDevices()).resolves.toEqual([
      { serial: 'c35b322a', model: 'AYN Thor', state: 'device' },
    ])
  })
})

describe('RealAdbClient — erreurs normalisées', () => {
  it('adb absent → ADB_NOT_FOUND, non retentable', async () => {
    adbReplies(() => ({ error: { code: 'ENOENT', message: 'spawn adb-test ENOENT' } }))
    const err = await rejection(client.listDevices())
    expect(err.code).toBe('ADB_NOT_FOUND')
    expect(err.retryable).toBe(false)
  })

  it('processus tué par le délai → TIMEOUT', async () => {
    adbReplies(() => ({ error: { killed: true, signal: 'SIGTERM', code: null } }))
    const err = await rejection(client.shell('SER', 'uiautomator dump /sdcard/window_dump.xml'))
    expect(err.code).toBe('TIMEOUT')
    expect(err.message).toContain(`${ADB_TIMEOUTS.shell / 1000} s`)
  })

  it('console débranchée en cours d’opération → DEVICE_DISCONNECTED', async () => {
    adbReplies(() => ({ error: { code: 1 }, stderr: "adb: device 'SER' not found" }))
    expect((await rejection(client.installApk('SER', 'x.apk'))).code).toBe('DEVICE_DISCONNECTED')
  })

  it('permission refusée par Android → PERMISSION_DENIED', async () => {
    adbReplies(() => ({
      error: { code: 1 },
      stderr: "adb: error: failed to copy 'a' to '/sdcard/Android/data/p/a': remote couldn't create file: Permission denied",
    }))
    expect((await rejection(client.pushFile('SER', 'a', '/sdcard/Android/data/p/a'))).code).toBe('PERMISSION_DENIED')
  })

  it('waitForDevice utilise le délai demandé', async () => {
    adbReplies(() => ({ error: { killed: true, signal: 'SIGTERM', code: null } }))
    const err = await rejection(client.waitForDevice('SER', 5000))
    expect(err.code).toBe('TIMEOUT')
    expect((execMock.mock.calls[0] as ExecCall)[2].timeout).toBe(5000)
  })
})

describe('RealAdbClient.getPackageInfo', () => {
  it('lit la version', async () => {
    adbReplies(() => ({ stdout: 'Packages:\n  Package [org.azahar_emu.azahar] (abc):\n    versionCode=2120 minSdk=29\n    versionName=2121.2' }))
    await expect(client.getPackageInfo('SER', 'org.azahar_emu.azahar')).resolves.toEqual({
      packageName: 'org.azahar_emu.azahar',
      versionName: '2121.2',
      versionCode: 2120,
    })
  })

  it('commande en échec → paquet absent (null)', async () => {
    adbReplies(() => ({ error: { code: 1 }, stderr: '' }))
    await expect(client.getPackageInfo('SER', 'x')).resolves.toBeNull()
  })

  it('console injoignable → l’erreur remonte (pas un faux « non installé »)', async () => {
    adbReplies(() => ({ error: { code: 1 }, stderr: 'adb: device offline' }))
    expect((await rejection(client.getPackageInfo('SER', 'x'))).code).toBe('DEVICE_OFFLINE')
  })
})
