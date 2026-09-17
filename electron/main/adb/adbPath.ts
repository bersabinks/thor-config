import { existsSync, readdirSync } from 'fs'
import { join } from 'path'

type Env = Record<string, string | undefined>

/** Origine d'un binaire adb détecté. */
export type AdbSource =
  | 'custom'
  | 'internal'
  | 'env'
  | 'path'
  | 'winget'
  | 'chocolatey'
  | 'manual'
  | 'sdk'

export interface AdbLocation {
  path: string
  source: AdbSource
}

function adbExecutable(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'adb.exe' : 'adb'
}

/**
 * Dossier où ThorConfig installe lui-même les platform-tools téléchargés :
 * %APPDATA%/ThorConfig/platform-tools (indépendant du nom de dev/prod de l'app).
 */
export function internalPlatformToolsDir(
  env: Env = process.env,
  platform: NodeJS.Platform = process.platform
): string | null {
  const base =
    platform === 'win32'
      ? env.APPDATA
      : env.XDG_CONFIG_HOME ?? (env.HOME ? join(env.HOME, '.config') : undefined)
  return base ? join(base, 'ThorConfig', 'platform-tools') : null
}

/**
 * Emplacements d'adb par ordre de priorité :
 * 1. Chemin personnalisé dans les settings (priorité 1)
 * 2. Binaire interne ThorConfig (%APPDATA%/ThorConfig/platform-tools/adb.exe)
 * 3. PATH hérité du processus parent Electron (process.env.PATH) & env.ADB_PATH
 * 4. WinGet (%LOCALAPPDATA%\Microsoft\WinGet\Packages\Google.PlatformTools*\... et Links\adb.exe)
 * 5. Chocolatey (C:\ProgramData\chocolatey\bin\adb.exe)
 * 6. C:\platform-tools\adb.exe (installation manuelle classique)
 * 7. C:\android\platform-tools\adb.exe
 * 8. Android SDK (Android Studio sous LOCALAPPDATA / ANDROID_HOME / ANDROID_SDK_ROOT)
 */
export function adbCandidates(
  env: Env = process.env,
  platform: NodeJS.Platform = process.platform,
  customPath?: string,
  readdir: (dir: string) => string[] = (dir) => {
    try {
      return existsSync(dir) ? readdirSync(dir) : []
    } catch {
      return []
    }
  }
): AdbLocation[] {
  const exe = adbExecutable(platform)
  const out: AdbLocation[] = []

  // 1. Chemin personnalisé dans les settings (priorité 1)
  const custom = customPath?.trim()
  if (custom) {
    out.push({
      path: /adb(\.exe)?$/i.test(custom) ? custom : join(custom, exe),
      source: 'custom',
    })
  }

  // Variable explicite ADB_PATH
  const explicit = env.ADB_PATH?.trim()
  if (explicit) {
    out.push({
      path: /adb(\.exe)?$/i.test(explicit) ? explicit : join(explicit, exe),
      source: 'env',
    })
  }

  // 2. Binaire interne de ThorConfig (%APPDATA%/ThorConfig/platform-tools/adb.exe)
  const internal = internalPlatformToolsDir(env, platform)
  if (internal) {
    out.push({ path: join(internal, exe), source: 'internal' })
  }

  // 3. PATH hérité du processus parent Electron (process.env.PATH)
  const pathVar = env.PATH ?? env.Path ?? ''
  for (const dir of pathVar.split(platform === 'win32' ? ';' : ':')) {
    const clean = dir.trim().replace(/^"|"$/g, '')
    if (clean) out.push({ path: join(clean, exe), source: 'path' })
  }

  // 4. Emplacements WinGet courants
  if (platform === 'win32' && env.LOCALAPPDATA) {
    const wingetBase = join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages')
    try {
      const entries = readdir(wingetBase)
      for (const entry of entries) {
        if (/^Google\.PlatformTools/i.test(entry)) {
          out.push({ path: join(wingetBase, entry, 'platform-tools', exe), source: 'winget' })
          out.push({ path: join(wingetBase, entry, exe), source: 'winget' })
        }
      }
    } catch {
      // Ignorer si le dossier Packages est inaccessible ou absent
    }
    out.push({
      path: join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', exe),
      source: 'winget',
    })
  }

  // 5. Emplacements Chocolatey
  if (platform === 'win32') {
    const chocoDir = env.ChocolateyInstall ?? 'C:\\ProgramData\\chocolatey'
    out.push({ path: join(chocoDir, 'bin', exe), source: 'chocolatey' })
  }

  // 6. C:\platform-tools\adb.exe (installation manuelle classique)
  if (platform === 'win32') {
    out.push({ path: join('C:\\', 'platform-tools', exe), source: 'manual' })
  }

  // 7. C:\android\platform-tools\adb.exe
  if (platform === 'win32') {
    out.push({ path: join('C:\\', 'android', 'platform-tools', exe), source: 'manual' })
  }

  // 8. SDK Android (Android Studio)
  const sdk = (p: string) => out.push({ path: p, source: 'sdk' })
  for (const root of [env.ANDROID_HOME, env.ANDROID_SDK_ROOT]) {
    if (root) sdk(join(root, 'platform-tools', exe))
  }
  if (platform === 'win32') {
    if (env.LOCALAPPDATA) sdk(join(env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', exe))
    if (env.USERPROFILE) sdk(join(env.USERPROFILE, 'platform-tools', exe))
  } else if (env.HOME) {
    sdk(join(env.HOME, 'Android', 'Sdk', 'platform-tools', exe))
  }

  return out
}

/** Premier adb existant, ou null s'il n'y en a aucun sur le poste. */
export function detectAdb(
  env: Env = process.env,
  exists: (p: string) => boolean = existsSync,
  platform: NodeJS.Platform = process.platform,
  customPath?: string,
  readdir?: (dir: string) => string[]
): AdbLocation | null {
  return adbCandidates(env, platform, customPath, readdir).find((c) => exists(c.path)) ?? null
}

/** Chemin d'adb à exécuter ; `adb` si rien n'est détecté (l'échec sera ADB_NOT_FOUND). */
export function resolveAdbPath(
  env: Env = process.env,
  exists: (p: string) => boolean = existsSync,
  platform: NodeJS.Platform = process.platform,
  customPath?: string,
  readdir?: (dir: string) => string[]
): string {
  return detectAdb(env, exists, platform, customPath, readdir)?.path ?? 'adb'
}
