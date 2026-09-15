import { describe, it, expect, vi } from 'vitest'
import { run } from '../index'
import { makeSimulationRomsIpc, SIMULATION_SAMPLE_FILES } from '../romsIpc'
import type { StepResult } from '../../../verification'

const FAST = { maxRetries: 0, retryDelayMs: 0, parallelism: 2 }

describe('run — lot de simulation', () => {
  it('identifie tout, ignore la conversion CHD (chdman absent) et génère le .m3u multi-disques', async () => {
    const steps: StepResult[] = []
    const ipc = makeSimulationRomsIpc()
    const res = await run({
      serial: 'sim',
      files: SIMULATION_SAMPLE_FILES,
      onStep: (s) => steps.push(s),
      ipc,
      options: FAST,
    })

    // Toutes les identifications réussissent.
    const idSteps = res.steps.filter((s) => s.label.includes('Identification'))
    expect(idSteps).toHaveLength(SIMULATION_SAMPLE_FILES.length)
    expect(idSteps.every((s) => s.status === 'success')).toBe(true)

    // Systèmes CD-ROM (2 disques PS2 + 2 disques PS1) → 4 étapes CHD ignorées.
    const chd = res.steps.filter((s) => s.label.includes('Conversion CHD'))
    expect(chd).toHaveLength(4)
    expect(chd.every((s) => s.status === 'skipped')).toBe(true)

    // Rangement par système, dont les deux nouveaux (ES-DE : psp et psx).
    const folders = Object.fromEntries(res.processed.map((p) => [p.file, p.system?.folder]))
    expect(folders['God of War (USA).iso']).toBe('psp')
    expect(folders['Metal Gear Solid (USA) (Disc 1).bin']).toBe('psx')
    expect(folders['Final Fantasy X (USA) (Disc 1).iso']).toBe('ps2')

    // Playlists .m3u : Final Fantasy X (PS2) et Metal Gear Solid (PS1).
    const m3u = res.steps.filter((s) => s.label.includes('.m3u'))
    expect(m3u.map((s) => s.label.split(' —')[0]).sort()).toEqual([
      'Final Fantasy X (USA).m3u',
      'Metal Gear Solid (USA).m3u',
    ])
    expect(m3u.every((s) => s.status === 'success')).toBe(true)

    // Présence de skipped sans échec → statut global 'partial'.
    expect(res.overallStatus).toBe('partial')

    // onStep a bien reçu chaque étape.
    expect(steps).toHaveLength(res.steps.length)
  })

  it('un transfert au hash divergent est marqué en échec', async () => {
    const ipc = makeSimulationRomsIpc()
    ipc.sha256Device = vi.fn().mockResolvedValue('0000')
    const res = await run({
      serial: 'sim',
      files: ['Mario Kart DS (USA).nds'],
      onStep: () => {},
      ipc,
      options: { maxRetries: 0, retryDelayMs: 0 },
    })

    const transfer = res.steps.find((s) => s.label.includes('Transfert'))!
    expect(transfer.status).toBe('failed_after_retries')
    // Identification OK + transfert KO → statut mixte 'partial'.
    expect(res.overallStatus).toBe('partial')
  })
})
