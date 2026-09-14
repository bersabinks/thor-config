import { runVerifiedAction, type StepResult } from '../../verification'
import {
  isPackageListed,
  parseCount,
  parseResolvedComponent,
  parseResumedPackage,
  parseRoleHolders,
} from './adbParsers'
import configJson from './launcherConfig.json'

export interface LauncherConfig {
  id: string
  displayName: string
  packageName: string
  /** "package/activité" ou ".Activité" ; null = résolue à l'exécution. */
  mainActivity: string | null
}

export const LAUNCHER_CONFIG: LauncherConfig = configJson

export interface LauncherIpc {
  shell(serial: string, cmd: string): Promise<string>
}

export interface LauncherOptions {
  maxRetries?: number
  retryDelayMs?: number
  /** Racine ROMs sur la console (même convention que le module ROMs). */
  romsRemoteBase?: string
  config?: LauncherConfig
}

const HOME_ROLE = 'android.app.role.HOME'

/**
 * Commandes ADB du module. `realClient.shell` rejette sur code de sortie non
 * nul : un grep sans résultat est neutralisé par `|| true`.
 */
export const LAUNCHER_COMMANDS = {
  listPackage: (pkg: string) => `pm list packages ${pkg}`,
  resolveHome: (pkg?: string) =>
    `cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME${pkg ? ` ${pkg}` : ''}`,
  setHomeActivity: (component: string) => `cmd package set-home-activity ${component}`,
  addHomeRoleHolder: (pkg: string) => `cmd role add-role-holder ${HOME_ROLE} ${pkg}`,
  getHomeRoleHolders: `cmd role get-role-holders ${HOME_ROLE}`,
  pressHome: 'input keyevent KEYCODE_HOME',
  resumedActivity: `dumpsys activity activities | grep -E 'topResumedActivity|mResumedActivity' || true`,
  countFiles: (dir: string) => `find '${dir}' -type f 2>/dev/null | wc -l`,
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function makeStep(
  label: string,
  status: StepResult['status'],
  extra: Partial<StepResult> = {}
): StepResult {
  return { label, status, attempts: 0, lastValue: null, timestamp: Date.now(), ...extra }
}

/** Application Home actuelle : rôle HOME (Android 10+), sinon résolution de l'intent HOME. */
async function readCurrentHome(serial: string, ipc: LauncherIpc): Promise<string | null> {
  try {
    const holders = parseRoleHolders(await ipc.shell(serial, LAUNCHER_COMMANDS.getHomeRoleHolders))
    if (holders.length > 0) return holders[0]
  } catch {
    /* service "role" indisponible : repli sur resolve-activity */
  }
  const resolved = parseResolvedComponent(await ipc.shell(serial, LAUNCHER_COMMANDS.resolveHome()))
  return resolved?.packageName ?? null
}

async function resolveHomeComponent(
  serial: string,
  ipc: LauncherIpc,
  cfg: LauncherConfig
): Promise<{ component: string | null; error?: string }> {
  const pkg = cfg.packageName
  if (cfg.mainActivity) {
    return {
      component: cfg.mainActivity.includes('/') ? cfg.mainActivity : `${pkg}/${cfg.mainActivity}`,
    }
  }
  try {
    const resolved = parseResolvedComponent(await ipc.shell(serial, LAUNCHER_COMMANDS.resolveHome(pkg)))
    return { component: resolved?.packageName === pkg ? resolved.component : null }
  } catch (err) {
    return { component: null, error: errorMessage(err) }
  }
}

/**
 * Configure le launcher : présence → bibliothèque → Home par défaut → launcher
 * actif → raccourcis PC. Convention : `skipped` = jamais automatisable en l'état,
 * `failed_after_retries` = objectif non atteint (y compris faute de prérequis).
 */
export async function configureLauncher(
  serial: string,
  ipc: LauncherIpc,
  options: LauncherOptions = {}
): Promise<StepResult[]> {
  const cfg = options.config ?? LAUNCHER_CONFIG
  const retry = { maxRetries: options.maxRetries ?? 2, retryDelayMs: options.retryDelayMs ?? 2000 }
  const romsDir = options.romsRemoteBase ?? '/sdcard/ROMs'
  const name = cfg.displayName
  const pkg = cfg.packageName
  const steps: StepResult[] = []

  // ── 1. Présence (aucune source APK vérifiée : détection uniquement) ─────────
  const presence = await runVerifiedAction<boolean>({
    label: `${name} — Présence du launcher`,
    apply: async () => {},
    check: async () => isPackageListed(await ipc.shell(serial, LAUNCHER_COMMANDS.listPackage(pkg)), pkg),
    expected: (listed) => listed,
    expectedDescription: `package ${pkg} listé par pm list packages`,
    ...retry,
  })
  const installed = presence.status === 'success'
  steps.push(
    installed
      ? { ...presence, note: 'Détecté sur la console (aucune source APK officielle vérifiée : pas d’installation automatique).' }
      : {
          ...presence,
          error: `${pkg} absent de la console : aucune source APK officielle vérifiée, installation automatique impossible. ${presence.error ?? ''}`.trim(),
        }
  )

  // ── 2. Bibliothèque : rescan + scraping ─────────────────────────────────────
  let romCount: number | null = null
  try {
    romCount = parseCount(await ipc.shell(serial, LAUNCHER_COMMANDS.countFiles(romsDir)))
  } catch {
    romCount = null
  }
  steps.push(
    makeStep(`${name} — Bibliothèque (rescan + scraping)`, 'skipped', {
      lastValue: romCount,
      note:
        (romCount !== null ? `${romCount} fichier(s) présent(s) dans ${romsDir}. ` : '') +
        `Rescan et comparaison non automatisables : aucun intent ADB connu pour ${name}, et sa base de données locale est dans Android/data (inaccessible par ADB sans root).`,
    })
  )

  // ── 3. Home par défaut ──────────────────────────────────────────────────────
  const homeLabel = `${name} — Définition comme Home`
  const activeLabel = `${name} — Launcher actif`
  let homeOk = false

  if (!installed) {
    steps.push(makeStep(homeLabel, 'failed_after_retries', { error: 'Prérequis non rempli : launcher absent' }))
  } else {
    const { component, error } = await resolveHomeComponent(serial, ipc, cfg)
    if (!component) {
      steps.push(
        makeStep(homeLabel, 'failed_after_retries', {
          attempts: 1,
          error:
            `Aucune activité HOME résolue pour ${pkg}${error ? ` (${error})` : ''} : ` +
            'renseigner mainActivity dans src/modules/launcher/launcherConfig.json.',
        })
      )
    } else {
      const homeStep = await runVerifiedAction<string | null>({
        label: homeLabel,
        apply: async () => {
          let output: string
          try {
            output = await ipc.shell(serial, LAUNCHER_COMMANDS.setHomeActivity(component))
          } catch (err) {
            output = errorMessage(err)
          }
          // Repli Android 10+ : attribution directe du rôle HOME.
          if (!/success/i.test(output)) {
            await ipc.shell(serial, LAUNCHER_COMMANDS.addHomeRoleHolder(pkg))
          }
        },
        check: () => readCurrentHome(serial, ipc),
        expected: (current) => current === pkg,
        expectedDescription: `application Home par défaut = ${pkg}`,
        ...retry,
      })
      homeOk = homeStep.status === 'success'
      steps.push(homeOk ? { ...homeStep, note: `Composant : ${component}` } : homeStep)
    }
  }

  // ── 4. Launcher actif (HOME → activité au premier plan) ─────────────────────
  if (!homeOk) {
    steps.push(
      makeStep(activeLabel, 'failed_after_retries', {
        error: 'Prérequis non rempli : launcher non défini comme Home',
      })
    )
  } else {
    steps.push(
      await runVerifiedAction<string | null>({
        label: activeLabel,
        apply: async () => {
          await ipc.shell(serial, LAUNCHER_COMMANDS.pressHome)
        },
        check: async () =>
          parseResumedPackage(await ipc.shell(serial, LAUNCHER_COMMANDS.resumedActivity)),
        expected: (resumed) => resumed === pkg,
        expectedDescription: `activité au premier plan appartenant à ${pkg} après appui sur HOME`,
        ...retry,
      })
    )
  }

  // ── 5. Raccourcis jeux PC (« invalid launch shortcut ») ─────────────────────
  steps.push(
    makeStep(`${name} — Raccourcis jeux PC (Steam)`, 'skipped', {
      note:
        `Détection/régénération des raccourcis cassés non automatisable : l’application de lancement des jeux PC n’est pas identifiée, et les raccourcis de ${name} sont stockés dans Android/data (inaccessibles par ADB sans root).`,
    })
  )

  return steps
}
