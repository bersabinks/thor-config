import { describe, it, expect, vi } from 'vitest'
import {
  run,
  selectVitaArchives,
  isInPsVitaFolder,
  makeSimulationVitaIpc,
  SIMULATION_IMPORT_FILES,
  VITA_TARGETS,
} from '../index'
import { buildSfo } from '../sfo'

const FAST = { maxRetries: 0, retryDelayMs: 0 }
const HOMEBREW = 'C:/ThorImport/Demo Vita Homebrew.7z'
const PUZZLE = 'C:/ThorImport/PSVita/Demo Vita Puzzle.zip'
const DROP = VITA_TARGETS.deviceDropDir

const text = (s: string) => new TextEncoder().encode(s)
const sfo = (titleId: string, title = 'Jeu factice') => buildSfo({ TITLE: title, TITLE_ID: titleId })

describe('déclenchement depuis le dossier surveillé', () => {
  it('retient les archives PS Vita et celles du dossier PSVita/, ignore le reste', async () => {
    const selected = await selectVitaArchives(SIMULATION_IMPORT_FILES, makeSimulationVitaIpc())
    expect(selected).toEqual([HOMEBREW, PUZZLE])
  })

  it('le dossier PSVita/ est reconnu sur le chemin, pas sur le nom de fichier', () => {
    expect(isInPsVitaFolder('C:\\Import\\psvita\\jeu.zip')).toBe(true)
    expect(isInPsVitaFolder('C:/Import/PSVita.zip')).toBe(false)
  })

  it('une archive illisible hors PSVita/ est ignorée sans lever', async () => {
    const ipc = makeSimulationVitaIpc()
    ipc.listArchive = vi.fn().mockRejectedValue(new Error('archive corrompue'))
    expect(await selectVitaArchives(['C:/Import/corrompue.7z'], ipc)).toEqual([])
  })
})

describe('run — cible console (Vita3K installé)', () => {
  it('produit un .vpk conforme et un .dpt, déposés et vérifiés sur la console', async () => {
    const ipc = makeSimulationVitaIpc()
    const seen: string[] = []
    const res = await run({
      serial: 'sim',
      files: [HOMEBREW],
      onStep: (s) => seen.push(s.label),
      ipc,
      options: FAST,
    })

    expect(res.steps.filter((s) => s.status !== 'success')).toEqual([])
    expect(res.overallStatus).toBe('success')
    expect(seen).toHaveLength(res.steps.length)

    const [processed] = res.processed
    expect(processed.target).toEqual({ kind: 'device', dir: DROP })
    expect(processed.games).toHaveLength(1)
    expect(processed.games[0].info).toEqual({ title: 'Demo Vita Homebrew', titleId: 'TEST00001' })
    expect(processed.games[0].delivered).toEqual([
      `${DROP}/TEST00001.vpk`,
      `${DROP}/Demo Vita Homebrew [TEST00001].dpt`,
    ])

    // Sortie conforme : la racine du .vpk est le contenu de app0.
    expect((await ipc.listArchive('sim://out/TEST00001/TEST00001.vpk')).sort()).toEqual([
      'eboot.bin',
      'sce_module/libfactice.suprx',
      'sce_sys/icon0.png',
      'sce_sys/param.sfo',
    ])
    expect(await ipc.readText('sim://out/TEST00001/Demo Vita Homebrew [TEST00001].dpt')).toBe(
      'title=Demo Vita Homebrew\ntitleId=TEST00001\n'
    )
  })

  it('supprime le dossier de travail après traitement', async () => {
    const ipc = makeSimulationVitaIpc()
    await run({ serial: 'sim', files: [HOMEBREW], onStep: () => {}, ipc, options: FAST })
    await expect(ipc.readLocalBytes('sim://work/1/TEST00001/eboot.bin')).rejects.toThrow()
  })

  it('un hash divergent sur la console fait échouer le transfert', async () => {
    const ipc = makeSimulationVitaIpc()
    ipc.sha256Device = vi.fn().mockResolvedValue('0'.repeat(64))
    const res = await run({ serial: 'sim', files: [HOMEBREW], onStep: () => {}, ipc, options: FAST })

    const transfers = res.steps.filter((s) => s.label.includes('Transfert console'))
    expect(transfers).toHaveLength(2)
    expect(transfers.every((s) => s.status === 'failed_after_retries')).toBe(true)
    expect(res.processed[0].games[0].delivered).toEqual([])
    expect(res.overallStatus).toBe('partial')
  })
})

describe('run — cible PC (Vita3K absent)', () => {
  it('copie dans le dossier de sortie configuré, vérifié par taille et hash', async () => {
    const ipc = makeSimulationVitaIpc({ vita3kInstalled: false })
    const res = await run({
      serial: 'sim',
      files: [PUZZLE],
      onStep: () => {},
      ipc,
      options: { ...FAST, pcOutputDir: 'sim://pc/Sortie' },
    })

    expect(res.overallStatus).toBe('success')
    const [processed] = res.processed
    expect(processed.target).toEqual({ kind: 'pc', dir: 'sim://pc/Sortie' })
    expect(processed.games[0].delivered).toEqual([
      'sim://pc/Sortie/TEST00002.vpk',
      'sim://pc/Sortie/Demo Vita Puzzle [TEST00002].dpt',
    ])
    expect(await ipc.sha256Local('sim://pc/Sortie/TEST00002.vpk')).toBe(
      await ipc.sha256Local('sim://out/TEST00002/TEST00002.vpk')
    )
  })

  it('sans console connectée, bascule sur le PC sans interroger ADB', async () => {
    const ipc = makeSimulationVitaIpc()
    ipc.getPackageInfo = vi.fn()
    const res = await run({ serial: '', files: [PUZZLE], onStep: () => {}, ipc, options: FAST })

    expect(ipc.getPackageInfo).not.toHaveBeenCalled()
    expect(res.processed[0].target).toEqual({ kind: 'pc', dir: 'sim://pc/PSVita' })
    const detection = res.steps.find((s) => s.label.includes('Détection de la cible'))!
    expect(detection.note).toMatch(/Aucune console connectée/)
  })

  it('une copie PC de taille divergente est en échec', async () => {
    const ipc = makeSimulationVitaIpc({ vita3kInstalled: false })
    const realSize = ipc.fileSize
    ipc.fileSize = vi.fn(async (p: string) => (p.startsWith('sim://pc/') ? 1 : realSize(p)))
    const res = await run({ serial: 'sim', files: [PUZZLE], onStep: () => {}, ipc, options: FAST })

    const copies = res.steps.filter((s) => s.label.includes('Copie PC'))
    expect(copies).toHaveLength(2)
    expect(copies.every((s) => s.status === 'failed_after_retries')).toBe(true)
  })
})

describe('run — cas limites et échecs explicites', () => {
  it('archive de PSVita/ sans param.sfo → échec « structure non reconnue », aucune sortie', async () => {
    const path = 'C:/Import/PSVita/Vide.zip'
    const ipc = makeSimulationVitaIpc({ archives: { [path]: { 'lisez-moi.txt': text('rien') } } })
    const res = await run({ serial: 'sim', files: [path], onStep: () => {}, ipc, options: FAST })

    const structure = res.steps.find((s) => s.label.includes('Structure PS Vita'))!
    expect(structure.status).toBe('failed_after_retries')
    expect(structure.error).toMatch(/structure PS Vita non reconnue/)
    expect(res.processed[0].games).toEqual([])
    expect(res.steps.some((s) => s.label.includes('Détection de la cible'))).toBe(false)
  })

  it('eboot.bin manquant → recompression en échec, aucun .vpk généré', async () => {
    const path = 'C:/Import/SansEboot.zip'
    const ipc = makeSimulationVitaIpc({
      archives: { [path]: { 'sce_sys/param.sfo': sfo('TEST00003') } },
    })
    const res = await run({ serial: 'sim', files: [path], onStep: () => {}, ipc, options: FAST })

    const vpk = res.steps.find((s) => s.label.includes('Recompression'))!
    expect(vpk.status).toBe('failed_after_retries')
    expect(vpk.error).toMatch(/eboot\.bin/)
    await expect(ipc.listArchive('sim://out/TEST00003/TEST00003.vpk')).rejects.toThrow()
  })

  it('Title ID invalide → lecture param.sfo en échec, jeu non traité', async () => {
    const path = 'C:/Import/MauvaisId.zip'
    const ipc = makeSimulationVitaIpc({
      archives: {
        [path]: {
          'eboot.bin': text('x'),
          'sce_sys/param.sfo': buildSfo({ TITLE: 'X', TITLE_ID: 'BAD' }),
        },
      },
    })
    const res = await run({ serial: 'sim', files: [path], onStep: () => {}, ipc, options: FAST })

    const read = res.steps.find((s) => s.label.includes('Lecture param.sfo'))!
    expect(read.status).toBe('failed_after_retries')
    expect(read.error).toMatch(/TITLE_ID/)
    expect(res.processed[0].games).toEqual([])
  })

  it('arborescence du .vpk incomplète → vérification post-génération en échec', async () => {
    const ipc = makeSimulationVitaIpc()
    const realList = ipc.listArchive
    ipc.listArchive = async (p) => (p.endsWith('.vpk') ? ['eboot.bin'] : realList(p))
    const res = await run({ serial: 'sim', files: [HOMEBREW], onStep: () => {}, ipc, options: FAST })

    const vpk = res.steps.find((s) => s.label.includes('Recompression'))!
    expect(vpk.status).toBe('failed_after_retries')
    expect(vpk.lastValue).toMatchObject({ ok: false, missing: expect.arrayContaining(['sce_sys/param.sfo']) })
    // Seul le .dpt (valide) est livré.
    expect(res.processed[0].games[0].delivered).toEqual([`${DROP}/Demo Vita Homebrew [TEST00001].dpt`])
  })

  it('dump NoNpDrm : patch ignoré (skipped), jeu de base converti avec sa licence', async () => {
    const path = 'C:/Import/NoNpDrm.7z'
    const ipc = makeSimulationVitaIpc({
      archives: {
        [path]: {
          'app/TEST00004/eboot.bin': text('eboot'),
          'app/TEST00004/sce_sys/param.sfo': sfo('TEST00004'),
          'app/TEST00004/sce_sys/package/work.bin': text('licence'),
          'patch/TEST00004/eboot.bin': text('eboot-patch'),
          'patch/TEST00004/sce_sys/param.sfo': sfo('TEST00004'),
        },
      },
    })
    const res = await run({ serial: 'sim', files: [path], onStep: () => {}, ipc, options: FAST })

    const skipped = res.steps.filter((s) => s.status === 'skipped')
    expect(skipped.map((s) => s.label)).toEqual([`NoNpDrm.7z › patch/TEST00004 — Contenu additionnel`])
    expect(res.steps.some((s) => s.status === 'failed_after_retries')).toBe(false)
    expect((await ipc.listArchive('sim://out/TEST00004/TEST00004.vpk')).sort()).toEqual([
      'eboot.bin',
      'sce_sys/package/work.bin',
      'sce_sys/param.sfo',
    ])
    expect(res.overallStatus).toBe('partial')
  })

  it('une archive contenant plusieurs jeux produit une sortie par jeu', async () => {
    const path = 'C:/Import/Pack.zip'
    const ipc = makeSimulationVitaIpc({
      archives: {
        [path]: {
          'JEU1/eboot.bin': text('1'),
          'JEU1/sce_sys/param.sfo': sfo('TEST00005', 'Jeu Un'),
          'JEU2/eboot.bin': text('2'),
          'JEU2/sce_sys/param.sfo': sfo('TEST00006', 'Jeu Deux'),
        },
      },
    })
    const res = await run({ serial: 'sim', files: [path], onStep: () => {}, ipc, options: FAST })

    expect(res.overallStatus).toBe('success')
    expect(res.processed[0].games.map((g) => g.info.titleId)).toEqual(['TEST00005', 'TEST00006'])
    expect(res.processed[0].games.every((g) => g.delivered.length === 2)).toBe(true)
  })
})
