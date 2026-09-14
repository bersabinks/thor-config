import { describe, it, expect } from 'vitest'
import {
  parseDiscInfo,
  classifyContent,
  groupMultiDisc,
  generateM3u,
  m3uFileName,
} from '../grouping'

describe('parseDiscInfo', () => {
  it('extrait le titre et le numéro de disque', () => {
    expect(parseDiscInfo('Final Fantasy X (Disc 1).iso')).toEqual({ title: 'Final Fantasy X', disc: 1 })
    expect(parseDiscInfo('Game (Disk 2).bin')).toEqual({ title: 'Game', disc: 2 })
    expect(parseDiscInfo('Game (CD 3).chd')).toEqual({ title: 'Game', disc: 3 })
  })

  it('sans marqueur de disque → disc null', () => {
    expect(parseDiscInfo('Mario Kart DS.nds').disc).toBeNull()
  })
})

describe('classifyContent', () => {
  it('détecte update / dlc / base', () => {
    expect(classifyContent('Game [UPD].wua')).toBe('update')
    expect(classifyContent('Game (Update).wua')).toBe('update')
    expect(classifyContent('Game [DLC].wua')).toBe('dlc')
    expect(classifyContent('Game.wua')).toBe('base')
  })
})

describe('groupMultiDisc', () => {
  it('regroupe et trie les disques d’un même titre', () => {
    const g = groupMultiDisc(['FFX (Disc 2).iso', 'FFX (Disc 1).iso'])
    expect(g).toHaveLength(1)
    expect(g[0].title).toBe('FFX')
    expect(g[0].files).toEqual(['FFX (Disc 1).iso', 'FFX (Disc 2).iso'])
  })

  it('ignore les jeux mono-disque', () => {
    expect(groupMultiDisc(['Mario.nds', 'Solo (Disc 1).iso'])).toHaveLength(0)
  })

  it('génère un .m3u (un fichier par ligne) et son nom', () => {
    const g = groupMultiDisc(['FFX (Disc 1).iso', 'FFX (Disc 2).iso'])[0]
    expect(generateM3u(g)).toBe('FFX (Disc 1).iso\nFFX (Disc 2).iso\n')
    expect(m3uFileName(g)).toBe('FFX.m3u')
  })
})
