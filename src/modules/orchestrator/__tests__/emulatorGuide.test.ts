import { describe, it, expect } from 'vitest'
import { EMULATOR_GUIDES, guideFor } from '../emulatorGuide'
import sources from '../../emulators/sources.json'

describe('EMULATOR_GUIDES', () => {
  it('couvre chaque émulateur de sources.json', () => {
    const guideIds = EMULATOR_GUIDES.map((g) => g.id).sort()
    const sourceIds = sources.map((s) => s.id).sort()
    expect(guideIds).toEqual(sourceIds)
  })

  it('les displayName correspondent exactement à sources.json (couplage du récapitulatif)', () => {
    // FinalReport associe un guide à un émulateur via le libellé
    // « <displayName> — Installation » : la moindre divergence casserait l’affichage.
    for (const guide of EMULATOR_GUIDES) {
      const source = sources.find((s) => s.id === guide.id)
      expect(source?.displayName).toBe(guide.displayName)
    }
  })

  it('chaque guide a une intro et au moins un réglage', () => {
    for (const guide of EMULATOR_GUIDES) {
      expect(guide.intro.length).toBeGreaterThan(0)
      expect(guide.settings.length).toBeGreaterThan(0)
      for (const s of guide.settings) {
        expect(s.path).toBeTruthy()
        expect(s.value).toBeTruthy()
      }
    }
  })

  it('guideFor résout par id', () => {
    expect(guideFor('dolphin')?.displayName).toBe('Dolphin (dev build)')
    expect(guideFor('inconnu')).toBeUndefined()
  })
})
