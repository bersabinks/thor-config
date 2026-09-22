import { describe, it, expect } from 'vitest'
import sourcesJson from '../sources.json'
import obtainiumJson from '../obtainium.json'
import { MOCK_FIXTURES } from '../../../mocks/fixtures'
import type { EmulatorSource } from '../emulatorInstall'

/**
 * Verrouille les valeurs de sources.json issues des vérifications web.
 * Objectif : empêcher qu'une correction (packageName, dépôt, sourceType) ne
 * disparaisse silencieusement lors d'une régénération/refactor du manifest.
 *
 * Régressions déjà observées et couvertes ici :
 *  - Azahar : org.azahar.android / io.github.lime3ds.android → org.azahar_emu.azahar
 *             (packageName relevé par ADB sur la console du testeur)
 *  - Cemu   : info.cemu.Cemu      → info.cemu.cemu (minuscules)
 *  - Cemu   : cemu-project/Cemu   → SSimco/Cemu (port Android)
 *  - Dolphin: release GitHub       → sourceType fdroid (aucune release GitHub)
 *  - DS     : rafaelvcaetano/melonDS-android (me.magnum.melonds) → WatermelonDS,
 *             nouveau nom de melonDualDS depuis 0.7.0. applicationId relevé dans le
 *             manifeste de WatermelonDS-0.7.0.apk : me.magnum.melondualds (2026-09-15).
 *  - « Eden DS » (JoeCorrell/Eden-DS) est un fork de l'émulateur Switch Eden
 *             (DS = dual screen), pas un émulateur Nintendo DS : non intégré.
 */

interface Expected {
  displayName: string
  sourceType: 'github' | 'fdroid' | 'playstore'
  packageName: string
  githubRepo?: string
}

const EXPECTED: Record<string, Expected> = {
  watermelonds: {
    displayName: 'WatermelonDS (DS — Dual Screen)',
    sourceType: 'github',
    githubRepo: 'SapphireRhodonite/WatermelonDS',
    packageName: 'me.magnum.melondualds',
  },
  azahar: {
    displayName: 'Azahar (3DS)',
    sourceType: 'github',
    githubRepo: 'azahar-emu/azahar',
    packageName: 'org.azahar_emu.azahar',
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
  ppsspp: {
    displayName: 'PPSSPP (PSP)',
    sourceType: 'fdroid',
    packageName: 'org.ppsspp.ppsspp',
  },
  duckstation: {
    displayName: 'DuckStation (PS1)',
    sourceType: 'playstore',
    packageName: 'com.github.stenzek.duckstation',
  },
  nethersx2: {
    displayName: 'NetherSX2 (PS2)',
    sourceType: 'github',
    githubRepo: 'masterjg/nethersx2-builds',
    packageName: 'xyz.aethersx2.android',
  },
  flycast: {
    displayName: 'Flycast (Dreamcast)',
    sourceType: 'github',
    githubRepo: 'flyinghead/flycast',
    packageName: 'org.flycast.flycast',
  },
}

const entries = sourcesJson as EmulatorSource[]
/** Comme fetchLatestRelease (electron/main/emulators/releaseAssets.ts) : insensible à la casse. */
const matches = (pattern: string | undefined, name: string) => new RegExp(pattern ?? '', 'i').test(name)

describe('sources.json — valeurs vérifiées', () => {
  it('contient exactement les 8 émulateurs attendus', () => {
    expect(entries.map((s) => s.id).sort()).toEqual([
      'azahar',
      'cemu',
      'dolphin',
      'duckstation',
      'flycast',
      'nethersx2',
      'ppsspp',
      'watermelonds',
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

      if (exp.sourceType === 'fdroid') {
        it('a un fdroidRepo et pas de dépôt GitHub', () => {
          expect(src?.fdroidRepo).toBeDefined()
          expect(src?.githubRepo).toBeUndefined()
        })
      }

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
  it('WatermelonDS : packageName du manifeste 0.7.0, ni l’ancien melonDS ni une variante supposée', () => {
    const wm = entries.find((s) => s.id === 'watermelonds')
    expect(wm?.packageName).toBe('me.magnum.melondualds')
    expect(wm?.packageName).not.toBe('me.magnum.melonds')
    expect(wm?.packageName).not.toBe('me.magnum.melonds.watermelon')
    expect(wm?.packageName).not.toMatch(/\.(nightly|dev)$/)
  })

  it('WatermelonDS : l’assetPattern ne retient que l’APK stable de la release', () => {
    const pattern = entries.find((s) => s.id === 'watermelonds')?.assetPattern
    expect(matches(pattern, 'WatermelonDS-0.7.0.apk')).toBe(true)
    expect(matches(pattern, 'WatermelonDS-0.7.1.apk')).toBe(true)
    // Noms d'assets réels des releases précédentes / pré-releases
    expect(matches(pattern, 'Nightly-MelonDualDS-0.6.0.apk')).toBe(false)
    expect(matches(pattern, 'Hotfix-2-MelonDualDS-0.7.0.rc3.apk')).toBe(false)
    expect(matches(pattern, 'MelonDualDS-0.7.0.rc5.apk')).toBe(false)
  })

  it('plus aucune entrée melonDS d’origine (rafaelvcaetano/melonDS-android)', () => {
    expect(entries.some((s) => s.githubRepo === 'rafaelvcaetano/melonDS-android')).toBe(false)
    expect(entries.some((s) => s.id === 'melonds-ds')).toBe(false)
  })

  it('pas d’entrée « Eden DS » : c’est un fork Switch (dual screen), pas un émulateur DS', () => {
    expect(entries.some((s) => /eden/i.test(`${s.id} ${s.displayName} ${s.githubRepo ?? ''}`))).toBe(false)
  })

  it('Azahar utilise le packageName réel org.azahar_emu.azahar (ni Lime3DS, ni org.azahar.android)', () => {
    const azahar = entries.find((s) => s.id === 'azahar')
    expect(azahar?.packageName).toBe('org.azahar_emu.azahar')
    expect(azahar?.packageName).not.toBe('io.github.lime3ds.android')
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

  it('PPSSPP : F-Droid officiel, car ses releases GitHub ne contiennent aucun APK', () => {
    const ppsspp = entries.find((s) => s.id === 'ppsspp')
    expect(ppsspp?.sourceType).toBe('fdroid')
    expect(ppsspp?.fdroidRepo).toBe('https://f-droid.org/repo')
    expect(ppsspp?.githubRepo).toBeUndefined()
    expect(ppsspp?.assetPattern).toBeUndefined()
    // Variantes du même projet publiées sous d'autres ids.
    expect(ppsspp?.packageName).not.toBe('org.ppsspp.ppssppgold')
    expect(ppsspp?.packageName).not.toBe('org.ppsspp.ppsspplegacy')
  })

  it('DuckStation : Google Play uniquement (ni release GitHub Android, ni F-Droid)', () => {
    const duck = entries.find((s) => s.id === 'duckstation')
    expect(duck?.sourceType).toBe('playstore')
    expect(duck?.githubRepo).toBeUndefined()
    expect(duck?.assetPattern).toBeUndefined()
    expect(duck?.fdroidRepo).toBeUndefined()
    expect(duck?.playStoreUrl).toContain('com.github.stenzek.duckstation')
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

describe('obtainium.json — gestionnaire de mises à jour (hors liste des émulateurs)', () => {
  it('dépôt, packageName et asset relevés sur la release v1.6.17', () => {
    expect(obtainiumJson.githubRepo).toBe('ImranR98/Obtainium')
    expect(obtainiumJson.sourceType).toBe('github')
    expect(obtainiumJson.packageName).toBe('dev.imranr.obtainium')
    expect(obtainiumJson.packageName).not.toMatch(/\.fdroid$/)
  })

  it('assetPattern : APK arm64 standard, ni F-Droid, ni universel, ni signatures', () => {
    const p = obtainiumJson.assetPattern
    expect(matches(p, 'app-arm64-v8a-release.apk')).toBe(true)
    for (const other of [
      'app-arm64-v8a-fdroid-release.apk',
      'app-release.apk',
      'app-arm64-v8a-release.apk.sha256',
      'app-arm64-v8a-release.apk.idsig',
      'app-armeabi-v7a-release.apk',
    ]) {
      expect(matches(p, other), other).toBe(false)
    }
  })

  it('n’est pas listé comme émulateur, mais son paquet est connu du mock', () => {
    expect(entries.some((s) => s.id === obtainiumJson.id)).toBe(false)
    expect(MOCK_FIXTURES.installedPackages[obtainiumJson.packageName]).toBeDefined()
  })
})
