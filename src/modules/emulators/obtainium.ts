import { runVerifiedAction, type StepResult } from '../../verification'
import { describeError } from '../../../electron/main/adb/errors'
import {
  installApp,
  makeDefaultIpc,
  type EmulatorIpc,
  type EmulatorSource,
  type InstallOptions,
} from './emulatorInstall'
import obtainiumJson from './obtainium.json'
import { isOfficialFdroidRepo } from '../../../electron/main/emulators/fdroid'

/**
 * Obtainium (ImranR98/Obtainium) : gestionnaire de mises à jour installé après
 * les émulateurs, puis alimenté avec la liste des émulateurs de sources.json.
 *
 * Constaté dans le code source d'Obtainium (2026-09-15) :
 * - les apps sont stockées une par fichier dans
 *   Android/data/dev.imranr.obtainium/files/app_data/<id>.json — dossier
 *   inaccessible par ADB sans root sur la console du testeur ;
 * - il n'existe pas de chemin où Obtainium lirait un apps.json de lui-même ;
 * - import officiel : Import/Export → Obtainium Import (sélecteur de fichier),
 *   ou lien `obtainium://apps/<JSON>` qui ouvre un dialogue de confirmation
 *   puis appelle le même import({"apps": [...]}).
 *
 * TODO (à vérifier sur la console) : ouverture du lien obtainium://apps/ via
 * `am start` depuis ADB, et import effectif après confirmation. Le fichier est
 * déposé dans Download/ (visible depuis le sélecteur d'Obtainium) en repli.
 */

export const OBTAINIUM_SOURCE: EmulatorSource = {
  id: obtainiumJson.id,
  displayName: obtainiumJson.displayName,
  sourceType: 'github',
  githubRepo: obtainiumJson.githubRepo,
  assetPattern: obtainiumJson.assetPattern,
  packageName: obtainiumJson.packageName,
}

export const OBTAINIUM_APPS_JSON_REMOTE_PATH: string = obtainiumJson.appsJsonRemotePath

export const OBTAINIUM_INSTALLED_MESSAGE = 'Obtainium installé — vos émulateurs se mettront à jour automatiquement'

/** Champs lus par App.fromJson d'Obtainium (lib/models/app.dart) ; les autres ont des valeurs par défaut. */
export interface ObtainiumAppEntry {
  id: string
  url: string
  author: string
  name: string
  installedVersion: null
  /** Chaîne JSON (Obtainium la décode avec jsonDecode). */
  additionalSettings: string
  /** Identifiant de source Obtainium (runtimeType) ; null = déduit de l'URL. */
  overrideSource: string | null
}

/**
 * Obtainium n'a pas de source « Google Play » (cf. lib/app_sources) : une app
 * distribuée uniquement par le Play Store ne peut pas y être suivie.
 */
export function isObtainiumTrackable(source: EmulatorSource): boolean {
  return source.sourceType !== 'playstore'
}

export function toObtainiumApp(source: EmulatorSource): ObtainiumAppEntry {
  if (source.sourceType === 'playstore') {
    throw new Error(`${source.id} : distribué via Google Play, non suivi par Obtainium`)
  }
  if (source.sourceType === 'fdroid') {
    if (!source.fdroidRepo) throw new Error(`${source.id} : fdroidRepo manquant`)
    if (isOfficialFdroidRepo(source.fdroidRepo)) {
      return {
        id: source.packageName,
        // Dépôt officiel : page de l'app, reconnue par la source FDroid d'Obtainium.
        url: `https://f-droid.org/packages/${source.packageName}`,
        author: 'F-Droid',
        name: source.displayName,
        installedVersion: null,
        additionalSettings: JSON.stringify({}),
        overrideSource: null,
      }
    }
    return {
      id: source.packageName,
      url: source.fdroidRepo,
      author: new URL(source.fdroidRepo).host,
      name: source.displayName,
      installedVersion: null,
      // Dépôt F-Droid tiers : réglage obligatoire appIdOrName (lib/app_sources/fdroidrepo.dart).
      additionalSettings: JSON.stringify({ appIdOrName: source.packageName }),
      overrideSource: 'FDroidRepo',
    }
  }
  if (!source.githubRepo) throw new Error(`${source.id} : githubRepo manquant`)
  return {
    id: source.packageName,
    url: `https://github.com/${source.githubRepo}`,
    author: source.githubRepo.split('/')[0],
    name: source.displayName,
    installedVersion: null,
    // Mêmes règles que ThorConfig : release stable, même filtre d'APK.
    additionalSettings: JSON.stringify({
      includePrereleases: false,
      ...(source.assetPattern ? { apkFilterRegEx: source.assetPattern } : {}),
    }),
    overrideSource: null,
  }
}

/**
 * Contenu d'apps.json : format `{ "apps": [...] }` accepté par l'import
 * d'Obtainium. Les émulateurs sans source suivie (Google Play) sont écartés.
 */
export function buildObtainiumAppsJson(sources: readonly EmulatorSource[]): { apps: ObtainiumAppEntry[] } {
  return { apps: sources.filter(isObtainiumTrackable).map(toObtainiumApp) }
}

/**
 * Commande shell ouvrant le dialogue d'import d'Obtainium. Obtainium lit
 * `Uri.decodeComponent(uri.path.substring(1))` avec l'hôte « apps » ; l'apostrophe
 * est encodée pour rester dans la chaîne entre apostrophes du shell.
 */
export function obtainiumImportCommand(apps: readonly ObtainiumAppEntry[]): string {
  const payload = encodeURIComponent(JSON.stringify(apps)).replace(/'/g, '%27')
  return `am start -a android.intent.action.VIEW -p ${OBTAINIUM_SOURCE.packageName} -d 'obtainium://apps/${payload}'`
}

export interface ObtainiumIpc extends EmulatorIpc {
  ensureRemoteDir(serial: string, remoteDir: string): Promise<void>
  writeRemoteText(serial: string, remotePath: string, content: string): Promise<void>
  readRemoteText(serial: string, remotePath: string): Promise<string>
  shell(serial: string, cmd: string): Promise<string>
}

export function makeDefaultObtainiumIpc(): ObtainiumIpc {
  const roms = window.electronAPI.roms
  return {
    ...makeDefaultIpc(),
    ensureRemoteDir: (serial, dir) => roms.ensureRemoteDir(serial, dir),
    writeRemoteText: (serial, path, content) => roms.writeRemoteText(serial, path, content),
    readRemoteText: (serial, path) => roms.readRemoteText(serial, path),
    shell: (serial, cmd) => window.electronAPI.adb.shell(serial, cmd),
  }
}

function makeStep(label: string, status: StepResult['status'], extra: Partial<StepResult> = {}): StepResult {
  return { label, status, attempts: status === 'skipped' ? 0 : 1, lastValue: null, timestamp: Date.now(), ...extra }
}

/**
 * Obtainium : installation (pipeline des émulateurs) → apps.json déposé et relu
 * → ouverture du dialogue d'import. L'import lui-même n'est pas vérifiable par
 * ADB (données dans Android/data) : étape `skipped` avec la marche à suivre.
 */
export async function setupObtainium(
  serial: string,
  sources: readonly EmulatorSource[],
  ipc: ObtainiumIpc,
  options: InstallOptions = {}
): Promise<StepResult[]> {
  const name = OBTAINIUM_SOURCE.displayName
  const path = OBTAINIUM_APPS_JSON_REMOTE_PATH
  const retry = { maxRetries: options.maxRetries ?? 2, retryDelayMs: options.retryDelayMs ?? 3000 }
  const steps = await installApp(serial, OBTAINIUM_SOURCE, ipc, options)

  const listLabel = `${name} — Liste des émulateurs (apps.json)`
  const importLabel = `${name} — Import des émulateurs`
  if (steps[1]?.status !== 'success') {
    const error = 'Prérequis non rempli : Obtainium non installé'
    steps.push(makeStep(listLabel, 'failed_after_retries', { attempts: 0, error }))
    steps.push(makeStep(importLabel, 'failed_after_retries', { attempts: 0, error }))
    return steps
  }

  const { apps } = buildObtainiumAppsJson(sources)
  const untracked = sources.filter((s) => !isObtainiumTrackable(s))
  const content = JSON.stringify({ apps }, null, 2)
  const list = await runVerifiedAction<string>({
    label: listLabel,
    apply: async () => {
      await ipc.ensureRemoteDir(serial, path.slice(0, path.lastIndexOf('/')))
      await ipc.writeRemoteText(serial, path, content)
    },
    check: async () => (await ipc.readRemoteText(serial, path)).trim(),
    expected: (read) => {
      try {
        return JSON.stringify(JSON.parse(read)) === JSON.stringify(JSON.parse(content))
      } catch {
        return read.replace(/\r\n/g, '\n').trim() === content.replace(/\r\n/g, '\n').trim()
      }
    },
    expectedDescription: `${path} identique au fichier généré`,
    ...retry,
  })
  steps.push(
    list.status === 'success'
      ? {
          ...list,
          lastValue: path,
          note:
            `${apps.length} émulateur(s) : ${apps.map((a) => a.name).join(', ')} — ${path}` +
            (untracked.length > 0
              ? `. Hors suivi (Google Play, non géré par Obtainium) : ${untracked.map((s) => s.displayName).join(', ')}.`
              : ''),
        }
      : list
  )

  const manual = `Obtainium → Import/Export → Obtainium Import → ${path}`
  try {
    const output = await ipc.shell(serial, obtainiumImportCommand(apps))
    if (/Error/.test(output)) throw new Error(output.trim())
    steps.push(
      makeStep(importLabel, 'skipped', {
        note: `Fenêtre d’import ouverte dans Obtainium : confirmer sur la console (import non vérifiable par ADB). Sinon : ${manual}.`,
      })
    )
  } catch (err) {
    steps.push(
      makeStep(importLabel, 'skipped', {
        note: `Ouverture automatique impossible (${describeError(err)}). Importer à la main : ${manual}.`,
      })
    )
  }
  return steps
}
