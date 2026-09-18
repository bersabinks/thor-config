import { describe, it, expect } from 'vitest'
import { applyIniSettings, parseIniKey, readIniSettings } from '../configApplier'

describe('configApplier — parsing et modification INI', () => {
  it('parse les clés simples et avec section', () => {
    expect(parseIniKey('GraphicsBackend')).toEqual({ section: null, key: 'GraphicsBackend' })
    expect(parseIniKey('[Graphics] GraphicsBackend')).toEqual({ section: 'Graphics', key: 'GraphicsBackend' })
    expect(parseIniKey('[General]CurrentDirectory')).toEqual({ section: 'General', key: 'CurrentDirectory' })
    expect(parseIniKey('General.ISOPath0')).toEqual({ section: 'General', key: 'ISOPath0' })
  })

  it('applique des clés globales sans section', () => {
    const initial = 'fullscreen=0\nvolume=80\n'
    const updated = applyIniSettings(initial, { fullscreen: '1', language: 'fr' })
    expect(updated).toContain('fullscreen = 1')
    expect(updated).toContain('volume=80')
    expect(updated).toContain('language = fr')
  })

  it('insère et met à jour des clés dans des sections spécifiques', () => {
    const initial = `[General]
CurrentDirectory = /old/path
FirstRun = true

[Graphics]
Backend = OpenGL
Resolution = 1
`
    const updated = applyIniSettings(initial, {
      '[General]CurrentDirectory': '/storage/emulated/0/ROMs/psp',
      '[Graphics]Backend': 'Vulkan',
      '[Graphics]InternalResolution': '3',
      '[Audio]Volume': '100',
    })

    expect(updated).toContain('[General]')
    expect(updated).toContain('CurrentDirectory = /storage/emulated/0/ROMs/psp')
    expect(updated).toContain('FirstRun = true')

    expect(updated).toContain('[Graphics]')
    expect(updated).toContain('Backend = Vulkan')
    expect(updated).toContain('InternalResolution = 3')
    expect(updated).toContain('Resolution = 1')

    expect(updated).toContain('[Audio]')
    expect(updated).toContain('Volume = 100')
  })

  it('relit les clés dans leurs sections respectives', () => {
    const ini = `[General]
ISOPaths = 2
ISOPath0 = /storage/emulated/0/ROMs/gc
ISOPath1 = /storage/emulated/0/ROMs/wii

[Core]
GFXBackend = Vulkan
`
    const read = readIniSettings(ini, [
      '[General]ISOPaths',
      '[General]ISOPath0',
      '[General]ISOPath1',
      '[Core]GFXBackend',
      '[General]NonExistent',
    ])

    expect(read['[General]ISOPaths']).toBe('2')
    expect(read['[General]ISOPath0']).toBe('/storage/emulated/0/ROMs/gc')
    expect(read['[General]ISOPath1']).toBe('/storage/emulated/0/ROMs/wii')
    expect(read['[Core]GFXBackend']).toBe('Vulkan')
    expect(read['[General]NonExistent']).toBe('')
  })
})
