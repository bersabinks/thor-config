import { describe, it, expect } from 'vitest'
import { identifySystem, extensionOf } from '../identify'

function header(offset: number, hex: string, len: number): Uint8Array {
  const b = new Uint8Array(len)
  for (let i = 0; i < hex.length / 2; i++) b[offset + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return b
}

describe('extensionOf', () => {
  it("renvoie l'extension en minuscules", () => {
    expect(extensionOf('Game.NDS')).toBe('.nds')
    expect(extensionOf('dir/sub/Game.ISO')).toBe('.iso')
    expect(extensionOf('noext')).toBe('')
  })
})

describe('identifySystem — par extension', () => {
  it('.nds → nds', () => {
    const r = identifySystem('Mario Kart DS.nds')
    expect(r.system?.id).toBe('nds')
    expect(r.method).toBe('extension')
  })

  it('.wbfs → wii', () => {
    expect(identifySystem('Zelda.wbfs').system?.id).toBe('wii')
  })

  it('extension inconnue → null (unknown)', () => {
    const r = identifySystem('notes.xyz')
    expect(r.system).toBeNull()
    expect(r.reason).toBe('unknown')
  })

  it('.iso sans en-tête → ambigu (gc/wii/ps2)', () => {
    const r = identifySystem('game.iso')
    expect(r.system).toBeNull()
    expect(r.reason).toBe('ambiguous')
    expect(r.candidates).toEqual(expect.arrayContaining(['gc', 'wii', 'ps2']))
  })
})

describe('identifySystem — par signature (magic)', () => {
  it('.iso avec magic GameCube (0x1C) → gc', () => {
    const r = identifySystem('game.iso', header(28, 'C2339F3D', 64))
    expect(r.system?.id).toBe('gc')
    expect(r.method).toBe('magic')
  })

  it('.iso avec CD001 ISO9660 (0x8001) → ps2', () => {
    const r = identifySystem('game.iso', header(32769, '4344303031', 0x8010))
    expect(r.system?.id).toBe('ps2')
    expect(r.method).toBe('magic')
  })

  it('la signature l’emporte sur une extension trompeuse', () => {
    const r = identifySystem('weird.nds', header(28, 'C2339F3D', 64))
    expect(r.system?.id).toBe('gc')
    expect(r.method).toBe('magic')
  })

  it('un en-tête trop court ne plante pas (retombe sur l’extension)', () => {
    const r = identifySystem('game.iso', new Uint8Array(4))
    expect(r.system).toBeNull()
    expect(r.reason).toBe('ambiguous')
  })
})
