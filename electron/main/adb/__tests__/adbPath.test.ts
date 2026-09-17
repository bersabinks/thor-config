import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { adbCandidates, detectAdb, internalPlatformToolsDir, resolveAdbPath } from '../adbPath'

describe('détection d’adb', () => {
  it('le chemin personnalisé (settings) est prioritaire sur tout', () => {
    const env = { ADB_PATH: 'D:\\tools\\pt', PATH: 'C:\\bin' }
    const custom = 'E:\\custom\\adb.exe'
    expect(adbCandidates(env, 'win32', custom)[0]).toEqual({ path: custom, source: 'custom' })
    expect(resolveAdbPath(env, () => true, 'win32', custom)).toBe(custom)
  })

  it('le chemin personnalisé peut désigner un dossier', () => {
    const custom = 'E:\\custom\\dir'
    expect(adbCandidates({}, 'win32', custom)[0]).toEqual({
      path: join('E:\\custom\\dir', 'adb.exe'),
      source: 'custom',
    })
  })

  it('ADB_PATH (dossier) est pris en compte', () => {
    const env = { ADB_PATH: 'D:\\tools\\pt', PATH: 'C:\\bin', LOCALAPPDATA: 'C:\\Users\\t\\AppData\\Local' }
    expect(adbCandidates(env, 'win32')[0]).toEqual({ path: join('D:\\tools\\pt', 'adb.exe'), source: 'env' })
    expect(resolveAdbPath(env, () => true, 'win32')).toBe(join('D:\\tools\\pt', 'adb.exe'))
  })

  it('ADB_PATH peut désigner directement le binaire', () => {
    expect(adbCandidates({ ADB_PATH: 'D:\\adb.exe' }, 'win32')[0].path).toBe('D:\\adb.exe')
  })

  it('le binaire interne ThorConfig est cherché avant le PATH', () => {
    const env = { APPDATA: 'C:\\R', PATH: 'C:\\bin' }
    const internal = join('C:\\R', 'ThorConfig', 'platform-tools', 'adb.exe')
    expect(internalPlatformToolsDir(env, 'win32')).toBe(join('C:\\R', 'ThorConfig', 'platform-tools'))
    const candidates = adbCandidates(env, 'win32')
    const internalIdx = candidates.findIndex((c) => c.source === 'internal')
    const pathIdx = candidates.findIndex((c) => c.source === 'path')
    expect(internalIdx).toBeLessThan(pathIdx)
    expect(detectAdb(env, (p) => p === internal, 'win32')?.source).toBe('internal')
  })

  it('trouve adb dans le PATH (entrées entre guillemets comprises)', () => {
    const env = { PATH: 'C:\\Windows;"C:\\Program Files\\pt";C:\\other' }
    const target = join('C:\\Program Files\\pt', 'adb.exe')
    expect(detectAdb(env, (p) => p === target, 'win32')).toEqual({ path: target, source: 'path' })
  })

  it('détecte les packages WinGet avec glob', () => {
    const env = { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' }
    const readdir = (dir: string) => {
      if (dir === join('C:\\Users\\test\\AppData\\Local', 'Microsoft', 'WinGet', 'Packages')) {
        return ['Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe', 'Other.Package']
      }
      return []
    }
    const target = join(
      'C:\\Users\\test\\AppData\\Local',
      'Microsoft',
      'WinGet',
      'Packages',
      'Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe',
      'platform-tools',
      'adb.exe'
    )
    const result = detectAdb(env, (p) => p === target, 'win32', undefined, readdir)
    expect(result).toEqual({ path: target, source: 'winget' })
  })

  it('détecte Chocolatey et les installations manuelles classiques', () => {
    const chocoTarget = 'C:\\ProgramData\\chocolatey\\bin\\adb.exe'
    expect(detectAdb({}, (p) => p === chocoTarget, 'win32')).toEqual({
      path: chocoTarget,
      source: 'chocolatey',
    })

    const manualTarget = 'C:\\platform-tools\\adb.exe'
    expect(detectAdb({}, (p) => p === manualTarget, 'win32')).toEqual({
      path: manualTarget,
      source: 'manual',
    })

    const androidTarget = 'C:\\android\\platform-tools\\adb.exe'
    expect(detectAdb({}, (p) => p === androidTarget, 'win32')).toEqual({
      path: androidTarget,
      source: 'manual',
    })
  })

  it('trouve le SDK Android Studio par défaut sous LOCALAPPDATA', () => {
    const env = { LOCALAPPDATA: 'C:\\L' }
    const sdk = join('C:\\L', 'Android', 'Sdk', 'platform-tools', 'adb.exe')
    expect(detectAdb(env, (p) => p === sdk, 'win32')).toEqual({ path: sdk, source: 'sdk' })
  })

  it('rien de détecté : null, et « adb » comme dernier recours d’exécution', () => {
    expect(detectAdb({ ANDROID_HOME: 'C:\\sdk' }, () => false, 'win32')).toBeNull()
    expect(resolveAdbPath({ ANDROID_HOME: 'C:\\sdk' }, () => false, 'win32')).toBe('adb')
  })
})
