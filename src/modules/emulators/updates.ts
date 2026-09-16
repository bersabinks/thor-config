import type { StepResult } from '../../verification'
import { describeError } from '../../../electron/main/adb/errors'
import {
  installApp,
  makeDefaultIpc,
  type EmulatorIpc,
  type EmulatorSource,
  type InstallOptions,
} from './emulatorInstall'
import { OBTAINIUM_SOURCE } from './obtainium'
import { compareVersions } from './versions'
import sourcesJson from './sources.json'

const sources = sourcesJson as EmulatorSource[]

export type UpdateState =
  | 'up-to-date'
  | 'update-available'
  | 'not-installed'
  /** Installé, mais version publiée non consultable (Google Play). */
  | 'manual'
  /** Versions non comparables ou dépôt injoignable. */
  | 'unknown'

export interface UpdateStatus {
  source: EmulatorSource
  installedVersion: string | null
  latestVersion: string | null
  state: UpdateState
  error?: string
}

export interface UpdatesIpc extends EmulatorIpc {
  latestVersion(source: EmulatorSource): Promise<{ version: string }>
}

export function makeDefaultUpdatesIpc(): UpdatesIpc {
  return {
    ...makeDefaultIpc(),
    latestVersion: (source) => window.electronAPI.emulators.latestVersion(source),
  }
}

/**
 * État de mise à jour d'un émulateur : version installée lue sur la console
 * (dumpsys package via getPackageInfo) comparée à la dernière version publiée.
 */
export async function checkUpdate(
  serial: string,
  source: EmulatorSource,
  ipc: UpdatesIpc
): Promise<UpdateStatus> {
  let installedVersion: string | null = null
  try {
    installedVersion = (await ipc.getPackageInfo(serial, source.packageName))?.versionName ?? null
  } catch (err) {
    return { source, installedVersion: null, latestVersion: null, state: 'unknown', error: describeError(err) }
  }
  if (installedVersion === null) {
    return { source, installedVersion: null, latestVersion: null, state: 'not-installed' }
  }
  // Google Play : aucune version publiée consultable sans le Play Store.
  if (source.sourceType === 'playstore') {
    return { source, installedVersion, latestVersion: null, state: 'manual' }
  }

  let latestVersion: string
  try {
    latestVersion = (await ipc.latestVersion(source)).version
  } catch (err) {
    return { source, installedVersion, latestVersion: null, state: 'unknown', error: describeError(err) }
  }

  const cmp = compareVersions(installedVersion, latestVersion)
  return {
    source,
    installedVersion,
    latestVersion,
    state: cmp === null ? 'unknown' : cmp < 0 ? 'update-available' : 'up-to-date',
    ...(cmp === null ? { error: `Versions non comparables : « ${installedVersion} » / « ${latestVersion} »` } : {}),
  }
}

export async function checkUpdates(
  serial: string,
  ipc: UpdatesIpc,
  list: readonly EmulatorSource[] = sources
): Promise<UpdateStatus[]> {
  const out: UpdateStatus[] = []
  for (const source of list) out.push(await checkUpdate(serial, source, ipc))
  return out
}

/**
 * Met à jour un émulateur en réutilisant le pipeline d'installation
 * (téléchargement vérifié → installation vérifiée par pm).
 */
export async function updateEmulator(
  serial: string,
  source: EmulatorSource,
  ipc: UpdatesIpc,
  onStep: (step: StepResult) => void,
  options: InstallOptions = {}
): Promise<StepResult[]> {
  const steps = await installApp(serial, source, ipc, options)
  steps.forEach(onStep)
  return steps
}

/** Obtainium présent sur la console : il surveille déjà ces mises à jour. */
export async function isObtainiumInstalled(serial: string, ipc: EmulatorIpc): Promise<boolean> {
  try {
    return (await ipc.getPackageInfo(serial, OBTAINIUM_SOURCE.packageName)) !== null
  } catch {
    return false
  }
}
