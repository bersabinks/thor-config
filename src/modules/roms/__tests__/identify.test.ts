import { describe, it, expect } from 'vitest'
import { identifySystem, extensionOf, HEADER_READ_LENGTH } from '../identify'

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

  it('fichiers métadonnées / documentation (.txt, .nfo, .url) → ignored', () => {
    expect(identifySystem('GUIDE_TESTEUR.txt').reason).toBe('ignored')
    expect(identifySystem('info.nfo').reason).toBe('ignored')
    expect(identifySystem('link.url').reason).toBe('ignored')
  })

  it('.rvz sans tag → wii par défaut (dossier Dolphin)', () => {
    const r = identifySystem('Super Paper Mario.rvz')
    expect(r.system?.id).toBe('wii')
  })

  it('.rvz avec tag gc → gc', () => {
    const r = identifySystem('Super Mario Sunshine (gc).rvz')
    expect(r.system?.id).toBe('gc')
  })

  it('.iso sans en-tête → ambigu (gc/wii/psp/ps2)', () => {
    const r = identifySystem('game.iso')
    expect(r.system).toBeNull()
    expect(r.reason).toBe('ambiguous')
    expect(r.candidates).toEqual(expect.arrayContaining(['gc', 'wii', 'psp', 'ps2']))
  })

  it('.cso → psp, .cue → ps1 (extensions non partagées)', () => {
    expect(identifySystem('God of War.cso').system?.id).toBe('psp')
    expect(identifySystem('Metal Gear Solid (Disc 1).cue').system?.id).toBe('ps1')
  })

  it('.bin sans en-tête → ambigu (ps1/ps2)', () => {
    const r = identifySystem('game.bin')
    expect(r.reason).toBe('ambiguous')
    expect(r.candidates).toEqual(expect.arrayContaining(['ps1', 'ps2']))
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

describe('identifySystem — Sony (conflits de signature .iso / .bin)', () => {
  const PSP_GAME = '5053502047414D45'
  const CD001 = '4344303031'

  it('.iso PSP (systemId « PSP GAME » à 0x8008) → psp, pas ps2', () => {
    const h = header(0x8008, PSP_GAME, HEADER_READ_LENGTH)
    // Le CD001 générique est aussi présent dans un ISO PSP réel.
    for (let i = 0; i < CD001.length / 2; i++) h[0x8001 + i] = parseInt(CD001.slice(i * 2, i * 2 + 2), 16)
    const r = identifySystem('God of War.iso', h)
    expect(r.system?.id).toBe('psp')
    expect(r.method).toBe('magic')
  })

  it('variante entre guillemets « "PSP GAME" » également reconnue', () => {
    const r = identifySystem('jeu.iso', header(0x8008, '225053502047414D4522', HEADER_READ_LENGTH))
    expect(r.system?.id).toBe('psp')
  })

  it('.iso ISO9660 sans marqueur PSP → ps2 (comportement conservé)', () => {
    const r = identifySystem('game.iso', header(0x8001, CD001, HEADER_READ_LENGTH))
    expect(r.system?.id).toBe('ps2')
  })

  it('.cso : en-tête CISO → psp', () => {
    expect(identifySystem('God of War.cso', header(0, '4349534F', 64)).system?.id).toBe('psp')
  })

  it('.ciso GameCube n’est pas capté par la signature CISO du PSP (restreinte au .cso)', () => {
    const r = identifySystem('Zelda.ciso', header(0, '4349534F', 64))
    expect(r.system?.id).toBe('gc')
    expect(r.method).toBe('extension')
  })

  it('.bin avec synchro CD brute (00 FF×10 00) → ps1', () => {
    const r = identifySystem('Metal Gear Solid (Disc 1).bin', header(0, '00FFFFFFFFFFFFFFFFFFFFFF00', 64))
    expect(r.system?.id).toBe('ps1')
    expect(r.method).toBe('magic')
  })

  it('la synchro CD ne s’applique qu’au .bin (un .iso 2048 o/secteur ne la porte pas)', () => {
    const r = identifySystem('game.iso', header(0, '00FFFFFFFFFFFFFFFFFFFFFF00', 64))
    expect(r.system).toBeNull()
    expect(r.reason).toBe('ambiguous')
  })
})

describe('identifySystem — consoles rétro (GBA, SNES, NES, Mega Drive, Dreamcast)', () => {
  it('identifie les systèmes par leurs extensions exclusives', () => {
    expect(identifySystem('Pokemon Emerald.gba').system?.folder).toBe('gba')
    expect(identifySystem('Pokemon Crystal.gbc').system?.folder).toBe('gbc')
    expect(identifySystem('Tetris.gb').system?.folder).toBe('gb')
    expect(identifySystem('Super Mario World.sfc').system?.folder).toBe('snes')
    expect(identifySystem('Super Mario World.smc').system?.folder).toBe('snes')
    expect(identifySystem('Super Mario Bros.nes').system?.folder).toBe('nes')
    expect(identifySystem('Sonic 2.smd').system?.folder).toBe('megadrive')
    expect(identifySystem('Sonic 2.gen').system?.folder).toBe('megadrive')
    expect(identifySystem('Crazy Taxi.cdi').system?.folder).toBe('dreamcast')
    expect(identifySystem('Shenmue.gdi').system?.folder).toBe('dreamcast')
  })
})

