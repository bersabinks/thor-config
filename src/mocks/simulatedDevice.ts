import type { PackageInfo } from '../../electron/main/adb/types'
import { AdbError } from '../../electron/main/adb/errors'
import { MOCK_FIXTURES, getUiXmlForContext, resetMockContext } from './fixtures'
import sources from '../modules/emulators/sources.json'
import launcherConfig from '../modules/launcher/launcherConfig.json'

/**
 * État initial de la console simulée :
 * - `configured` : console déjà passée par ThorConfig (émulateurs installés,
 *   gestes actifs, ROMs poussées, Cocoon en Home) — comportement historique ;
 * - `fresh` : sortie d'usine (navigation 3 boutons, aucun émulateur ni ROM,
 *   launcher d'origine), pour vérifier que chaque module modifie bien l'état.
 */
export type MockScenario = 'configured' | 'fresh'

export interface RemoteFile {
  size: number
  sha256: string
  /** Contenu texte connu (fichiers poussés de petite taille, ex. .m3u). */
  content?: string
}

const STOCK_LAUNCHER = 'com.android.launcher3'
const AYN_SETTINGS = 'com.ayn.settings'
const COCOON = launcherConfig.packageName

export const SEEDED_ROMS: Record<string, string> = {
  '/sdcard/ROMs/nds/Mario Kart DS (USA).nds': 'rom:nds:mkds',
  '/sdcard/ROMs/gc/Metroid Prime (USA).iso': 'rom:gc:metroid',
  '/sdcard/ROMs/wii/Wii Sports (USA).wbfs': 'rom:wii:sports',
}

/** Empreinte déterministe 64-hex (FNV-1a, pas un vrai SHA-256). */
export function fakeSha256(seed: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0').repeat(8)
}

function commandFailed(detail: string): AdbError {
  return new AdbError('COMMAND_FAILED', detail)
}

/** Chemin entre apostrophes (convention des commandes du projet), sinon 2e mot. */
function pathArg(cmd: string): string {
  return /'([^']*)'/.exec(cmd)?.[1] ?? cmd.trim().split(/\s+/)[1] ?? ''
}

/** Android 11+ interdit Android/data et Android/obb via ADB sans root (vérifié sur la console du testeur). */
function isProtected(path: string): boolean {
  return /^\/(?:sdcard|storage\/emulated\/0)\/Android\/(?:data|obb)(?:\/|$)/.test(path)
}

function denied(path: string): AdbError {
  return new AdbError('PERMISSION_DENIED', `${path}: Permission denied`)
}

/**
 * Console Android simulée, à état : les commandes ADB utilisées par les modules
 * des Prompts 2 à 8 lisent et modifient le même état, et reproduisent les codes
 * de sortie réels (ex. `grep` sans résultat échoue, fichier absent → erreur).
 * Aucune dépendance Node : le transport (délais, pannes) est géré par MockAdbClient.
 */
export class SimulatedDevice {
  readonly settings = new Map<string, string>()
  readonly packages = new Map<string, PackageInfo>()
  readonly files = new Map<string, RemoteFile>()
  readonly dirs = new Set<string>()
  home: string
  resumed: string

  constructor(scenario: MockScenario = 'configured') {
    resetMockContext()
    for (const p of [STOCK_LAUNCHER, AYN_SETTINGS, COCOON]) this.addPackage(p, '1.0')

    if (scenario === 'configured') {
      this.settings.set('secure/navigation_mode', '2')
      for (const info of Object.values(MOCK_FIXTURES.installedPackages)) {
        this.packages.set(info.packageName, { ...info })
      }
      for (const [path, content] of Object.entries(SEEDED_ROMS)) {
        this.writeFile(path, { size: content.length, sha256: fakeSha256(content), content })
      }
      this.home = COCOON
    } else {
      this.settings.set('secure/navigation_mode', '0')
      this.home = STOCK_LAUNCHER
    }
    this.resumed = this.home
  }

  addPackage(packageName: string, versionName: string): void {
    this.packages.set(packageName, { packageName, versionName, versionCode: 10000 })
  }

  writeFile(path: string, file: RemoteFile): void {
    this.files.set(path, file)
    const parts = path.split('/')
    for (let i = 2; i < parts.length; i++) this.dirs.add(parts.slice(0, i).join('/'))
  }

  private dirExists(dir: string): boolean {
    const d = dir.replace(/\/+$/, '')
    return this.dirs.has(d) || [...this.files.keys()].some((f) => f.startsWith(`${d}/`))
  }

  // ── Transferts / paquets ────────────────────────────────────────────────────

  pushFile(remotePath: string, file: RemoteFile): void {
    if (isProtected(remotePath)) throw denied(remotePath)
    this.writeFile(remotePath, file)
  }

  pullFile(remotePath: string): RemoteFile {
    if (isProtected(remotePath)) throw denied(remotePath)
    const f = this.files.get(remotePath)
    if (!f) throw commandFailed(`adb: error: remote object '${remotePath}' does not exist`)
    return f
  }

  /** Chemin APK du cache (`…/apk/<id>/<version>/<id>.apk`) → paquet de sources.json. */
  installApk(apkPath: string): void {
    const m = /[\\/]apk[\\/]([^\\/]+)[\\/]([^\\/]+)[\\/]/.exec(apkPath)
    const id = m?.[1] ?? (apkPath.split(/[\\/]/).pop() ?? '').replace(/\.apk$/i, '')
    const source = sources.find((s) => s.id === id)
    if (!source) throw commandFailed(`Failure [INSTALL_FAILED_INVALID_APK: ${apkPath}]`)
    this.addPackage(source.packageName, m?.[2] ?? 'sim-1.0')
  }

  uninstall(packageName: string): void {
    if (!this.packages.delete(packageName)) throw commandFailed('Failure [DELETE_FAILED_INTERNAL_ERROR]')
  }

  getPackageInfo(packageName: string): PackageInfo | null {
    const info = this.packages.get(packageName)
    return info ? { ...info } : null
  }

  // ── Shell ───────────────────────────────────────────────────────────────────

  shell(rawCmd: string): string {
    const cmd = rawCmd.trim()
    let m: RegExpExecArray | null

    if ((m = /^settings put (\w+) (\S+) (\S+)$/.exec(cmd))) {
      this.settings.set(`${m[1]}/${m[2]}`, m[3])
      return ''
    }
    if ((m = /^settings get (\w+) (\S+)$/.exec(cmd))) {
      return this.settings.get(`${m[1]}/${m[2]}`) ?? 'null'
    }
    if (cmd.startsWith('pm list packages')) return this.listPackages(cmd)

    // Launcher (Prompt 7)
    if (cmd.startsWith('cmd package resolve-activity')) {
      const target = /category\.HOME\s+(\S+)$/.exec(cmd)?.[1]
      const header = 'priority=0 preferredOrder=0 match=0x108000 specificIndex=-1'
      if (target) {
        return this.canBeHome(target) ? `${header} isDefault=false\n${this.componentOf(target)}` : 'No activity found'
      }
      return `${header} isDefault=true\n${this.componentOf(this.home)}`
    }
    if ((m = /^cmd package set-home-activity (\S+)$/.exec(cmd))) {
      const pkg = m[1].split('/')[0]
      if (!this.canBeHome(pkg)) throw commandFailed('Error: Failed to set default home.')
      this.home = pkg
      return 'Success'
    }
    if (cmd.startsWith('cmd role get-role-holders')) return this.home
    if ((m = /^cmd role add-role-holder \S+ (\S+)$/.exec(cmd))) {
      if (!this.canBeHome(m[1])) throw commandFailed(`Rôle HOME refusé pour ${m[1]}`)
      this.home = m[1]
      return ''
    }
    if (cmd === 'input keyevent KEYCODE_HOME') {
      this.resumed = this.home
      return ''
    }
    if (cmd.startsWith('dumpsys activity activities')) {
      const c = this.componentOf(this.resumed)
      return `  topResumedActivity=ActivityRecord{a1b2c3 u0 ${c} t12}\n    mResumedActivity: ActivityRecord{a1b2c3 u0 ${c} t12}`
    }

    // Système de fichiers (ROMs, Sauvegardes, PS Vita)
    if (cmd === 'cat /sdcard/window_dump.xml') return getUiXmlForContext(cmd)
    if (cmd.startsWith('mkdir -p')) {
      const dir = pathArg(cmd)
      if (isProtected(dir)) throw denied(dir)
      this.dirs.add(dir.replace(/\/+$/, ''))
      return ''
    }
    if (cmd.startsWith('sha256sum ')) {
      const path = pathArg(cmd)
      const f = this.readable(path, 'sha256sum')
      return `${f.sha256}  ${path}`
    }
    if (cmd.startsWith('wc -c')) return String(this.readable(pathArg(cmd), 'wc').size)
    if (cmd.startsWith('cat ')) return this.readable(pathArg(cmd), 'cat').content ?? ''
    if (cmd.startsWith('find ')) return this.find(cmd)
    if (cmd === 'getprop') {
      return Object.entries(MOCK_FIXTURES.deviceProps)
        .map(([k, v]) => `[${k}]: [${v}]`)
        .join('\n')
    }
    if ((m = /^getprop (\S+)$/.exec(cmd))) return MOCK_FIXTURES.deviceProps[m[1]] ?? ''

    // Lancement d'app : met à jour l'écran simulé pour les dumps UI suivants.
    if (cmd.includes('am start') || cmd.includes('monkey -p')) getUiXmlForContext(cmd)

    for (const [pattern, response] of Object.entries(MOCK_FIXTURES.shellResponses)) {
      if (cmd.includes(pattern)) return response
    }
    return ''
  }

  private readable(path: string, tool: string): RemoteFile {
    if (isProtected(path)) throw denied(path)
    const f = this.files.get(path)
    if (!f) throw commandFailed(`${tool}: ${path}: No such file or directory`)
    return f
  }

  private listPackages(cmd: string): string {
    const filter = /^pm list packages\s+([^\s|-][^\s|]*)/.exec(cmd)?.[1]
    const grep = /\|\s*grep\s+(?:-\w+\s+)?'?([^'|\s]+)'?/.exec(cmd)?.[1]
    let lines = [...this.packages.keys()].sort().map((p) => `package:${p}`)
    if (filter) lines = lines.filter((l) => l.includes(filter))
    if (grep) {
      lines = lines.filter((l) => l.includes(grep))
      // grep sans résultat → code de sortie 1, sauf `|| true`.
      if (lines.length === 0 && !/\|\|\s*true\s*$/.test(cmd)) {
        throw commandFailed(`grep : aucun paquet ne correspond à « ${grep} » (code de sortie 1)`)
      }
    }
    return lines.join('\n')
  }

  private find(cmd: string): string {
    const dir = pathArg(cmd).replace(/\/+$/, '')
    const tolerant = /\|\|\s*true\s*$/.test(cmd) || /\|\s*wc -l/.test(cmd)
    if (isProtected(dir) || !this.dirExists(dir)) {
      if (!tolerant) throw commandFailed(`find: '${dir}': No such file or directory`)
      return /\|\s*wc -l/.test(cmd) ? '0\n' : ''
    }
    const found = [...this.files.keys()].filter((f) => f.startsWith(`${dir}/`)).sort()
    return /\|\s*wc -l/.test(cmd) ? `${found.length}\n` : found.join('\n')
  }

  private canBeHome(pkg: string): boolean {
    return pkg === STOCK_LAUNCHER || (pkg === COCOON && this.packages.has(COCOON))
  }

  private componentOf(pkg: string): string {
    if (pkg === STOCK_LAUNCHER) return `${STOCK_LAUNCHER}/.Launcher`
    if (pkg === COCOON && launcherConfig.mainActivity) {
      const a = launcherConfig.mainActivity
      return a.includes('/') ? a : `${COCOON}/${a}`
    }
    return `${pkg}/.MainActivity`
  }
}
