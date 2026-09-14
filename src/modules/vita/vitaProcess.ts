import { runVerifiedAction, type StepResult } from '../../verification'
import { readTitleInfo, type VitaTitleInfo } from './sfo'
import {
  classifyRoots,
  filesUnderRoot,
  missingRequiredFiles,
  verifyTree,
  vpkFileName,
  PARAM_SFO_REL,
  type TreeCheck,
} from './layout'
import { dptFileName, generateDpt, parseDpt } from './dpt'
import targetsJson from './vitaTargets.json'

export interface VitaTargets {
  vita3kPackageName: string
  deviceDropDir: string
}

export const VITA_TARGETS: VitaTargets = targetsJson

export interface VitaIpc {
  // ── Archives & fichiers locaux ──────────────────────────────────────────────
  /** Fichiers (pas les dossiers) d'une archive .zip / .7z / .vpk. */
  listArchive(archivePath: string): Promise<string[]>
  /** Extrait dans un dossier de travail temporaire ; fichiers relatifs, séparateur '/'. */
  extractArchive(archivePath: string): Promise<{ workDir: string; files: string[] }>
  readLocalBytes(localPath: string): Promise<Uint8Array>
  /** Dossier local où générer les fichiers d'un Title ID. */
  prepareOutputDir(titleId: string): Promise<string>
  createZipFromDir(sourceDir: string, outPath: string): Promise<void>
  writeText(localPath: string, content: string): Promise<void>
  readText(localPath: string): Promise<string>
  sha256Local(localPath: string): Promise<string>
  fileSize(localPath: string): Promise<number>
  copyLocal(sourcePath: string, destPath: string): Promise<void>
  /** Dossier de sortie PC : celui configuré, ou le dossier par défaut s'il est vide. */
  resolvePcOutputDir(configured: string): Promise<string>
  removeWorkDir(workDir: string): Promise<void>
  // ── Appareil ────────────────────────────────────────────────────────────────
  getPackageInfo(serial: string, packageName: string): Promise<{ versionName: string } | null>
  ensureRemoteDir(serial: string, remoteDir: string): Promise<void>
  pushFile(serial: string, localPath: string, remotePath: string): Promise<void>
  sha256Device(serial: string, remotePath: string): Promise<string>
}

export interface VitaOptions {
  maxRetries?: number
  retryDelayMs?: number
  /** Dossier de sortie PC configuré ('' = dossier par défaut). */
  pcOutputDir?: string
}

export interface VitaTarget {
  kind: 'device' | 'pc'
  dir: string
}

export interface VitaGameOutput {
  root: string
  info: VitaTitleInfo
  /** Chemins finaux (console ou PC) des fichiers livrés et vérifiés. */
  delivered: string[]
}

export interface VitaProcessResult {
  file: string
  target: VitaTarget | null
  games: VitaGameOutput[]
  steps: StepResult[]
}

interface Retry {
  maxRetries: number
  retryDelayMs: number
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

function joinPath(...parts: string[]): string {
  return parts
    .filter((p) => p !== '')
    .map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, '') : p.replace(/^[\\/]+|[\\/]+$/g, '')))
    .join('/')
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function makeStep(
  label: string,
  status: StepResult['status'],
  extra: Partial<StepResult> = {}
): StepResult {
  return { label, status, attempts: 1, lastValue: null, timestamp: Date.now(), ...extra }
}

/**
 * Traite une archive PS Vita : extraction → détection de structure → cible →
 * pour chaque jeu : lecture param.sfo → .vpk vérifié → .dpt vérifié → livraison
 * vérifiée (console par hash, ou PC par taille + hash). Le dossier de travail
 * est toujours nettoyé.
 */
export async function processVitaArchive(
  serial: string,
  archivePath: string,
  ipc: VitaIpc,
  options: VitaOptions = {}
): Promise<VitaProcessResult> {
  const retry: Retry = {
    maxRetries: options.maxRetries ?? 2,
    retryDelayMs: options.retryDelayMs ?? 2000,
  }
  const name = basename(archivePath)
  const steps: StepResult[] = []
  const games: VitaGameOutput[] = []
  const work = { dir: '', files: [] as string[] }

  async function cleanup(): Promise<void> {
    if (!work.dir) return
    try {
      await ipc.removeWorkDir(work.dir)
    } catch {
      /* nettoyage best-effort */
    }
  }

  // ── Étape 1 : Extraction ────────────────────────────────────────────────────
  const extractStep = await runVerifiedAction<number>({
    label: `${name} — Extraction`,
    apply: async () => {
      await cleanup() // une tentative précédente a pu laisser un dossier partiel
      const r = await ipc.extractArchive(archivePath)
      work.dir = r.workDir
      work.files = r.files
    },
    check: async () => work.files.length,
    expected: (n) => n > 0,
    expectedDescription: 'au moins un fichier extrait',
    ...retry,
  })
  steps.push(extractStep)
  if (extractStep.status !== 'success') {
    await cleanup()
    return { file: name, target: null, games, steps }
  }

  try {
    // ── Étape 2 : Structure PS Vita (param.sfo présent après extraction) ──────
    const { games: roots, extras } = classifyRoots(work.files)
    if (roots.length === 0) {
      steps.push(
        makeStep(`${name} — Structure PS Vita`, 'failed_after_retries', {
          error: `Aucun ${PARAM_SFO_REL} trouvé après extraction : structure PS Vita non reconnue`,
        })
      )
      return { file: name, target: null, games, steps }
    }
    steps.push(makeStep(`${name} — Structure PS Vita`, 'success', { lastValue: roots }))
    for (const extra of extras) {
      steps.push(
        makeStep(`${name} › ${extra} — Contenu additionnel`, 'skipped', {
          note: 'Patch ou DLC détecté : non converti automatiquement, seul le jeu de base est traité.',
        })
      )
    }

    // ── Étape 3 : Détection de la cible (console ou PC) ───────────────────────
    const detection = await detectTarget(serial, name, ipc, options.pcOutputDir ?? '')
    steps.push(detection.step)
    const target = detection.target

    for (const root of roots) {
      const game = await processGame(serial, name, work, root, target, ipc, retry, steps)
      if (game) games.push(game)
    }
    return { file: name, target, games, steps }
  } finally {
    await cleanup()
  }
}

async function detectTarget(
  serial: string,
  name: string,
  ipc: VitaIpc,
  pcOutputDir: string
): Promise<{ target: VitaTarget | null; step: StepResult }> {
  const label = `${name} — Détection de la cible`
  const pkg = VITA_TARGETS.vita3kPackageName

  let installed = false
  let noConsoleReason: string | undefined
  if (!serial) {
    noConsoleReason = 'Aucune console connectée'
  } else {
    try {
      installed = (await ipc.getPackageInfo(serial, pkg)) !== null
    } catch (err) {
      noConsoleReason = `Console injoignable (${errorMessage(err)})`
    }
  }

  if (installed) {
    const dir = VITA_TARGETS.deviceDropDir
    return {
      target: { kind: 'device', dir },
      step: makeStep(label, 'success', {
        lastValue: 'device',
        note: `Vita3K (${pkg}) présent sur la console : dépôt dans ${dir}`,
      }),
    }
  }

  let dir: string
  try {
    dir = await ipc.resolvePcOutputDir(pcOutputDir)
  } catch (err) {
    return {
      target: null,
      step: makeStep(label, 'failed_after_retries', {
        error: `Vita3K absent de la console et dossier de sortie PC indisponible : ${errorMessage(err)}`,
      }),
    }
  }
  const reason = noConsoleReason ?? `Vita3K (${pkg}) absent de la console`
  return {
    target: { kind: 'pc', dir },
    step: makeStep(label, 'success', { lastValue: 'pc', note: `${reason} : sortie PC dans ${dir}` }),
  }
}

async function processGame(
  serial: string,
  name: string,
  work: { dir: string; files: string[] },
  root: string,
  target: VitaTarget | null,
  ipc: VitaIpc,
  retry: Retry,
  steps: StepResult[]
): Promise<VitaGameOutput | null> {
  const rootDir = joinPath(work.dir, root)
  const rootFiles = filesUnderRoot(work.files, root)

  // ── Lecture param.sfo (déterministe, sans retry) ────────────────────────────
  const sfoLabel = `${name} › ${root || '.'} — Lecture param.sfo`
  const sfoRel = rootFiles.find((f) => f.toLowerCase() === PARAM_SFO_REL) ?? PARAM_SFO_REL
  let info: VitaTitleInfo
  try {
    info = readTitleInfo(await ipc.readLocalBytes(joinPath(rootDir, sfoRel)))
  } catch (err) {
    steps.push(makeStep(sfoLabel, 'failed_after_retries', { error: errorMessage(err) }))
    return null
  }
  steps.push(makeStep(sfoLabel, 'success', { lastValue: info }))

  const prefix = `${info.title} [${info.titleId}]`
  const game: VitaGameOutput = { root, info, delivered: [] }
  const generated: string[] = []
  const out = { dir: '' }
  async function outputDir(): Promise<string> {
    if (!out.dir) out.dir = await ipc.prepareOutputDir(info.titleId)
    return out.dir
  }

  // ── Recompression au format Vita3K (.vpk) ───────────────────────────────────
  const vpkLabel = `${prefix} — Recompression Vita3K`
  const missing = missingRequiredFiles(rootFiles)
  if (missing.length > 0) {
    steps.push(
      makeStep(vpkLabel, 'failed_after_retries', {
        error: `Structure app0 incomplète : ${missing.join(', ')} manquant(s)`,
      })
    )
    return game
  }
  let vpkPath = ''
  const vpkStep = await runVerifiedAction<TreeCheck>({
    label: vpkLabel,
    apply: async () => {
      vpkPath = joinPath(await outputDir(), vpkFileName(info.titleId))
      await ipc.createZipFromDir(rootDir, vpkPath)
    },
    check: async () => verifyTree(await ipc.listArchive(vpkPath), rootFiles),
    expected: (t) => t.ok,
    expectedDescription:
      'arborescence du .vpk identique aux fichiers app0 extraits (eboot.bin et sce_sys/param.sfo présents)',
    ...retry,
  })
  steps.push(vpkStep)
  if (vpkStep.status === 'success') generated.push(vpkPath)

  // ── Descripteur .dpt ─────────────────────────────────────────────────────────
  let dptPath = ''
  const content = generateDpt(info)
  const dptStep = await runVerifiedAction<boolean>({
    label: `${prefix} — Génération .dpt`,
    apply: async () => {
      dptPath = joinPath(await outputDir(), dptFileName(info))
      await ipc.writeText(dptPath, content)
    },
    check: async () => {
      const parsed = parseDpt(await ipc.readText(dptPath))
      return parsed.title === info.title && parsed.titleId === info.titleId
    },
    expected: (ok) => ok,
    expectedDescription: '.dpt relu avec le titre et le Title ID du param.sfo',
    ...retry,
  })
  steps.push(dptStep)
  if (dptStep.status === 'success') generated.push(dptPath)

  // ── Livraison vérifiée ───────────────────────────────────────────────────────
  if (!target) return game
  for (const localPath of generated) {
    const step = await deliver(serial, prefix, localPath, target, ipc, retry)
    steps.push(step)
    if (step.status === 'success') game.delivered.push(step.lastValue as string)
  }
  return game
}

async function deliver(
  serial: string,
  prefix: string,
  localPath: string,
  target: VitaTarget,
  ipc: VitaIpc,
  retry: Retry
): Promise<StepResult> {
  const fileName = basename(localPath)

  if (target.kind === 'device') {
    const remotePath = `${target.dir}/${fileName}`
    const step = await runVerifiedAction<boolean>({
      label: `${prefix} — Transfert console (${fileName})`,
      apply: async () => {
        await ipc.ensureRemoteDir(serial, target.dir)
        await ipc.pushFile(serial, localPath, remotePath)
      },
      check: async () => {
        const [local, device] = await Promise.all([
          ipc.sha256Local(localPath),
          ipc.sha256Device(serial, remotePath),
        ])
        return local.length > 0 && local.toLowerCase() === device.toLowerCase()
      },
      expected: (ok) => ok,
      expectedDescription: 'hash SHA-256 identique entre le fichier généré et le fichier sur la console',
      ...retry,
    })
    return step.status === 'success' ? { ...step, lastValue: remotePath } : step
  }

  const destPath = joinPath(target.dir, fileName)
  const step = await runVerifiedAction<{ sizeOk: boolean; hashOk: boolean }>({
    label: `${prefix} — Copie PC (${fileName})`,
    apply: async () => {
      await ipc.copyLocal(localPath, destPath)
    },
    check: async () => {
      const [srcSize, destSize, srcHash, destHash] = await Promise.all([
        ipc.fileSize(localPath),
        ipc.fileSize(destPath),
        ipc.sha256Local(localPath),
        ipc.sha256Local(destPath),
      ])
      return { sizeOk: srcSize === destSize, hashOk: srcHash.length > 0 && srcHash === destHash }
    },
    expected: (r) => r.sizeOk && r.hashOk,
    expectedDescription: 'taille et hash SHA-256 identiques entre le fichier généré et la copie',
    ...retry,
  })
  return step.status === 'success' ? { ...step, lastValue: destPath } : step
}
