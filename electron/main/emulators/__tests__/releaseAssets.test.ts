import { describe, expect, it } from 'vitest'
import { parseSha256, selectApkAsset, selectChecksumAsset, type ReleaseAsset } from '../releaseAssets'
import sources from '../../../../src/modules/emulators/sources.json'
import obtainium from '../../../../src/modules/emulators/obtainium.json'

const asset = (name: string): ReleaseAsset => ({ name, browser_download_url: `https://example.test/${name}` })

/** Assets réels relevés le 2026-09-15 (API GitHub). */
const OBTAINIUM_1_6_17 = [
  'app-arm64-v8a-fdroid-release.apk',
  'app-arm64-v8a-fdroid-release.apk.idsig',
  'app-arm64-v8a-fdroid-release.apk.sha256',
  'app-arm64-v8a-release.apk',
  'app-arm64-v8a-release.apk.idsig',
  'app-arm64-v8a-release.apk.sha256',
  'app-armeabi-v7a-release.apk',
  'app-fdroid-release.apk',
  'app-release.apk',
  'app-release.apk.sha256',
  'app-x86_64-release.apk',
].map(asset)

const HASH = 'ce1aa65430af809289f40459948388b1b072a2021bd82fceab1a6f4a90d0108d'

describe('sélection des assets de release', () => {
  it('Obtainium : l’APK arm64 non-F-Droid et son fichier .sha256', () => {
    const apk = selectApkAsset(OBTAINIUM_1_6_17, obtainium.assetPattern)
    expect(apk?.name).toBe('app-arm64-v8a-release.apk')
    expect(selectChecksumAsset(OBTAINIUM_1_6_17, apk!.name)?.name).toBe('app-arm64-v8a-release.apk.sha256')
  })

  it('WatermelonDS : seul l’APK stable est retenu, pas les Nightly/Hotfix/RC melonDualDS', () => {
    const pattern = sources.find((s) => s.id === 'watermelonds')!.assetPattern!
    const assets = ['Nightly-MelonDualDS-0.6.0.apk', 'Hotfix-2-MelonDualDS-0.7.0.rc3.apk', 'MelonDualDS-0.7.0.rc5.apk', 'WatermelonDS-0.7.0.apk'].map(asset)
    expect(selectApkAsset(assets, pattern)?.name).toBe('WatermelonDS-0.7.0.apk')
    expect(selectChecksumAsset(assets, 'WatermelonDS-0.7.0.apk')).toBeUndefined()
  })

  it('fichier de sommes générique toujours reconnu', () => {
    expect(selectChecksumAsset([asset('x.apk'), asset('SHA256SUMS.txt')], 'x.apk')?.name).toBe('SHA256SUMS.txt')
  })

  it('Azahar : un fichier .tar.xz.sha256sum n’est pas retenu comme checksum de l’APK', () => {
    const assets = [
      asset('azahar-android-vanilla-2126.1.1.apk'),
      asset('azahar-unified-source-2126.1.1.tar.xz.sha256sum'),
    ]
    expect(selectChecksumAsset(assets, 'azahar-android-vanilla-2126.1.1.apk')).toBeUndefined()
  })
})

describe('parseSha256', () => {
  it('format Obtainium : hash seul suivi d’un saut de ligne', () => {
    expect(parseSha256(`${HASH}\n`)).toBe(HASH)
    expect(parseSha256(HASH)).toBe(HASH)
  })

  it('fichier de sommes : ligne de l’APK visé', () => {
    const other = 'a'.repeat(64)
    expect(parseSha256(`${other}  autre.apk\n${HASH.toUpperCase()}  cible.apk\n`, 'cible.apk')).toBe(HASH)
  })

  it('aucune empreinte : undefined', () => {
    expect(parseSha256('pas de hash ici')).toBeUndefined()
  })
})
