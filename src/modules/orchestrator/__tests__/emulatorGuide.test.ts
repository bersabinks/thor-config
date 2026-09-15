import { describe, it, expect } from 'vitest'
import { EMULATOR_GUIDES, THOR_MAX_HARDWARE, guideFor } from '../emulatorGuide'
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

  it('chaque fiche a ses réglages AYN Thor Max (pilote, résolution, gâchettes)', () => {
    for (const guide of EMULATOR_GUIDES) {
      expect(guide.thor.gpuDriver.instructions.length, guide.id).toBeGreaterThan(20)
      expect(guide.thor.internalResolution.value, guide.id).toBeTruthy()
      expect(guide.thor.internalResolution.rationale.length, guide.id).toBeGreaterThan(20)
      expect(guide.thor.triggers, guide.id).toMatch(/L2|R2/)
      expect(Array.isArray(guide.screenshots)).toBe(true)
    }
  })

  it('Turnip seulement pour les émulateurs Vulkan (melonDS est en OpenGL ES)', () => {
    const applicable = Object.fromEntries(EMULATOR_GUIDES.map((g) => [g.id, g.thor.gpuDriver.applicable]))
    expect(applicable).toEqual({ 'melonds-ds': false, azahar: true, dolphin: true, cemu: true })
  })

  it('la résolution recommandée ne contredit pas le réglage listé dans la fiche', () => {
    for (const guide of EMULATOR_GUIDES) {
      const listed = guide.settings.find((s) => /Internal resolution/i.test(s.path))
      if (listed) expect(listed.value, guide.id).toBe(guide.thor.internalResolution.value)
    }
  })

  it('le matériel de référence est la Thor Max (Adreno 740)', () => {
    expect(THOR_MAX_HARDWARE.gpu).toBe('Adreno 740')
    expect(THOR_MAX_HARDWARE.verifiedOnHardware).toBe(false)
  })

  it('guideFor résout par id', () => {
    expect(guideFor('dolphin')?.displayName).toBe('Dolphin (dev build)')
    expect(guideFor('inconnu')).toBeUndefined()
  })
})
