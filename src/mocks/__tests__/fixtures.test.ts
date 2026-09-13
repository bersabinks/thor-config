import { describe, it, expect, beforeEach } from 'vitest'
import { getUiXmlForContext, resetMockContext } from '../fixtures'
import { parseUiXml, findByText } from '../../modules/prepare/uiAutomation'

describe('getUiXmlForContext — gestion du contexte simulé', () => {
  beforeEach(() => {
    resetMockContext()
  })

  it('retourne AYN Settings XML par défaut (après reset)', () => {
    const xml = getUiXmlForContext('')
    const nodes = parseUiXml(xml)
    expect(findByText(nodes, 'Xbox', { exact: true })).not.toBeNull()
    expect(findByText(nodes, 'Analog', { exact: true })).not.toBeNull()
  })

  it('active le contexte AYN Settings via monkey -p com.ayn.settings', () => {
    const xml = getUiXmlForContext('monkey -p com.ayn.settings -c android.intent.category.LAUNCHER 1')
    const nodes = parseUiXml(xml)
    const xbox = findByText(nodes, 'Xbox', { exact: true })
    expect(xbox).not.toBeNull()
    expect(xbox?.selected).toBe(true)
  })

  it('active le contexte gesture nav via am start android.settings.SETTINGS', () => {
    getUiXmlForContext('am start -a android.settings.SETTINGS')
    const xml = getUiXmlForContext('')
    const nodes = parseUiXml(xml)
    expect(findByText(nodes, 'Gesture navigation')).not.toBeNull()
    expect(findByText(nodes, 'Xbox', { exact: true })).toBeNull()
  })

  // ── Régression : SYSTEM_UPDATE_SETTINGS ne doit pas changer le contexte ──
  it('ne change pas le contexte pour SYSTEM_UPDATE_SETTINGS (bug original)', () => {
    // Établir le contexte AYN Settings
    getUiXmlForContext('monkey -p com.ayn.settings 1')
    // Simuler l'étape firmware update
    getUiXmlForContext('am start -a android.settings.SYSTEM_UPDATE_SETTINGS')
    // Le contexte doit toujours être AYN Settings
    const xml = getUiXmlForContext('')
    const nodes = parseUiXml(xml)
    expect(findByText(nodes, 'Xbox', { exact: true })).not.toBeNull()
    expect(findByText(nodes, 'Gesture navigation')).toBeNull()
  })

  it("'android.settings.SETTINGS' n'est pas une sous-chaîne de 'android.settings.SYSTEM_UPDATE_SETTINGS'", () => {
    // Vérifie l'hypothèse sur laquelle repose le fix
    expect('android.settings.SYSTEM_UPDATE_SETTINGS'.includes('android.settings.SETTINGS')).toBe(false)
    expect('am start -a android.settings.SETTINGS'.includes('android.settings.SETTINGS')).toBe(true)
  })

  // ── Test du flux complet du module prepare ──
  it('simule le flux Prompt 2 sans perte de contexte AYN (régression bout en bout)', () => {
    // Étape 1 : gesture navigation (settings put/get, pas d'am start)
    getUiXmlForContext('settings put secure navigation_mode 2')
    getUiXmlForContext('settings get secure navigation_mode')

    // Étape 2 : firmware update (SYSTEM_UPDATE_SETTINGS — NE DOIT PAS changer le contexte)
    getUiXmlForContext('am start -a android.settings.SYSTEM_UPDATE_SETTINGS')
    // waitForDevice ne change pas le contexte non plus
    getUiXmlForContext('adb -s mock wait-for-device')

    // Étape 3 : AYN Settings — relance l'app
    getUiXmlForContext('monkey -p com.ayn.settings -c android.intent.category.LAUNCHER 1')
    const xml = getUiXmlForContext('cat /sdcard/window_dump.xml')
    const nodes = parseUiXml(xml)

    // Xbox doit être trouvé et sélectionné
    const xbox = findByText(nodes, 'Xbox', { exact: true })
    expect(xbox).not.toBeNull()
    expect(xbox?.selected).toBe(true)

    // Analog doit être trouvé et sélectionné
    const analog = findByText(nodes, 'Analog', { exact: true })
    expect(analog).not.toBeNull()
    expect(analog?.selected).toBe(true)
  })

  it('le contexte peut être basculé plusieurs fois', () => {
    getUiXmlForContext('am start -a android.settings.SETTINGS')
    {
      const nodes = parseUiXml(getUiXmlForContext(''))
      expect(findByText(nodes, 'Gesture navigation')).not.toBeNull()
    }

    getUiXmlForContext('monkey -p com.ayn.settings 1')
    {
      const nodes = parseUiXml(getUiXmlForContext(''))
      expect(findByText(nodes, 'Xbox', { exact: true })).not.toBeNull()
    }
  })
})
