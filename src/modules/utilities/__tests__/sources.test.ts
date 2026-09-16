import { describe, it, expect } from 'vitest'
import sourcesJson from '../sources.json'
import { MOCK_FIXTURES } from '../../../mocks/fixtures'
import type { UtilitySource } from '../utilityInstall'

interface ExpectedUtility {
  displayName: string
  sourceType: 'github' | 'playstore'
  packageName: string
  githubRepo?: string
  tileService?: string
  targetDir?: string
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
}

const entries = sourcesJson as UtilitySource[]

describe('utilities/sources.json — validation du manifest', () => {
  it('contient exactement les 3 utilitaires attendus', () => {
    expect(entries.map((s) => s.id).sort()).toEqual(['clustertune', 'finalrom', 'zarchiver'])
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
