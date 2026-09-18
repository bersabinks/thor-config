import { LAUNCHER_CONFIG, type LauncherIpc } from './launcherProcess'

/** IPC réel : commandes `adb shell` et installation APK via le process main. */
export function makeDefaultLauncherIpc(): LauncherIpc {
  return {
    shell: (serial, cmd) => window.electronAPI.adb.shell(serial, cmd),
    prepareApk: (source) => window.electronAPI.emulators.prepareApk(source),
    installApk: (serial, apkPath) => window.electronAPI.adb.installApk(serial, apkPath),
  }
}

// ── Simulation : console Android à état, sans appareil ────────────────────────

export interface SimulationLauncherOptions {
  /** Cocoon installé (défaut true). */
  installed?: boolean
  /** Activité HOME déclarée par Cocoon ; null = aucune (défaut ".MainActivity"). */
  homeActivity?: string | null
  /** `cmd package set-home-activity` accepté (défaut true). */
  setHomeActivitySupported?: boolean
  /** Service `role` disponible, Android 10+ (défaut true). */
  roleServiceAvailable?: boolean
  /** L'appui sur HOME ramène bien l'application Home au premier plan (défaut true). */
  homeKeyWorks?: boolean
  /** Nombre de fichiers dans le dossier ROMs (défaut 42). */
  romFiles?: number
}

const STOCK_LAUNCHER = 'com.android.launcher3/.Launcher'

export function makeSimulationLauncherIpc(
  opts: SimulationLauncherOptions = {}
): LauncherIpc & { commands: string[] } {
  const pkg = LAUNCHER_CONFIG.packageName
  const installed = opts.installed ?? true
  const activity = opts.homeActivity === undefined ? '.MainActivity' : opts.homeActivity
  const setHomeSupported = opts.setHomeActivitySupported ?? true
  const roleAvailable = opts.roleServiceAvailable ?? true
  const homeKeyWorks = opts.homeKeyWorks ?? true
  const romFiles = opts.romFiles ?? 42

  const state = { home: 'com.android.launcher3', resumed: 'com.android.launcher3' }
  const commands: string[] = []
  const componentOf = (p: string) => (p === pkg ? `${pkg}/${activity}` : STOCK_LAUNCHER)
  const canBeHome = (p: string) => p === pkg && installed && activity !== null

  async function shell(_serial: string, cmd: string): Promise<string> {
    commands.push(cmd)
    const last = cmd.trim().split(/\s+/).pop() ?? ''

    if (cmd.startsWith('pm list packages')) {
      const all = ['com.android.launcher3', ...(installed ? [pkg] : [])]
      return all.filter((p) => p.includes(last)).map((p) => `package:${p}`).join('\n')
    }
    if (cmd.startsWith('cmd package resolve-activity')) {
      if (last === pkg) {
        return canBeHome(pkg)
          ? `priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=false\n${pkg}/${activity}`
          : 'No activity found'
      }
      return `priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=true\n${componentOf(state.home)}`
    }
    if (cmd.startsWith('cmd package set-home-activity')) {
      if (setHomeSupported && canBeHome(last.split('/')[0])) {
        state.home = pkg
        return 'Success'
      }
      throw new Error('Error: Failed to set default home.')
    }
    if (cmd.startsWith('cmd role')) {
      if (!roleAvailable) throw new Error("cmd: Can't find service: role")
      if (cmd.startsWith('cmd role get-role-holders')) return state.home
      if (canBeHome(last)) {
        state.home = pkg
        return ''
      }
      throw new Error(`Rôle HOME refusé pour ${last}`)
    }
    if (cmd === 'input keyevent KEYCODE_HOME') {
      if (homeKeyWorks) state.resumed = state.home
      return ''
    }
    if (cmd.startsWith('dumpsys activity activities')) {
      const c = componentOf(state.resumed)
      return `  topResumedActivity=ActivityRecord{a1b2c3 u0 ${c} t12}\n    mResumedActivity: ActivityRecord{a1b2c3 u0 ${c} t12}`
    }
    if (cmd.startsWith('find ')) return `${romFiles}\n`
    return ''
  }

  return { shell, commands }
}
