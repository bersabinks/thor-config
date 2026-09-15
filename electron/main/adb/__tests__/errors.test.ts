import { describe, it, expect } from 'vitest'
import {
  AdbError,
  classifyAdbFailure,
  describeError,
  isRetryableError,
  parseAdbErrorCode,
  type AdbErrorCode,
  type ExecFailure,
} from '../errors'

/** Sorties réelles d'adb (platform-tools 35) pour chaque situation. */
const CASES: Array<[string, ExecFailure, AdbErrorCode]> = [
  ['binaire adb absent', { code: 'ENOENT', message: 'spawn adb ENOENT' }, 'ADB_NOT_FOUND'],
  ['délai dépassé (processus tué)', { killed: true, signal: 'SIGTERM', code: null }, 'TIMEOUT'],
  ['console débranchée (serial inconnu)', { code: 1, stderr: "adb: device 'R5CT1234' not found" }, 'DEVICE_DISCONNECTED'],
  ['aucun appareil', { code: 1, stderr: 'adb: no devices/emulators found' }, 'DEVICE_DISCONNECTED'],
  ['débranchée pendant un transfert', { code: 1, stderr: 'adb: error: closed' }, 'DEVICE_DISCONNECTED'],
  ['hors ligne', { code: 1, stderr: 'adb: device offline' }, 'DEVICE_OFFLINE'],
  [
    'non autorisée',
    { code: 1, stderr: "adb: device unauthorized.\nThis adb server's $ADB_VENDOR_KEYS is not set" },
    'DEVICE_UNAUTHORIZED',
  ],
  [
    'push vers Android/data',
    {
      code: 1,
      stderr: "adb: error: failed to copy 'a.ini' to '/sdcard/Android/data/x/a.ini': remote couldn't create file: Permission denied",
    },
    'PERMISSION_DENIED',
  ],
  ['shell refusé', { code: 1, stderr: 'ls: /data/data: Permission denied' }, 'PERMISSION_DENIED'],
  ['SecurityException', { code: 255, stdout: 'Exception occurred: java.lang.SecurityException: Shell cannot change component state' }, 'PERMISSION_DENIED'],
  ['commande en échec générique', { code: 1, stderr: '', message: 'Command failed: adb shell false' }, 'COMMAND_FAILED'],
]

describe('classifyAdbFailure', () => {
  it.each(CASES)('%s → code attendu', (_name, failure, code) => {
    expect(classifyAdbFailure(failure).code).toBe(code)
  })

  it('un dépassement de maxBuffer n’est pas pris pour un timeout', () => {
    const err = classifyAdbFailure({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', killed: true, signal: 'SIGTERM' })
    expect(err.code).toBe('COMMAND_FAILED')
  })

  it('ne classe pas d’après le texte de la commande recopié dans message', () => {
    const err = classifyAdbFailure({ code: 1, stdout: 'rien', message: "Command failed: adb shell grep 'Permission denied' log" })
    expect(err.code).toBe('COMMAND_FAILED')
  })

  it('mentionne la durée du timeout et conserve la sortie brute en détail', () => {
    const err = classifyAdbFailure({ killed: true, signal: 'SIGTERM', stderr: 'partial' }, 60_000)
    expect(err.message).toContain('60 s')
    expect(err.detail).toBe('partial')
  })

  it('tronque un détail très long sur une seule ligne', () => {
    const err = classifyAdbFailure({ code: 1, stderr: 'x\n'.repeat(1000) })
    expect(err.detail.length).toBeLessThanOrEqual(301)
    expect(err.detail).not.toContain('\n')
  })
})

describe('AdbError à travers l’IPC Electron', () => {
  // Electron ne transmet que le message, préfixé ainsi côté renderer.
  const overIpc = (e: AdbError) => new Error(`Error invoking remote method 'adb:shell': ${String(e)}`)

  it('le code est relu depuis le message sérialisé', () => {
    const err = overIpc(new AdbError('DEVICE_DISCONNECTED', "device 'x' not found"))
    expect(parseAdbErrorCode(err)).toBe('DEVICE_DISCONNECTED')
    expect(isRetryableError(err)).toBe(true)
  })

  it('describeError retire préfixe IPC et tag technique', () => {
    const err = overIpc(new AdbError('PERMISSION_DENIED'))
    const msg = describeError(err)
    expect(msg).toMatch(/^Permission refusée/)
    expect(msg).not.toMatch(/Error invoking|AdbError|\[ADB:/)
  })

  it('les erreurs non récupérables sont signalées comme telles', () => {
    for (const code of ['ADB_NOT_FOUND', 'DEVICE_UNAUTHORIZED', 'PERMISSION_DENIED'] as const) {
      expect(isRetryableError(overIpc(new AdbError(code)))).toBe(false)
    }
    for (const code of ['DEVICE_DISCONNECTED', 'DEVICE_OFFLINE', 'TIMEOUT', 'COMMAND_FAILED'] as const) {
      expect(isRetryableError(new AdbError(code))).toBe(true)
    }
  })

  it('une erreur non ADB reste retentable et son message inchangé', () => {
    const err = new Error('Error: Failed to set default home.')
    expect(parseAdbErrorCode(err)).toBeNull()
    expect(isRetryableError(err)).toBe(true)
    expect(describeError(err)).toBe('Error: Failed to set default home.')
    expect(describeError('texte brut')).toBe('texte brut')
  })
})
