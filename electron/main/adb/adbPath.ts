import { existsSync } from 'fs'
import { join } from 'path'

type Env = Record<string, string | undefined>

/** Origine d'un binaire adb détecté. */
export type AdbSource = 'env' | 'path' | 'sdk' | 'internal'

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
 * Emplacements d'adb par ordre de priorité : variable ADB_PATH, PATH, SDK et
 * extractions manuelles usuelles, puis la copie téléchargée par ThorConfig.
 */
export function adbCandidates(env: Env, platform: NodeJS.Platform = process.platform): AdbLocation[] {
  const exe = adbExecutable(platform)
  const out: AdbLocation[] = []

  const explicit = env.ADB_PATH?.trim()
  if (explicit) {
    out.push({ path: /adb(\.exe)?$/i.test(explicit) ? explicit : join(explicit, exe), source: 'env' })
  }

  const pathVar = env.PATH ?? env.Path ?? ''
  for (const dir of pathVar.split(platform === 'win32' ? ';' : ':')) {
    const clean = dir.trim().replace(/^"|"$/g, '')
    if (clean) out.push({ path: join(clean, exe), source: 'path' })
  }

  const sdk = (p: string) => out.push({ path: p, source: 'sdk' })
  for (const root of [env.ANDROID_HOME, env.ANDROID_SDK_ROOT]) {
    if (root) sdk(join(root, 'platform-tools', exe))
  }
  if (platform === 'win32') {
    if (env.LOCALAPPDATA) sdk(join(env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', exe))
    if (env.USERPROFILE) sdk(join(env.USERPROFILE, 'platform-tools', exe))
    sdk(join('C:\\', 'platform-tools', exe))
  } else if (env.HOME) {
    sdk(join(env.HOME, 'Android', 'Sdk', 'platform-tools', exe))
  }

  const internal = internalPlatformToolsDir(env, platform)
  if (internal) out.push({ path: join(internal, exe), source: 'internal' })
  return out
}

/** Premier adb existant, ou null s'il n'y en a aucun sur le poste. */
export function detectAdb(
  env: Env = process.env,
  exists: (p: string) => boolean = existsSync,
  platform: NodeJS.Platform = process.platform
): AdbLocation | null {
  return adbCandidates(env, platform).find((c) => exists(c.path)) ?? null
}

/** Chemin d'adb à exécuter ; `adb` si rien n'est détecté (l'échec sera ADB_NOT_FOUND). */
export function resolveAdbPath(
  env: Env = process.env,
  exists: (p: string) => boolean = existsSync,
  platform: NodeJS.Platform = process.platform
): string {
  return detectAdb(env, exists, platform)?.path ?? 'adb'
}
