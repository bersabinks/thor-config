import { runVerifiedAction, type StepResult } from '../../verification'
import { processRom, type RomsIpc, type ProcessOptions, type ProcessResult } from './romsProcess'
import { groupMultiDisc, generateM3u, m3uFileName } from './grouping'

export interface RomsRunContext {
  serial: string
  files: string[]
  onStep: (result: StepResult) => void
  ipc: RomsIpc
  options?: ProcessOptions & { parallelism?: number }
}

export interface RomsModuleResult {
  moduleId: 'roms'
  steps: StepResult[]
  processed: ProcessResult[]
  overallStatus: 'success' | 'partial' | 'failed'
}

/**
 * Traite une file de fichiers ROM avec une limite de parallélisme, puis génère
 * les playlists .m3u pour les jeux multi-disques. Chaque StepResult est remonté
 * via onStep au fur et à mesure.
 */
export async function run(ctx: RomsRunContext): Promise<RomsModuleResult> {
  const { serial, files, onStep, ipc } = ctx
  const parallelism = Math.max(1, ctx.options?.parallelism ?? 1)
  const base = ctx.options?.romsRemoteBase ?? '/sdcard/ROMs'
  const steps: StepResult[] = []
  const processed: ProcessResult[] = []

  // ── File de traitement avec pool de workers (limite le débit USB) ──────────
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < files.length) {
      const i = cursor++
      const res = await processRom(serial, files[i], ipc, ctx.options)
      processed[i] = res
      for (const s of res.steps) {
        steps.push(s)
        onStep(s)
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(parallelism, Math.max(files.length, 1)) }, worker)
  )

  // ── Playlists .m3u pour les groupes multi-disques ──────────────────────────
  for (const group of groupMultiDisc(files)) {
    const member = processed.find((p) => p && group.files.includes(p.file))
    const folder = member?.system?.folder
    if (!folder) continue // aucun disque du groupe n'a pu être identifié

    const content = generateM3u(group)
    const remotePath = `${base}/${folder}/${m3uFileName(group)}`
    const m3uStep = await runVerifiedAction<boolean>({
      label: `${m3uFileName(group)} — Playlist multi-disques`,
      apply: async () => {
        await ipc.writeRemoteText(serial, remotePath, content)
      },
      check: async () => (await ipc.readRemoteText(serial, remotePath)) === content,
      expected: (ok) => ok === true,
      expectedDescription: 'playlist .m3u relue identique sur la console',
      maxRetries: ctx.options?.maxRetries ?? 2,
      retryDelayMs: ctx.options?.retryDelayMs ?? 2000,
    })
    steps.push(m3uStep)
    onStep(m3uStep)
  }

  const failed = steps.filter((s) => s.status === 'failed_after_retries').length
  const success = steps.filter((s) => s.status === 'success').length
  const skipped = steps.filter((s) => s.status === 'skipped').length

  let overallStatus: RomsModuleResult['overallStatus']
  if (failed === 0 && skipped === 0) overallStatus = 'success'
  else if (success === 0 && skipped === 0) overallStatus = 'failed'
  else overallStatus = 'partial'

  return { moduleId: 'roms', steps, processed, overallStatus }
}
