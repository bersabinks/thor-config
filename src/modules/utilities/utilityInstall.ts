import { runVerifiedAction, type StepResult } from '../../verification'

export interface UtilitySource {
  id: string
  displayName: string
  description?: string
  sourceType: 'github' | 'playstore'
  packageName: string
  githubRepo?: string
  assetPattern?: string
  tileService?: string
  targetDir?: string
}

export interface UtilityIpc {
  prepareApk(
    id: string,
    githubRepo: string,
    assetPattern: string
  ): Promise<{ localPath: string; version: string }>
  installApk(serial: string, apkPath: string): Promise<void>
  getPackageInfo(serial: string, packageName: string): Promise<{ versionName: string } | null>
  shell(serial: string, cmd: string): Promise<string>
}

export function makeDefaultIpc(): UtilityIpc {
  return {
    // Les utilitaires téléchargés le sont tous via GitHub (le cas Play Store
    // retourne avant d'atteindre prepareApk). packageName n'est lu par le main
    // que pour les sources F-Droid, d'où la chaîne vide ici.
    prepareApk: (id, repo, pattern) =>
      window.electronAPI.emulators.prepareApk({
        id,
        sourceType: 'github',
        githubRepo: repo,
        assetPattern: pattern,
        packageName: '',
      }),
    installApk: (serial, path) => window.electronAPI.adb.installApk(serial, path),
    getPackageInfo: (serial, pkg) => window.electronAPI.adb.getPackageInfo(serial, pkg),
    shell: (serial, cmd) => window.electronAPI.adb.shell(serial, cmd),
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

export async function installUtility(
  serial: string,
  source: UtilitySource,
  ipc: UtilityIpc = makeDefaultIpc(),
  options: InstallOptions = {}
): Promise<StepResult[]> {
  const retryDelayMs = options.retryDelayMs ?? 3000
  const maxRetries = options.maxRetries ?? 2
  const results: StepResult[] = []

  // ── Cas 1 : Application Play Store (ex. ZArchiver) ─────────────────────────
  if (source.sourceType === 'playstore') {
    let pkgInfo: { versionName: string } | null = null
    try {
      pkgInfo = await ipc.getPackageInfo(serial, source.packageName)
    } catch {
      pkgInfo = null
    }

    if (pkgInfo) {
      results.push({
        label: `${source.displayName} — Détection`,
        status: 'success',
        attempts: 1,
        lastValue: pkgInfo,
        note: `Déjà installé sur la console (${pkgInfo.versionName}).`,
        timestamp: Date.now(),
      })
      return results
    }

    // Tente d'ouvrir la fiche Play Store sur la console
    try {
      await ipc.shell(
        serial,
        `am start -a android.intent.action.VIEW -d "market://details?id=${source.packageName}"`
      )
    } catch {
      // Ignoré si l'intent ne peut pas être envoyé
    }

    results.push(
      makeSkipped(
        `${source.displayName} — Installation Play Store`,
        `Application propriétaire Play Store. Page ouverte sur la console (${source.packageName}) ou à installer manuellement.`
      )
    )
    return results
  }

  // ── Cas 2 : Application GitHub Releases (ex. ClusterTune, Final ROM) ────────
  let localPath = ''
  let version = ''

  // Étape 1 : Téléchargement APK
  const downloadResult = await runVerifiedAction<string>({
    label: `${source.displayName} — Téléchargement APK`,
    apply: async () => {
      const r = await ipc.prepareApk(
        source.id,
        source.githubRepo ?? '',
        source.assetPattern ?? '\\.apk$'
      )
      localPath = r.localPath
      version = r.version
    },
    check: async () => localPath,
    expected: (p) => Boolean(p && p.length > 0),
    expectedDescription: 'chemin APK présent dans le cache local',
    maxRetries,
    retryDelayMs,
  })
  results.push(downloadResult)

  if (downloadResult.status !== 'success') {
    results.push(makeFailed(`${source.displayName} — Installation`, 'Téléchargement APK échoué'))
    return results
  }

  // Étape 2 : Installation APK
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

  if (installResult.status !== 'success') {
    return results
  }

  // Étape 3 : Actions spécifiques post-installation
  // 3a. Ajout de la tuile Quick Settings (ClusterTune)
  if (source.tileService) {
    const tileResult = await runVerifiedAction<boolean>({
      label: `${source.displayName} — Tuile paramètres rapides`,
      apply: async () => {
        await ipc.shell(serial, `cmd statusbar add-tile ${source.tileService}`)
      },
      check: async () => true,
      expected: (v) => v === true,
      expectedDescription: 'tuile ajoutée au volet des paramètres rapides',
      maxRetries: 1,
      retryDelayMs: Math.min(retryDelayMs, 500),
    })
    results.push(tileResult)
  }

  // 3b. Création du dossier cible (Final ROM)
  if (source.targetDir) {
    const dirResult = await runVerifiedAction<boolean>({
      label: `${source.displayName} — Dossier de travail (${source.targetDir})`,
      apply: async () => {
        await ipc.shell(serial, `mkdir -p '${source.targetDir}'`)
      },
      check: async () => true,
      expected: (v) => v === true,
      expectedDescription: `dossier ${source.targetDir} créé ou existant`,
      maxRetries: 1,
      retryDelayMs: Math.min(retryDelayMs, 500),
    })
    results.push(dirResult)
  }

  return results
}
