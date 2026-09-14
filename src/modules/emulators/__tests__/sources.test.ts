import { describe, it, expect } from 'vitest'
import sourcesJson from '../sources.json'
import { MOCK_FIXTURES } from '../../../mocks/fixtures'
import type { EmulatorSource } from '../emulatorInstall'

/**
 * Verrouille les valeurs de sources.json issues de la vérification web du Prompt 3.
 * Objectif : empêcher qu'une correction (packageName, dépôt, sourceType) ne
 * disparaisse silencieusement lors d'une régénération/refactor du manifest.
 *
 * Régressions déjà observées et couvertes ici :
 *  - Azahar : org.azahar.android  → io.github.lime3ds.android
 *  - Cemu   : info.cemu.Cemu      → info.cemu.cemu (minuscules)
 *  - Cemu   : cemu-project/Cemu   → SSimco/Cemu (port Android)
 *  - Dolphin: release GitHub       → sourceType fdroid (aucune release GitHub)
 */

interface Expected {
  displayName: string
  sourceType: 'github' | 'fdroid'
  packageName: string
  githubRepo?: string
}

const EXPECTED: Record<string, Expected> = {
  'melonds-ds': {
    displayName: 'MelonDS Dual Screen',
    sourceType: 'github',
    githubRepo: 'rafaelvcaetano/melonDS-android',
    packageName: 'me.magnum.melonds',
  },
  azahar: {
    displayName: 'Azahar (3DS)',
    sourceType: 'github',
    githubRepo: 'azahar-emu/azahar',
    packageName: 'io.github.lime3ds.android',
  },
  dolphin: {
    displayName: 'Dolphin (dev build)',
    sourceType: 'fdroid',
    packageName: 'org.dolphinemu.dolphinemu',
  },
  cemu: {
    displayName: 'Cemu (Wii U)',
    sourceType: 'github',
    githubRepo: 'SSimco/Cemu',
    packageName: 'info.cemu.cemu',
  },
}

const entries = sourcesJson as EmulatorSource[]

describe('sources.json — valeurs vérifiées (Prompt 3)', () => {
  it('contient exactement les 4 émulateurs attendus', () => {
    expect(entries.map((s) => s.id).sort()).toEqual(['azahar', 'cemu', 'dolphin', 'melonds-ds'])
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
        it("n'a pas de fdroidRepo", () => {
          expect(src?.fdroidRepo).toBeUndefined()
        })
      }
    })
  }

  // ── Corrections spécifiques (anti-régression ciblée) ────────────────────────
  it('Azahar utilise le packageName Lime3DS, pas org.azahar.android', () => {
    const azahar = entries.find((s) => s.id === 'azahar')
    expect(azahar?.packageName).toBe('io.github.lime3ds.android')
    expect(azahar?.packageName).not.toBe('org.azahar.android')
  })

  it('Cemu utilise le packageName en minuscules, pas info.cemu.Cemu', () => {
    const cemu = entries.find((s) => s.id === 'cemu')
    expect(cemu?.packageName).toBe('info.cemu.cemu')
    expect(cemu?.packageName).not.toBe('info.cemu.Cemu')
  })

  it('Cemu pointe vers le port Android SSimco/Cemu, pas cemu-project/Cemu', () => {
    const cemu = entries.find((s) => s.id === 'cemu')
    expect(cemu?.githubRepo).toBe('SSimco/Cemu')
    expect(cemu?.githubRepo).not.toBe('cemu-project/Cemu')
  })

  it('Dolphin est en sourceType fdroid (aucune release GitHub)', () => {
    const dolphin = entries.find((s) => s.id === 'dolphin')
    expect(dolphin?.sourceType).toBe('fdroid')
    expect(dolphin?.githubRepo).toBeUndefined()
    expect(dolphin?.fdroidRepo).toBeDefined()
    expect(dolphin?.fdroidRepo).toContain('dolphin-emu')
  })

  // ── Cohérence avec le mock : sinon l'installation simulée échouerait ────────
  it('chaque packageName de sources.json est pré-peuplé dans MOCK_FIXTURES', () => {
    for (const src of entries) {
      expect(
        MOCK_FIXTURES.installedPackages[src.packageName],
        `packageName "${src.packageName}" (${src.id}) absent des fixtures du mock`
      ).toBeDefined()
    }
  })
})
