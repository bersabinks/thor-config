import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { adbCandidates, resolveAdbPath } from '../adbPath'

describe('resolveAdbPath', () => {
  it('ADB_PATH (dossier) est prioritaire', () => {
    const env = { ADB_PATH: 'D:\\tools\\pt', LOCALAPPDATA: 'C:\\Users\\t\\AppData\\Local' }
    const all = adbCandidates(env, 'win32')
    expect(all[0]).toBe(join('D:\\tools\\pt', 'adb.exe'))
    expect(resolveAdbPath(env, () => true, 'win32')).toBe(join('D:\\tools\\pt', 'adb.exe'))
  })

  it('ADB_PATH peut désigner directement le binaire', () => {
    expect(adbCandidates({ ADB_PATH: 'D:\\adb.exe' }, 'win32')[0]).toBe('D:\\adb.exe')
  })

  it('trouve le SDK Android Studio par défaut sous LOCALAPPDATA', () => {
    const env = { LOCALAPPDATA: 'C:\\L' }
    const sdk = join('C:\\L', 'Android', 'Sdk', 'platform-tools', 'adb.exe')
    expect(resolveAdbPath(env, (p) => p === sdk, 'win32')).toBe(sdk)
  })

  it('retombe sur « adb » (PATH) quand aucun candidat n’existe', () => {
    expect(resolveAdbPath({ ANDROID_HOME: 'C:\\sdk' }, () => false, 'win32')).toBe('adb')
  })
})
