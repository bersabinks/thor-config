import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { adbCandidates, detectAdb, internalPlatformToolsDir, resolveAdbPath } from '../adbPath'

describe('détection d’adb', () => {
  it('ADB_PATH (dossier) est prioritaire', () => {
    const env = { ADB_PATH: 'D:\\tools\\pt', PATH: 'C:\\bin', LOCALAPPDATA: 'C:\\Users\\t\\AppData\\Local' }
    expect(adbCandidates(env, 'win32')[0]).toEqual({ path: join('D:\\tools\\pt', 'adb.exe'), source: 'env' })
    expect(resolveAdbPath(env, () => true, 'win32')).toBe(join('D:\\tools\\pt', 'adb.exe'))
  })

  it('ADB_PATH peut désigner directement le binaire', () => {
    expect(adbCandidates({ ADB_PATH: 'D:\\adb.exe' }, 'win32')[0].path).toBe('D:\\adb.exe')
  })

  it('trouve adb dans le PATH (entrées entre guillemets comprises)', () => {
    const env = { PATH: 'C:\\Windows;"C:\\Program Files\\pt";C:\\other' }
    const target = join('C:\\Program Files\\pt', 'adb.exe')
    expect(detectAdb(env, (p) => p === target, 'win32')).toEqual({ path: target, source: 'path' })
  })

  it('trouve le SDK Android Studio par défaut sous LOCALAPPDATA', () => {
    const env = { LOCALAPPDATA: 'C:\\L' }
    const sdk = join('C:\\L', 'Android', 'Sdk', 'platform-tools', 'adb.exe')
    expect(detectAdb(env, (p) => p === sdk, 'win32')).toEqual({ path: sdk, source: 'sdk' })
  })

  it('la copie téléchargée par ThorConfig vient en dernier', () => {
    const env = { APPDATA: 'C:\\R', PATH: 'C:\\bin' }
    const internal = join('C:\\R', 'ThorConfig', 'platform-tools', 'adb.exe')
    expect(internalPlatformToolsDir(env, 'win32')).toBe(join('C:\\R', 'ThorConfig', 'platform-tools'))
    expect(adbCandidates(env, 'win32').at(-1)).toEqual({ path: internal, source: 'internal' })
    expect(detectAdb(env, (p) => p === internal, 'win32')?.source).toBe('internal')
  })

  it('rien de détecté : null, et « adb » comme dernier recours d’exécution', () => {
    expect(detectAdb({ ANDROID_HOME: 'C:\\sdk' }, () => false, 'win32')).toBeNull()
    expect(resolveAdbPath({ ANDROID_HOME: 'C:\\sdk' }, () => false, 'win32')).toBe('adb')
  })
})
