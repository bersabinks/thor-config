import { describe, it, expect } from 'vitest'
import { buildSfo, parseSfo, readTitleInfo } from '../sfo'

describe('PARAM.SFO — lecture/écriture', () => {
  it('relit les valeurs écrites (chaînes UTF-8 et entiers)', () => {
    const bytes = buildSfo({
      TITLE: 'Démo Vita — Édition',
      TITLE_ID: 'TEST00001',
      ATTRIBUTE: 0x8000,
      APP_VER: '01.00',
    })
    expect(parseSfo(bytes)).toEqual({
      APP_VER: '01.00',
      ATTRIBUTE: 0x8000,
      TITLE: 'Démo Vita — Édition',
      TITLE_ID: 'TEST00001',
    })
  })

  it('écrit la signature \\0PSF et aligne la table des données sur 4 octets', () => {
    const bytes = buildSfo({ TITLE: 'abc', TITLE_ID: 'TEST00001' })
    expect([...bytes.subarray(0, 4)]).toEqual([0x00, 0x50, 0x53, 0x46])
    const dataTableStart = new DataView(bytes.buffer).getUint32(12, true)
    expect(dataTableStart % 4).toBe(0)
  })

  it('rejette un fichier sans signature PSF', () => {
    expect(() => parseSfo(new Uint8Array(32))).toThrow(/signature PSF/)
  })

  it('rejette un fichier tronqué (tables hors limites)', () => {
    const bytes = buildSfo({ TITLE: 'abc', TITLE_ID: 'TEST00001' })
    expect(() => parseSfo(bytes.subarray(0, 30))).toThrow(/hors limites/)
  })
})

describe('readTitleInfo', () => {
  it('extrait titre et Title ID en normalisant les espaces du titre', () => {
    const info = readTitleInfo(buildSfo({ TITLE: 'Demo\nVita  Game ', TITLE_ID: 'TEST00001' }))
    expect(info).toEqual({ title: 'Demo Vita Game', titleId: 'TEST00001' })
  })

  it('se rabat sur STITLE si TITLE est absent', () => {
    const info = readTitleInfo(buildSfo({ STITLE: 'Demo', TITLE_ID: 'TEST00001' }))
    expect(info.title).toBe('Demo')
  })

  it.each(['', 'TEST0001', 'test00001', 'TEST000011'])(
    'rejette le Title ID mal formé "%s"',
    (titleId) => {
      expect(() => readTitleInfo(buildSfo({ TITLE: 'Demo', TITLE_ID: titleId }))).toThrow(/TITLE_ID/)
    }
  )

  it('rejette un param.sfo sans titre', () => {
    expect(() => readTitleInfo(buildSfo({ TITLE_ID: 'TEST00001' }))).toThrow(/TITLE absent/)
  })
})
