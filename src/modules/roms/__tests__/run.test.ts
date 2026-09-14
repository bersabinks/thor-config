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

    // Les 2 disques PS2 → 2 étapes CHD ignorées.
    const chd = res.steps.filter((s) => s.label.includes('Conversion CHD'))
    expect(chd).toHaveLength(2)
    expect(chd.every((s) => s.status === 'skipped')).toBe(true)

    // Playlist .m3u générée et vérifiée pour Final Fantasy X.
    const m3u = res.steps.find((s) => s.label.includes('.m3u'))
    expect(m3u).toBeDefined()
    expect(m3u!.status).toBe('success')

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
