import { describe, it, expect } from 'vitest'
import { parseUiXml, findByText, findAllByText, findByResourceId } from '../uiAutomation'

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="android:id/content" class="android.widget.FrameLayout" package="com.android.settings" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][1080,2400]">
    <node index="0" text="System navigation" resource-id="" class="android.widget.TextView" package="com.android.settings" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,100][1080,170]"/>
    <node index="1" text="Gesture navigation" resource-id="com.android.settings:id/gesture_radio" class="android.widget.RadioButton" package="com.android.settings" content-desc="" checkable="true" checked="true" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="true" bounds="[0,200][1080,300]"/>
    <node index="2" text="3-button navigation" resource-id="" class="android.widget.RadioButton" package="com.android.settings" content-desc="" checkable="true" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,320][1080,420]"/>
  </node>
</hierarchy>`

const AYN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="com.ayn.settings:id/root" class="android.widget.FrameLayout" package="com.ayn.settings" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][1080,2400]">
    <node index="0" text="Xbox" resource-id="com.ayn.settings:id/layout_xbox" class="android.widget.RadioButton" package="com.ayn.settings" content-desc="" checkable="true" checked="true" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="true" bounds="[32,300][540,380]"/>
    <node index="1" text="Nintendo" resource-id="com.ayn.settings:id/layout_nintendo" class="android.widget.RadioButton" package="com.ayn.settings" content-desc="" checkable="true" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[540,300][1048,380]"/>
    <node index="2" text="Analog" resource-id="com.ayn.settings:id/trigger_analog" class="android.widget.RadioButton" package="com.ayn.settings" content-desc="" checkable="true" checked="true" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="true" bounds="[32,500][540,580]"/>
  </node>
</hierarchy>`

describe('parseUiXml', () => {
  it('parse un document hiérarchique correctement', () => {
    const nodes = parseUiXml(SAMPLE_XML)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].children).toHaveLength(3)
  })

  it('extrait text, resourceId, className', () => {
    const nodes = parseUiXml(SAMPLE_XML)
    const container = nodes[0]
    expect(container.text).toBe('')
    expect(container.resourceId).toBe('android:id/content')
    expect(container.className).toBe('android.widget.FrameLayout')
  })

  it('parse les bounds correctement', () => {
    const nodes = parseUiXml(SAMPLE_XML)
    expect(nodes[0].bounds).toEqual({ left: 0, top: 0, right: 1080, bottom: 2400 })
    const gesture = nodes[0].children[1]
    expect(gesture.bounds).toEqual({ left: 0, top: 200, right: 1080, bottom: 300 })
  })

  it('parse checked et selected', () => {
    const nodes = parseUiXml(SAMPLE_XML)
    const gesture = nodes[0].children[1]
    const threeBtn = nodes[0].children[2]
    expect(gesture.checked).toBe(true)
    expect(gesture.selected).toBe(true)
    expect(threeBtn.checked).toBe(false)
    expect(threeBtn.selected).toBe(false)
  })

  it('parse clickable', () => {
    const nodes = parseUiXml(SAMPLE_XML)
    expect(nodes[0].clickable).toBe(false)
    expect(nodes[0].children[1].clickable).toBe(true)
  })

  it('gère les nœuds auto-fermants (/>)', () => {
    const nodes = parseUiXml(SAMPLE_XML)
    // Les 3 nœuds enfants sont auto-fermants dans le XML
    expect(nodes[0].children[0].text).toBe('System navigation')
  })

  it('gère un XML vide', () => {
    expect(parseUiXml('')).toEqual([])
    expect(parseUiXml('<hierarchy rotation="0"></hierarchy>')).toEqual([])
  })
})

describe('findByText', () => {
  it('trouve un nœud par texte exact', () => {
    const nodes = parseUiXml(SAMPLE_XML)
    const node = findByText(nodes, 'Gesture navigation', { exact: true })
    expect(node).not.toBeNull()
    expect(node?.text).toBe('Gesture navigation')
  })

  it('trouve par texte partiel (insensible à la casse)', () => {
    const nodes = parseUiXml(SAMPLE_XML)
    const node = findByText(nodes, 'gesture')
    expect(node).not.toBeNull()
  })

  it('retourne null si introuvable', () => {
    const nodes = parseUiXml(SAMPLE_XML)
    expect(findByText(nodes, 'NotExistent', { exact: true })).toBeNull()
  })

  it('trouve dans les nœuds imbriqués', () => {
    const nodes = parseUiXml(SAMPLE_XML)
    // "Gesture navigation" est un enfant du premier nœud racine
    const node = findByText(nodes, 'Gesture navigation')
    expect(node).not.toBeNull()
  })
})

describe('findAllByText', () => {
  it('trouve plusieurs nœuds correspondants', () => {
    const nodes = parseUiXml(SAMPLE_XML)
    // Deux nœuds contiennent "navigation"
    const results = findAllByText(nodes, 'navigation')
    expect(results.length).toBeGreaterThanOrEqual(2)
  })
})

describe('findByResourceId', () => {
  it('trouve par resource-id', () => {
    const nodes = parseUiXml(SAMPLE_XML)
    const node = findByResourceId(nodes, 'com.android.settings:id/gesture_radio')
    expect(node).not.toBeNull()
    expect(node?.text).toBe('Gesture navigation')
  })

  it('retourne null si resource-id absent', () => {
    const nodes = parseUiXml(SAMPLE_XML)
    expect(findByResourceId(nodes, 'does.not.exist')).toBeNull()
  })
})

describe('Vérification état AYN Settings', () => {
  it('détecte que Xbox est sélectionné', () => {
    const nodes = parseUiXml(AYN_XML)
    const xbox = findByText(nodes, 'Xbox', { exact: true })
    expect(xbox).not.toBeNull()
    expect(xbox?.selected).toBe(true)
    expect(xbox?.checked).toBe(true)
  })

  it("détecte que Nintendo n'est pas sélectionné", () => {
    const nodes = parseUiXml(AYN_XML)
    const nintendo = findByText(nodes, 'Nintendo', { exact: true })
    expect(nintendo).not.toBeNull()
    expect(nintendo?.selected).toBe(false)
  })

  it('détecte que Analog est sélectionné', () => {
    const nodes = parseUiXml(AYN_XML)
    const analog = findByText(nodes, 'Analog', { exact: true })
    expect(analog?.selected).toBe(true)
  })

  it('calcule correctement le centre des bounds pour le tap', () => {
    const nodes = parseUiXml(AYN_XML)
    const xbox = findByText(nodes, 'Xbox', { exact: true })!
    const cx = Math.floor((xbox.bounds.left + xbox.bounds.right) / 2)
    const cy = Math.floor((xbox.bounds.top + xbox.bounds.bottom) / 2)
    expect(cx).toBe(286) // (32+540)/2
    expect(cy).toBe(340) // (300+380)/2
  })
})
