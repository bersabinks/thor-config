import { describe, expect, it } from 'vitest'
import {
  fdroidApiUrl,
  fdroidApkUrl,
  isOfficialFdroidRepo,
  pickFdroidVersion,
  OFFICIAL_FDROID_REPO,
} from '../fdroid'
import sources from '../../../../src/modules/emulators/sources.json'

/** Réponse réelle de l'API F-Droid pour PPSSPP (relevée le 2026-09-16). */
const PPSSPP = {
  packageName: 'org.ppsspp.ppsspp',
  suggestedVersionCode: 119030000,
  packages: [
    { versionName: '1.19.3', versionCode: 119030000 },
    { versionName: '1.18.1', versionCode: 118010000 },
    { versionName: '1.17.1', versionCode: 117010000 },
  ],
}

describe('dépôt F-Droid', () => {
  it('reconnaît le dépôt officiel, barre d’éventuelles variantes', () => {
    expect(isOfficialFdroidRepo(OFFICIAL_FDROID_REPO)).toBe(true)
    expect(isOfficialFdroidRepo('https://f-droid.org/repo/')).toBe(true)
    expect(isOfficialFdroidRepo('https://fdroid.dolphin-emu.org/fdroid/repo')).toBe(false)
  })

  it('URL d’API et d’APK conformes au schéma vérifié sur PPSSPP', () => {
    expect(fdroidApiUrl('org.ppsspp.ppsspp')).toBe('https://f-droid.org/api/v1/packages/org.ppsspp.ppsspp')
    expect(fdroidApkUrl(OFFICIAL_FDROID_REPO, 'org.ppsspp.ppsspp', 119030000)).toBe(
      'https://f-droid.org/repo/org.ppsspp.ppsspp_119030000.apk'
    )
  })

  it('retient la version suggérée', () => {
    expect(pickFdroidVersion(PPSSPP)).toEqual({ versionName: '1.19.3', versionCode: 119030000 })
  })

  it('à défaut de version suggérée, le versionCode le plus élevé', () => {
    expect(pickFdroidVersion({ ...PPSSPP, suggestedVersionCode: 0 }).versionName).toBe('1.19.3')
  })

  it('aucune version publiée → erreur explicite', () => {
    expect(() => pickFdroidVersion({ ...PPSSPP, suggestedVersionCode: 0, packages: [] })).toThrow(/Aucune version/)
  })

  it('PPSSPP est bien déclaré sur le dépôt officiel dans sources.json', () => {
    const ppsspp = sources.find((s) => s.id === 'ppsspp')!
    expect(ppsspp.sourceType).toBe('fdroid')
    expect(isOfficialFdroidRepo(ppsspp.fdroidRepo!)).toBe(true)
  })
})
