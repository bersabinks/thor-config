import { describe, it, expect } from 'vitest'
import {
  classifyRoots,
  filesUnderRoot,
  findAppRoots,
  isVitaStructure,
  verifyTree,
} from '../layout'
import { dptFileName, generateDpt, parseDpt } from '../dpt'

describe('détection de la structure PS Vita', () => {
  it('reconnaît une racine app0 à la racine de l’archive', () => {
    expect(findAppRoots(['eboot.bin', 'sce_sys/param.sfo'])).toEqual([''])
  })

  it('reconnaît un dossier par Title ID et normalise les séparateurs Windows', () => {
    expect(findAppRoots(['TEST00001\\eboot.bin', 'TEST00001\\sce_sys\\param.sfo'])).toEqual([
      'TEST00001',
    ])
  })

  it('ignore une racine imbriquée dans une autre', () => {
    expect(findAppRoots(['A/sce_sys/param.sfo', 'A/sub/sce_sys/param.sfo'])).toEqual(['A'])
  })

  it('sépare le jeu de base des patchs et DLC (dump NoNpDrm)', () => {
    expect(
      classifyRoots([
        'app/TEST00001/sce_sys/param.sfo',
        'patch/TEST00001/sce_sys/param.sfo',
        'addcont/TEST00001/DLC1/sce_sys/param.sfo',
      ])
    ).toEqual({ games: ['app/TEST00001'], extras: ['addcont/TEST00001/DLC1', 'patch/TEST00001'] })
  })

  it('sans sce_sys/param.sfo, la structure n’est pas reconnue', () => {
    expect(isVitaStructure(['readme.txt', 'sce_sys/icon0.png', 'xsce_sys/param.sfo'])).toBe(false)
  })

  it('un patch seul n’est pas un jeu reconnaissable', () => {
    expect(isVitaStructure(['patch/TEST00001/sce_sys/param.sfo'])).toBe(false)
  })
})

describe('arborescence produite vs attendue', () => {
  it('liste les fichiers relatifs à une racine, sans les dossiers', () => {
    expect(
      filesUnderRoot(['A/sce_sys/param.sfo', 'A/eboot.bin', 'B/x.bin', 'A/'], 'A')
    ).toEqual(['eboot.bin', 'sce_sys/param.sfo'])
  })

  it('valide une arborescence identique', () => {
    const files = ['eboot.bin', 'sce_sys/param.sfo', 'sce_module/libc.suprx']
    expect(verifyTree([...files].reverse(), files)).toEqual({ ok: true, missing: [], unexpected: [] })
  })

  it('signale un fichier manquant et un fichier inattendu', () => {
    const check = verifyTree(
      ['eboot.bin', 'sce_sys/param.sfo', 'intrus.txt'],
      ['eboot.bin', 'sce_sys/param.sfo', 'sce_module/libc.suprx']
    )
    expect(check).toEqual({ ok: false, missing: ['sce_module/libc.suprx'], unexpected: ['intrus.txt'] })
  })

  it('exige eboot.bin et sce_sys/param.sfo même s’ils manquaient déjà à la source', () => {
    const check = verifyTree(['data.bin'], ['data.bin'])
    expect(check.ok).toBe(false)
    expect(check.missing).toEqual(['eboot.bin', 'sce_sys/param.sfo'])
  })
})

describe('descripteur .dpt', () => {
  const info = { title: 'Demo Vita Homebrew', titleId: 'TEST00001' }

  it('contient le titre et le Title ID, relus à l’identique', () => {
    expect(generateDpt(info)).toBe('title=Demo Vita Homebrew\ntitleId=TEST00001\n')
    expect(parseDpt(generateDpt(info))).toEqual(info)
  })

  it('produit un nom de fichier sûr', () => {
    expect(dptFileName(info)).toBe('Demo Vita Homebrew [TEST00001].dpt')
    expect(dptFileName({ title: 'Demo: Vita/Game?', titleId: 'TEST00001' })).toBe(
      'Demo VitaGame [TEST00001].dpt'
    )
    expect(dptFileName({ title: '???', titleId: 'TEST00001' })).toBe('TEST00001.dpt')
  })
})
