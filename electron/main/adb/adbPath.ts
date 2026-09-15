import { existsSync } from 'fs'
import { join } from 'path'

type Env = Record<string, string | undefined>

/**
 * Emplacements usuels des platform-tools, par ordre de priorité. Le testeur n'a
 * pas forcément ajouté adb au PATH : on cherche aussi là où Android Studio et
 * l'extraction manuelle du zip Google les déposent.
 */
export function adbCandidates(env: Env, platform: NodeJS.Platform = process.platform): string[] {
  const exe = platform === 'win32' ? 'adb.exe' : 'adb'
  const out: string[] = []

  const explicit = env.ADB_PATH?.trim()
  if (explicit) out.push(/adb(\.exe)?$/i.test(explicit) ? explicit : join(explicit, exe))

  for (const sdk of [env.ANDROID_HOME, env.ANDROID_SDK_ROOT]) {
    if (sdk) out.push(join(sdk, 'platform-tools', exe))
  }
  if (platform === 'win32') {
    if (env.LOCALAPPDATA) out.push(join(env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', exe))
    if (env.USERPROFILE) out.push(join(env.USERPROFILE, 'platform-tools', exe))
    out.push(join('C:\\', 'platform-tools', exe))
  } else if (env.HOME) {
    out.push(join(env.HOME, 'Android', 'Sdk', 'platform-tools', exe))
  }
  return out
}

/** Premier adb existant parmi les candidats, sinon `adb` (résolu via le PATH). */
export function resolveAdbPath(
  env: Env = process.env,
  exists: (p: string) => boolean = existsSync,
  platform: NodeJS.Platform = process.platform
): string {
  return adbCandidates(env, platform).find((p) => exists(p)) ?? 'adb'
}
