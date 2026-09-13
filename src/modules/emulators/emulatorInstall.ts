import { runVerifiedAction, type StepResult } from '../../verification'
import melondsProfile from './profiles/melonds-ds.json'
import azaharProfile from './profiles/azahar.json'
import dolphinProfile from './profiles/dolphin.json'
import cemuProfile from './profiles/cemu.json'

export interface EmulatorSource {
  id: string
  displayName: string
  githubRepo: string
  assetPattern: string
  packageName: string
}

export interface ConfigProfile {
  configPath: string
  settings: Record<string, string>
}

const PROFILES: Record<string, ConfigProfile> = {
  'melonds-ds': melondsProfile as ConfigProfile,
  azahar: azaharProfile as ConfigProfile,
  dolphin: dolphinProfile as ConfigProfile,
  cemu: cemuProfile as ConfigProfile,
}

export interface EmulatorIpc {
  prepareApk(
    id: string,
    githubRepo: string,
    assetPattern: string
  ): Promise<{ localPath: string; version: string }>
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
    prepareApk: (id, repo, pattern) =>
      window.electronAPI.emulators.prepareApk(id, repo, pattern),
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

export async function installEmulator(
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

  // ── Étape 1 : Téléchargement APK ──────────────────────────────────────────
  const downloadResult = await runVerifiedAction<string>({
    label: `${source.displayName} — Téléchargement APK`,
    apply: async () => {
      const r = await ipc.prepareApk(source.id, source.githubRepo, source.assetPattern)
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
    results.push(makeFailed(`${source.displayName} — Configuration`, 'Téléchargement APK échoué'))
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

  // ── Étape 3 : Application du profil de configuration ──────────────────────
  const profile = PROFILES[source.id]
  if (!profile) {
    results.push(
      makeFailed(`${source.displayName} — Configuration`, `Profil inconnu : ${source.id}`)
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
