import type { StepResult } from '../../verification'
import { deriveModuleStatus, type ModuleResult, type RunContext, type ThorModule } from './types'

import { run as runPrepare } from '../prepare'
import { run as runEmulators } from '../emulators'
import sources from '../emulators/sources.json'
import { run as runRoms } from '../roms'
import { makeDefaultRomsIpc, makeSimulationRomsIpc, SIMULATION_SAMPLE_FILES } from '../roms/romsIpc'
import { runInitialBackups, makeDefaultSavesIpc, makeSimulationSavesIpc } from '../saves'
import {
  run as runVita,
  selectVitaArchives,
  isVitaArchiveCandidate,
  makeDefaultVitaIpc,
  makeSimulationVitaIpc,
  SIMULATION_IMPORT_FILES,
  type VitaIpc,
} from '../vita'
import { run as runLauncher, makeDefaultLauncherIpc, makeSimulationLauncherIpc } from '../launcher'
import { run as runUtilities } from '../utilities'

export interface BuildModulesOptions {
  simulation: boolean
  importFolder?: string
  vitaOutputFolder?: string
  romsParallelism?: number
}

/**
 * Ids des émulateurs dont l'installation a réussi lors d'un run — dérivés des
 * résultats du module Émulateurs, comme le fait l'écran Émulateurs. Sert de
 * dépendance au module Sauvegardes (sauvegarde « état initial »).
 */
function installedEmulatorIds(previousResults: ReadonlyArray<ModuleResult>): string[] {
  const emu = previousResults.find((r) => r.moduleId === 'emulators')
  if (!emu) return []
  return sources
    .filter((s) =>
      emu.steps.some(
        (step) => step.label === `${s.displayName} — Installation` && step.status === 'success'
      )
    )
    .map((s) => s.id)
}

/** Fabrique un wrapper de module à partir d'une fonction qui remonte ses étapes via onStep. */
function makeModule(
  id: string,
  displayName: string,
  runner: (ctx: RunContext, onStep: (s: StepResult) => void) => Promise<void>,
  extras: Partial<Pick<ThorModule, 'shouldRun' | 'skipReason'>> = {}
): ThorModule {
  return {
    id,
    displayName,
    ...extras,
    run: async (ctx) => {
      const steps: StepResult[] = []
      const onStep = (s: StepResult) => {
        steps.push(s)
        ctx.onStep(s)
      }
      await runner(ctx, onStep)
      return { moduleId: id, displayName, steps, overallStatus: deriveModuleStatus(steps) }
    },
  }
}

/**
 * Assemble la liste ordonnée des modules derrière le bouton unique :
 * Préparation → Émulateurs → ROMs → Sauvegardes → PS Vita → Launcher → Utilitaires.
 *
 * La découverte des fichiers du dossier d'import est faite ici (avant le run) :
 * en réel via roms:listImportFiles, en simulation via les lots d'exemple. ROMs
 * et PS Vita ne s'exécutent que s'ils ont effectivement quelque chose à traiter.
 */
export async function buildThorModules(opts: BuildModulesOptions): Promise<ThorModule[]> {
  const { simulation } = opts

  // ── Découverte des fichiers à traiter (ROMs vs archives PS Vita) ────────────
  const romsIpc = simulation ? makeSimulationRomsIpc() : makeDefaultRomsIpc()
  const vitaIpc: VitaIpc = simulation ? makeSimulationVitaIpc() : makeDefaultVitaIpc()

  let romsFiles: string[]
  let vitaArchives: string[]
  if (simulation) {
    romsFiles = SIMULATION_SAMPLE_FILES
    vitaArchives = await selectVitaArchives(SIMULATION_IMPORT_FILES, vitaIpc)
  } else {
    const allFiles = await window.electronAPI.roms.listImportFiles(opts.importFolder ?? '')
    romsFiles = allFiles.filter((f) => !isVitaArchiveCandidate(f))
    vitaArchives = await selectVitaArchives(allFiles, vitaIpc)
  }

  const modules: ThorModule[] = []

  // ── 1. Préparation ──────────────────────────────────────────────────────────
  modules.push(
    makeModule('prepare', 'Préparation', async (ctx, onStep) => {
      await runPrepare({ serial: ctx.serial, onStep })
    })
  )

  // ── 2. Émulateurs ───────────────────────────────────────────────────────────
  modules.push(
    makeModule('emulators', 'Émulateurs', async (ctx, onStep) => {
      await runEmulators({ serial: ctx.serial, onStep })
    })
  )

  // ── 3. ROMs (si le dossier d'import contient des fichiers) ──────────────────
  modules.push(
    makeModule(
      'roms',
      'ROMs',
      async (ctx, onStep) => {
        await runRoms({
          serial: ctx.serial,
          files: romsFiles,
          onStep,
          ipc: romsIpc,
          options: { parallelism: opts.romsParallelism ?? 2 },
        })
      },
      {
        shouldRun: () => romsFiles.length > 0,
        skipReason: () =>
          simulation
            ? 'Aucun fichier d’exemple à traiter.'
            : 'Aucun fichier de jeu dans le dossier d’import — rien à ranger.',
      }
    )
  )

  // ── 4. Sauvegardes (état initial des émulateurs installés) ──────────────────
  modules.push(
    makeModule(
      'saves',
      'Sauvegardes',
      async (ctx, onStep) => {
        const ids = installedEmulatorIds(ctx.previousResults)
        const savesIpc = simulation ? makeSimulationSavesIpc() : makeDefaultSavesIpc()
        await runInitialBackups(ctx.serial, ids, savesIpc, onStep, {
          maxRetries: simulation ? 1 : 2,
          retryDelayMs: simulation ? 0 : 2000,
        })
      },
      {
        shouldRun: (ctx) => installedEmulatorIds(ctx.previousResults).length > 0,
        skipReason: () =>
          'Aucun émulateur installé avec succès — pas de sauvegarde initiale à créer.',
      }
    )
  )

  // ── 5. PS Vita (si des archives PS Vita ont été détectées) ──────────────────
  modules.push(
    makeModule(
      'vita',
      'PS Vita',
      async (ctx, onStep) => {
        await runVita({
          serial: ctx.serial,
          files: vitaArchives,
          onStep,
          ipc: vitaIpc,
          options: { pcOutputDir: opts.vitaOutputFolder },
        })
      },
      {
        shouldRun: () => vitaArchives.length > 0,
        skipReason: () => 'Aucune archive PS Vita détectée dans le dossier d’import.',
      }
    )
  )

  // ── 6. Launcher ─────────────────────────────────────────────────────────────
  modules.push(
    makeModule('launcher', 'Launcher', async (ctx, onStep) => {
      await runLauncher({
        serial: ctx.serial,
        onStep,
        ipc: simulation ? makeSimulationLauncherIpc() : makeDefaultLauncherIpc(),
        options: simulation ? { retryDelayMs: 300 } : undefined,
      })
    })
  )

  // ── 7. Utilitaires (ClusterTune, Final ROM, ZArchiver) ──────────────────────
  modules.push(
    makeModule('utilities', 'Utilitaires', async (ctx, onStep) => {
      await runUtilities({
        serial: ctx.serial,
        onStep,
        options: simulation ? { retryDelayMs: 300 } : undefined,
      })
    })
  )

  return modules
}
