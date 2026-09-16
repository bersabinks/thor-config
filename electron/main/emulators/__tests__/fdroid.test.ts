import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fdroidApiUrl,
  fdroidApkUrl,
  fdroidIndexUrl,
  isOfficialFdroidRepo,
  pickApkFromIndexV2,
  pickFdroidVersion,
  OFFICIAL_FDROID_REPO,
  type FdroidIndexV2,
} from '../fdroid'
import { fetchFdroidRelease } from '../source'
import sources from '../../../../src/modules/emulators/sources.json'

/** Réponse réelle de l'API F-Droid pour PPSSPP (relevée le 2026-09-16). */
const PPSSPP_API = {
  packageName: 'org.ppsspp.ppsspp',
  suggestedVersionCode: 119030000,
  packages: [
    { versionName: '1.19.3', versionCode: 119030000 },
    { versionName: '1.18.1', versionCode: 118010000 },
    { versionName: '1.17.1', versionCode: 117010000 },
  ],
}

const DOLPHIN_REPO = 'https://fdroid.dolphin-emu.org/fdroid/repo'
const DOLPHIN_SHA = 'a'.repeat(64)

/** Structure index-v2.json (champs relevés sur un dépôt F-Droid tiers réel). */
const DOLPHIN_INDEX: FdroidIndexV2 = {
  packages: {
    'org.dolphinemu.dolphinemu': {
      versions: {
        hash2: {
          added: 1780000000000,
          file: { name: '/org.dolphinemu.dolphinemu_2506.apk', sha256: DOLPHIN_SHA, size: 42_000_000 },
          manifest: { versionName: '2506', versionCode: 2506 },
        },
        hash1: {
          added: 1770000000000,
          file: { name: '/org.dolphinemu.dolphinemu_2412.apk', sha256: 'b'.repeat(64), size: 41_000_000 },
          manifest: { versionName: '2412', versionCode: 2412 },
        },
      },
    },
  },
}

function mockFetch(byUrl: Record<string, unknown>) {
  const spy = vi.fn(async (url: string) => {
    const body = byUrl[url]
    if (body === undefined) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('URL et sélection de version', () => {
  it('reconnaît le dépôt officiel, barre les dépôts tiers', () => {
    expect(isOfficialFdroidRepo(OFFICIAL_FDROID_REPO)).toBe(true)
    expect(isOfficialFdroidRepo('https://f-droid.org/repo/')).toBe(true)
    expect(isOfficialFdroidRepo(DOLPHIN_REPO)).toBe(false)
  })

  it('URL d’API, d’APK et d’index conformes aux schémas vérifiés', () => {
    expect(fdroidApiUrl('org.ppsspp.ppsspp')).toBe('https://f-droid.org/api/v1/packages/org.ppsspp.ppsspp')
    expect(fdroidApkUrl(OFFICIAL_FDROID_REPO, 'org.ppsspp.ppsspp', 119030000)).toBe(
      'https://f-droid.org/repo/org.ppsspp.ppsspp_119030000.apk'
    )
    expect(fdroidIndexUrl(DOLPHIN_REPO)).toBe(`${DOLPHIN_REPO}/index-v2.json`)
  })

  it('retient la version suggérée, sinon le plus grand versionCode', () => {
    expect(pickFdroidVersion(PPSSPP_API)).toEqual({ versionName: '1.19.3', versionCode: 119030000 })
    expect(pickFdroidVersion({ ...PPSSPP_API, suggestedVersionCode: 0 }).versionName).toBe('1.19.3')
  })

  it('aucune version publiée → erreur explicite', () => {
    expect(() => pickFdroidVersion({ ...PPSSPP_API, suggestedVersionCode: 0, packages: [] })).toThrow(/Aucune version/)
  })
})

describe('index-v2.json (dépôt tiers)', () => {
  it('extrait l’APK le plus récent, son URL absolue et son empreinte', () => {
    expect(pickApkFromIndexV2(DOLPHIN_INDEX, DOLPHIN_REPO, 'org.dolphinemu.dolphinemu')).toEqual({
      version: '2506',
      downloadUrl: `${DOLPHIN_REPO}/org.dolphinemu.dolphinemu_2506.apk`,
      sha256: DOLPHIN_SHA,
      size: 42_000_000,
    })
  })

  it('paquet absent de l’index → erreur nommant le dépôt', () => {
    expect(() => pickApkFromIndexV2(DOLPHIN_INDEX, DOLPHIN_REPO, 'org.inconnu')).toThrow(/absent de l'index/)
  })
})

describe('fetchFdroidRelease (API F-Droid mockée)', () => {
  it('dépôt officiel : URL de téléchargement construite depuis l’API (PPSSPP)', async () => {
    const spy = mockFetch({ [fdroidApiUrl('org.ppsspp.ppsspp')]: PPSSPP_API })
    const release = await fetchFdroidRelease(OFFICIAL_FDROID_REPO, 'org.ppsspp.ppsspp')

    expect(release).toEqual({
      version: '1.19.3',
      downloadUrl: 'https://f-droid.org/repo/org.ppsspp.ppsspp_119030000.apk',
    })
    expect(spy).toHaveBeenCalledWith(fdroidApiUrl('org.ppsspp.ppsspp'), expect.anything())
  })

  it('dépôt tiers : URL et SHA-256 extraits de index-v2.json (Dolphin)', async () => {
    mockFetch({ [fdroidIndexUrl(DOLPHIN_REPO)]: DOLPHIN_INDEX })
    const release = await fetchFdroidRelease(DOLPHIN_REPO, 'org.dolphinemu.dolphinemu')

    expect(release).toEqual({
      version: '2506',
      downloadUrl: `${DOLPHIN_REPO}/org.dolphinemu.dolphinemu_2506.apk`,
      sha256: DOLPHIN_SHA,
    })
  })

  it('dépôt injoignable (403 constaté sur celui de Dolphin) → erreur lisible', async () => {
    mockFetch({})
    await expect(fetchFdroidRelease(DOLPHIN_REPO, 'org.dolphinemu.dolphinemu')).rejects.toThrow(
      /Dépôt F-Droid injoignable \(HTTP 404\)/
    )
  })

  it('fdroidRepo manquant → erreur explicite', async () => {
    await expect(fetchFdroidRelease('', 'org.x')).rejects.toThrow(/fdroidRepo manquant/)
  })
})

describe('sources.json', () => {
  it('Dolphin et PPSSPP passent tous deux par le téléchargeur F-Droid', () => {
    const fdroid = sources.filter((s) => s.sourceType === 'fdroid')
    expect(fdroid.map((s) => s.id).sort()).toEqual(['dolphin', 'ppsspp'])
    expect(isOfficialFdroidRepo(fdroid.find((s) => s.id === 'ppsspp')!.fdroidRepo!)).toBe(true)
    expect(isOfficialFdroidRepo(fdroid.find((s) => s.id === 'dolphin')!.fdroidRepo!)).toBe(false)
  })
})
