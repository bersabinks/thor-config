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

  it('Turnip applicable partout : les 4 émulateurs ont un rendu Vulkan (WatermelonDS depuis 0.7.0)', () => {
    const applicable = Object.fromEntries(EMULATOR_GUIDES.map((g) => [g.id, g.thor.gpuDriver.applicable]))
    expect(applicable).toEqual({
      watermelonds: true,
      azahar: true,
      dolphin: true,
      cemu: true,
      ppsspp: true,
      duckstation: true,
    })
  })

  it('PPSSPP et DuckStation : réglages Sony attendus sur la Thor Max', () => {
    const ppsspp = Object.fromEntries(guideFor('ppsspp')!.settings.map((s) => [s.path, s.value]))
    expect(ppsspp['Graphics → Rendering backend']).toMatch(/^Vulkan/)
    expect(ppsspp['Graphics → Rendering resolution']).toBe('3×')
    expect(Object.keys(ppsspp).some((p) => /Texture scaling/.test(p))).toBe(true)
    expect(guideFor('ppsspp')!.thor.triggers).toMatch(/L2\/R2/)

    const duck = Object.fromEntries(guideFor('duckstation')!.settings.map((s) => [s.path, s.value]))
    expect(duck['Settings → Graphics → GPU Renderer']).toBe('Vulkan')
    expect(duck['Settings → Graphics → Internal resolution']).toBe('3×')
    expect(duck['Settings → Graphics → PGXP geometry correction']).toBe('Activé')
    expect(Object.keys(duck).some((p) => /Multitap/.test(p))).toBe(true)
  })

  it('WatermelonDS : réglages Thor Max avec les libellés réels de l’application', () => {
    const values = Object.fromEntries(guideFor('watermelonds')!.settings.map((s) => [s.path, s.value]))
    expect(values['Settings → Video → Renderer']).toMatch(/^Vulkan/)
    expect(values['Settings → Video → Dual screen presets']).toBe('Internal: Top, External: Bottom')
    expect(values['Dual screen presets → Keep DS aspect ratio']).toBe('ON')
    expect(values['Dual screen presets → Integer scale']).toBe('ON')
    expect(Object.keys(values)).toContain('Settings → RetroAchievements → Enable RetroAchievements')
    expect(guideFor('watermelonds')!.thor.gpuDriver.instructions).toMatch(/Adreno Vulkan driver/)
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
