import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, '..')

describe('ADB Status & Settings UI contract', () => {
  it('Configure.tsx contient le composant de statut ADB et le bouton rafraîchir', () => {
    const content = readFileSync(join(srcDir, 'pages', 'Configure.tsx'), 'utf8')
    expect(content).toContain('adb-status-bar')
    expect(content).toContain('getAdbInfo')
    expect(content).toContain('handleRefresh')
    expect(content).toContain('🔄 Rafraîchir')
    expect(content).toContain('ADB introuvable — configurez le chemin dans Réglages')
  })

  it('Settings.tsx contient le champ de chemin personnalisé et le bouton parcourir', () => {
    const content = readFileSync(join(srcDir, 'pages', 'Settings.tsx'), 'utf8')
    expect(content).toContain('Chemin ADB personnalisé')
    expect(content).toContain('customAdbPath')
    expect(content).toContain('pickAdbPath')
    expect(content).toContain('Parcourir…')
  })

  it('index.css contient les règles pour adb-status-bar et adb-input-row', () => {
    const css = readFileSync(join(srcDir, 'index.css'), 'utf8')
    expect(css).toContain('.adb-status-bar')
    expect(css).toContain('.adb-status-bar--ok')
    expect(css).toContain('.adb-status-bar--error')
    expect(css).toContain('.adb-path-input')
    expect(css).toContain('.adb-input-row')
  })
})
