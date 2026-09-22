import { runVerifiedAction, type StepResult } from '../../verification'
import watermelondsProfile from './profiles/watermelonds.json'
import ppssppProfile from './profiles/ppsspp.json'
import duckstationProfile from './profiles/duckstation.json'
import azaharProfile from './profiles/azahar.json'
import dolphinProfile from './profiles/dolphin.json'
import cemuProfile from './profiles/cemu.json'
import nethersx2Profile from './profiles/nethersx2.json'
import flycastProfile from './profiles/flycast.json'

export interface EmulatorSource {
  id: string
  displayName: string
  /**
   * 'github' = release GitHub ; 'fdroid' = dépôt F-Droid (Dolphin, PPSSPP) ;
   * 'playstore' = distribué uniquement via Google Play → installation
   * automatique impossible (DuckStation), l'étape est ignorée, pas en échec.
   */
  sourceType: 'github' | 'fdroid' | 'playstore'
  packageName: string
  /** Requis pour sourceType 'github'. */
  githubRepo?: string
  /** Requis pour sourceType 'github'. */
  assetPattern?: string
  /** Requis pour sourceType 'fdroid'. */
  fdroidRepo?: string
  /** Requis pour sourceType 'playstore' : page officielle à ouvrir à la main. */
  playStoreUrl?: string
}

export interface ConfigProfile {
  configPath: string
  settings: Record<string, string>
  /**
   * true uniquement si le profil a été validé sur du matériel réel. Tant qu'il
   * vaut false/undefined, l'étape de configuration est **ignorée** (skipped)
   * plutôt qu'appliquée à l'aveugle : on ne veut pas rapporter un succès pour
   * une config qu'on n'a pas confirmé fonctionnelle.
   */
  _confirmed?: boolean
}

const PROFILES: Record<string, ConfigProfile> = {
  watermelonds: watermelondsProfile as ConfigProfile,
  ppsspp: ppssppProfile as ConfigProfile,
  duckstation: duckstationProfile as ConfigProfile,
  azahar: azaharProfile as ConfigProfile,
  dolphin: dolphinProfile as ConfigProfile,
  cemu: cemuProfile as ConfigProfile,
  nethersx2: nethersx2Profile as ConfigProfile,
  flycast: flycastProfile as ConfigProfile,
}

/** Ce dont le process main a besoin pour récupérer l'APK d'une source. */
export type PrepareApkSource = Pick<
  EmulatorSource,
  'id' | 'sourceType' | 'githubRepo' | 'assetPattern' | 'fdroidRepo' | 'packageName'
>

export interface EmulatorIpc {
  prepareApk(source: PrepareApkSource): Promise<{ localPath: string; version: string }>
  applyConfig(
    serial: string,
    configPath: string,
    settings: Record<string, string>
  ): Promise<void>
  verifyConfig(
    serial: string,
    configPath: string,
    settings: Record<string, string>
  ): Promise<Record<string, string>>
  installApk(serial: string, apkPath: string): Promise<void>
  getPackageInfo(serial: string, packageName: string): Promise<{ versionName: string } | null>
}

export function makeDefaultIpc(): EmulatorIpc {
  return {
    prepareApk: (source) => window.electronAPI.emulators.prepareApk(source),
    applyConfig: (serial, path, settings) =>
      window.electronAPI.emulators.applyConfig(serial, path, settings),
    verifyConfig: (serial, path, settings) =>
      window.electronAPI.emulators.verifyConfig(serial, path, settings),
    installApk: (serial, path) => window.electronAPI.adb.installApk(serial, path),
    getPackageInfo: (serial, pkg) => window.electronAPI.adb.getPackageInfo(serial, pkg),
  }
}

export interface InstallOptions {
  retryDelayMs?: number
  maxRetries?: number
}

function makeFailed(label: string, reason: string): StepResult {
  return {
    label,
    status: 'failed_after_retries',
    attempts: 0,
    lastValue: null,
    error: reason,
    timestamp: Date.now(),
  }
}

function makeSkipped(label: string, reason: string): StepResult {
  return {
    label,
    status: 'skipped',
    attempts: 0,
    lastValue: null,
    note: reason,
    timestamp: Date.now(),
  }
}

/**
 * Pipeline commun d'installation d'un APK (émulateur ou outil comme Obtainium) :
 * téléchargement vérifié puis installation vérifiée par `pm`. Renvoie toujours
 * 2 étapes ; l'installation est marquée en échec si le téléchargement a échoué.
 */
export async function installApp(
  serial: string,
  source: EmulatorSource,
  ipc: EmulatorIpc = makeDefaultIpc(),
  options: InstallOptions = {}
): Promise<StepResult[]> {
  const retryDelayMs = options.retryDelayMs ?? 3000
  const maxRetries = options.maxRetries ?? 2
  const results: StepResult[] = []
  let localPath = ''
  let version = ''

  // Aucune source téléchargeable : on n'invente pas d'APK, les étapes sont ignorées.
  if (source.sourceType === 'playstore') {
    const reason =
      `${source.displayName} n’est distribué que par Google Play (${source.packageName}) : ` +
      `installation automatique impossible. À installer à la main depuis ${source.playStoreUrl ?? 'Google Play'}.`
    results.push(makeSkipped(`${source.displayName} — Téléchargement APK`, reason))
    results.push(makeSkipped(`${source.displayName} — Installation`, reason))
    return results
  }

  // ── Étape 1 : Téléchargement APK ──────────────────────────────────────────
  const downloadResult = await runVerifiedAction<string>({
    label: `${source.displayName} — Téléchargement APK`,
    apply: async () => {
      const r = await ipc.prepareApk(source)
      localPath = r.localPath
      version = r.version
    },
    check: async () => localPath,
    expected: (path) => path !== '',
    expectedDescription: 'chemin APK présent dans le cache local',
    maxRetries,
    retryDelayMs,
  })
  results.push(downloadResult)

  if (downloadResult.status !== 'success') {
    results.push(makeFailed(`${source.displayName} — Installation`, 'Téléchargement APK échoué'))
    return results
  }

  // ── Étape 2 : Installation APK ────────────────────────────────────────────
  const installResult = await runVerifiedAction<{ versionName: string } | null>({
    label: `${source.displayName} — Installation`,
    apply: async () => {
      await ipc.installApk(serial, localPath)
    },
    check: async () => ipc.getPackageInfo(serial, source.packageName),
    expected: (info) => info !== null,
    expectedDescription: `package ${source.packageName} installé et visible via pm`,
    maxRetries,
    retryDelayMs,
  })
  results.push(installResult)
  return results
}

export async function installEmulator(
  serial: string,
  source: EmulatorSource,
  ipc: EmulatorIpc = makeDefaultIpc(),
  options: InstallOptions = {},
  profile: ConfigProfile | undefined = PROFILES[source.id]
): Promise<StepResult[]> {
  const retryDelayMs = options.retryDelayMs ?? 3000
  const maxRetries = options.maxRetries ?? 2
  const results = await installApp(serial, source, ipc, options)

  if (results[0].status === 'skipped') {
    results.push(
      makeSkipped(
        `${source.displayName} — Configuration`,
        'Émulateur non installé automatiquement — à configurer après installation manuelle.'
      )
    )
    return results
  }
  if (results[0].status !== 'success') {
    results.push(makeFailed(`${source.displayName} — Configuration`, 'Téléchargement APK échoué'))
    return results
  }

  // ── Étape 3 : Application du profil de configuration ──────────────────────
  if (!profile) {
    results.push(
      makeFailed(`${source.displayName} — Configuration`, `Profil inconnu : ${source.id}`)
    )
    return results
  }

  // Profil non validé sur matériel réel → on n'applique rien et on marque
  // l'étape comme ignorée, plutôt que de rapporter un faux succès.
  if (!profile._confirmed) {
    results.push(
      makeSkipped(
        `${source.displayName} — Configuration`,
        'Profil de configuration non validé sur matériel réel — application automatique désactivée, à configurer manuellement dans l’émulateur.'
      )
    )
    return results
  }

  const configResult = await runVerifiedAction<Record<string, string>>({
    label: `${source.displayName} — Configuration`,
    apply: async () => {
      await ipc.applyConfig(serial, profile.configPath, profile.settings)
    },
    check: async () => ipc.verifyConfig(serial, profile.configPath, profile.settings),
    expected: (actual) =>
      Object.entries(profile.settings).every(([k, v]) => actual[k] === v),
    expectedDescription: 'toutes les clés du profil vérifiées dans le fichier de config',
    maxRetries,
    retryDelayMs,
  })
  results.push(configResult)

  return results
}
