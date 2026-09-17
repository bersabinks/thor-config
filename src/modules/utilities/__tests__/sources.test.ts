import { describe, it, expect } from 'vitest'
import sourcesJson from '../sources.json'
import { MOCK_FIXTURES } from '../../../mocks/fixtures'
import { UTILITY_GUIDES } from '../../orchestrator/emulatorGuide'
import type { UtilitySource } from '../utilityInstall'

interface ExpectedUtility {
  displayName: string
  sourceType: 'github' | 'playstore'
  packageName: string
  githubRepo?: string
  tileService?: string
  targetDir?: string
  playStoreUrl?: string
}

const EXPECTED: Record<string, ExpectedUtility> = {
  clustertune: {
    displayName: 'ClusterTune',
    sourceType: 'github',
    githubRepo: 'AurelioB/ClusterTune',
    packageName: 'com.aure.clustertune',
    tileService: 'com.aure.clustertune/.tile.ClusterTuneTileService',
  },
  finalrom: {
    displayName: 'Final ROM',
    sourceType: 'github',
    githubRepo: 'Yasome/FinalRom',
    packageName: 'com.yasome.final_rom',
    targetDir: '/sdcard/ROMs',
  },
  zarchiver: {
    displayName: 'ZArchiver',
    sourceType: 'playstore',
    packageName: 'ru.zdevs.zarchiver',
  },
  gamehub: {
    displayName: 'GameHub (Jeux Steam)',
    sourceType: 'playstore',
    packageName: 'com.xiaoji.egggame',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.xiaoji.egggame',
  },
}

const entries = sourcesJson as UtilitySource[]

describe('utilities/sources.json — validation du manifest', () => {
  it('contient exactement les 4 utilitaires attendus', () => {
    expect(entries.map((s) => s.id).sort()).toEqual([
      'clustertune',
      'finalrom',
      'gamehub',
      'zarchiver',
    ])
  })

  for (const [id, exp] of Object.entries(EXPECTED)) {
    describe(id, () => {
      const src = entries.find((s) => s.id === id)

      it('existe dans le manifest', () => {
        expect(src).toBeDefined()
      })

      it(`displayName = "${exp.displayName}"`, () => {
        expect(src?.displayName).toBe(exp.displayName)
      })

      it(`sourceType = "${exp.sourceType}"`, () => {
        expect(src?.sourceType).toBe(exp.sourceType)
      })

      it(`packageName = "${exp.packageName}"`, () => {
        expect(src?.packageName).toBe(exp.packageName)
      })

      if (exp.sourceType === 'github') {
        it(`githubRepo = "${exp.githubRepo}"`, () => {
          expect(src?.githubRepo).toBe(exp.githubRepo)
        })
        it('a un assetPattern regex compilable', () => {
          expect(src?.assetPattern).toBeTruthy()
          expect(() => new RegExp(src!.assetPattern!)).not.toThrow()
        })
      }

      if (exp.tileService) {
        it('a le tileService défini', () => {
          expect(src?.tileService).toBe(exp.tileService)
        })
      }

      if (exp.targetDir) {
        it('a le targetDir défini', () => {
          expect(src?.targetDir).toBe(exp.targetDir)
        })
      }

      if (exp.playStoreUrl) {
        // Même contrat que DuckStation côté émulateurs : l'URL alimente le
        // message de l'étape ignorée, elle doit pointer sur le bon package.
        it('a une playStoreUrl cohérente avec le packageName', () => {
          expect(src?.playStoreUrl).toBe(exp.playStoreUrl)
          expect(src?.playStoreUrl).toContain(exp.packageName)
        })
      }
    })
  }

  it('chaque packageName de sources.json est présent dans MOCK_FIXTURES', () => {
    for (const src of entries) {
      expect(
        MOCK_FIXTURES.installedPackages[src.packageName],
        `packageName "${src.packageName}" (${src.id}) absent des fixtures du mock`
      ).toBeDefined()
    }
  })
})

describe('UTILITY_GUIDES — couplage à sources.json et contenu', () => {
  it('chaque guide correspond à un utilitaire existant de sources.json', () => {
    for (const guide of UTILITY_GUIDES) {
      const src = entries.find((s) => s.id === guide.id)
      expect(src, `guide "${guide.id}" sans entrée correspondante dans sources.json`).toBeDefined()
      // FinalReport associe un guide à ses étapes via « <displayName> — … » :
      // toute divergence de displayName ferait disparaître le guide du rapport.
      expect(guide.displayName).toBe(src?.displayName)
    }
  })

  it('chaque guide a un displayName non vide et au moins un réglage', () => {
    for (const guide of UTILITY_GUIDES) {
      expect(guide.displayName.length, guide.id).toBeGreaterThan(0)
      expect(guide.settings.length, guide.id).toBeGreaterThan(0)
    }
  })

  it('chaque guide a une intro non vide et des réglages complets (path + value)', () => {
    for (const guide of UTILITY_GUIDES) {
      expect(guide.intro.length, guide.id).toBeGreaterThan(0)
      for (const s of guide.settings) {
        expect(s.path, guide.id).toBeTruthy()
        expect(s.value, guide.id).toBeTruthy()
      }
    }
  })

  describe('GameHub', () => {
    const guide = UTILITY_GUIDES.find((g) => g.id === 'gamehub')

    it('a une fiche de guide', () => {
      expect(guide).toBeDefined()
    })

    it('renvoie vers l’APK officiel quand le Play Store ne trouve pas l’app', () => {
      expect(guide?.intro).toContain('gamehub.xiaoji.com')
    })

    it('impose la connexion Steam par QR code (jamais d’identifiants en clair)', () => {
      expect(guide?.intro).toContain('QR code')
    })

    it('documente pilote GPU, résolution, compatibilité, stockage et alternative', () => {
      const paths = guide?.settings.map((s) => s.path) ?? []
      expect(paths).toEqual([
        'Stockage',
        'Résolution',
        'Compatibilité',
        'Pilote GPU',
        'Réglages console',
        'Alternative',
      ])
      const byPath = Object.fromEntries((guide?.settings ?? []).map((s) => [s.path, s.value]))
      expect(byPath['Pilote GPU']).toContain('Turnip 26.0.0 R2')
      expect(byPath['Résolution']).toContain('1280x720')
      expect(byPath['Compatibilité']).toContain('Proton 10.0 arm64x2')
      expect(byPath['Alternative']).toContain('Moonlight')
    })
  })
})
