import { runVerifiedAction, type StepResult } from '../../verification'
import { processRom, type RomsIpc, type ProcessOptions, type ProcessResult } from './romsProcess'
import { groupMultiDisc, generateM3u, m3uFileName } from './grouping'
import { isBiosFile, selectBiosFiles } from '../bios/biosDetect'
import { runBios, type BiosIpc } from '../bios/biosProcess'

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
 * Traite une file de fichiers ROM et BIOS avec une limite de parallélisme.
 * Les BIOS / firmwares sont détectés et déployés vers /sdcard/BIOS/ et /sdcard/ROMs/bios/,
 * puis les ROMs de jeux sont classées par système et les playlists .m3u générées.
 * Chaque StepResult est remonté via onStep au fur et à mesure.
 */
export async function run(ctx: RomsRunContext): Promise<RomsModuleResult> {
  const { serial, files, onStep, ipc } = ctx
  const parallelism = Math.max(1, ctx.options?.parallelism ?? 1)
  const base = ctx.options?.romsRemoteBase ?? '/sdcard/ROMs'
  const steps: StepResult[] = []
  const processed: ProcessResult[] = []

  // ── 1. Déploiement des BIOS & firmwares si présents ───────────────────────
  const biosCandidates = selectBiosFiles(files)
  const gameFiles = files.filter((f) => !isBiosFile(f))

  if (biosCandidates.length > 0) {
    const biosIpc: BiosIpc = {
      sha256Local: (path) => ipc.sha256Local(path),
      sha256Device: (serial, path) => ipc.sha256Device(serial, path),
      ensureRemoteDir: (serial, dir) => ipc.ensureRemoteDir(serial, dir),
      pushFile: (serial, localPath, remotePath) => ipc.pushRom(serial, localPath, remotePath),
    }
    const biosSteps = await runBios({
      serial,
      candidates: biosCandidates,
      onStep,
      ipc: biosIpc,
      maxRetries: ctx.options?.maxRetries,
      retryDelayMs: ctx.options?.retryDelayMs,
    })
    steps.push(...biosSteps)
  }

  // ── 2. File de traitement ROMs avec pool de workers (limite le débit USB) ──
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < gameFiles.length) {
      const i = cursor++
      const res = await processRom(serial, gameFiles[i], ipc, ctx.options)
      processed[i] = res
      for (const s of res.steps) {
        steps.push(s)
        onStep(s)
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(parallelism, Math.max(gameFiles.length, 1)) }, worker)
  )

  // ── 3. Playlists .m3u pour les groupes multi-disques ──────────────────────
  for (const group of groupMultiDisc(gameFiles)) {
    const member = processed.find((p) => p && group.files.includes(p.file))
    const folder = member?.system?.folder
    if (!folder) continue // aucun disque du groupe n'a pu être identifié
    // Playlists réservées aux systèmes multi-disques (CD-ROM) : un « (Disc 2) »
    // sur un système mono-support ne doit pas produire de .m3u parasite.
    if (!member?.system?.multiDisc) continue

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
