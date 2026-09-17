import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { AdbClient } from '../../electron/main/adb/types'
import type { ElectronAPI } from '../types/electron'

/** Reproduit la sérialisation d'erreur de `ipcRenderer.invoke` (seul le message traverse). */
async function invoke<T>(channel: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    throw new Error(`Error invoking remote method '${channel}': ${String(err)}`)
  }
}

/** Namespace dont les méthodes non fournies rejettent explicitement. */
function partial<T extends object>(ns: string, impl: Partial<T>): T {
  return new Proxy(impl, {
    get: (target, prop) =>
      prop in target
        ? (target as Record<string | symbol, unknown>)[prop]
        : () => Promise.reject(new Error(`${ns}.${String(prop)} non simulé`)),
  }) as T
}

/**
 * `window.electronAPI` de test, branché sur un AdbClient (MockAdbClient) comme le
 * ferait le process main en mode simulation. Les réponses `emulators.*` reprennent
 * les branches simulationMode de electron/main/emulators (source.ts, configApplier.ts).
 */
export function createSimulatedElectronApi(
  client: AdbClient,
  initialSettings: Record<string, unknown> = {}
): ElectronAPI {
  const settings: Record<string, unknown> = { simulationMode: true, ...initialSettings }

  return {
    adb: {
      listDevices: () => invoke('adb:listDevices', () => client.listDevices()),
      getDeviceProps: (s) => invoke('adb:getDeviceProps', () => client.getDeviceProps(s)),
      pushFile: (s, l, r) => invoke('adb:pushFile', () => client.pushFile(s, l, r)),
      pullFile: (s, r, l) => invoke('adb:pullFile', () => client.pullFile(s, r, l)),
      shell: (s, c) => invoke('adb:shell', () => client.shell(s, c)),
      installApk: (s, p) => invoke('adb:installApk', () => client.installApk(s, p)),
      uninstallApk: (s, p) => invoke('adb:uninstallApk', () => client.uninstallApk(s, p)),
      getPackageInfo: (s, p) => invoke('adb:getPackageInfo', () => client.getPackageInfo(s, p)),
      waitForDevice: (s, t) => invoke('adb:waitForDevice', () => client.waitForDevice(s, t)),
      getSetupState: async () => ({ phase: 'system', path: 'adb', source: 'path' }),
      retrySetup: async () => ({ phase: 'system', path: 'adb', source: 'path' }),
      getAdbInfo: async () => ({ found: true, path: 'adb', source: 'path' }),
      pickAdbPath: async () => 'adb',
      onSetupState: () => () => {},
    },
    diagnostics: partial<ElectronAPI['diagnostics']>('diagnostics', {}),
    settings: {
      get: async (key) => settings[key],
      set: async (key, value) => {
        settings[key] = value
      },
    },
    emulators: {
      prepareApk: async ({ id }) => ({ localPath: `/mock/cache/apk/${id}/sim-1.0/${id}.apk`, version: 'sim-1.0' }),
      latestVersion: async () => ({ version: 'sim-1.0' }),
      applyConfig: async () => {},
      verifyConfig: async (_serial, _path, expected) => ({ ...expected }),
    },
    roms: partial<ElectronAPI['roms']>('roms', {
      listImportFiles: async () => [],
      // Mêmes commandes que electron/main/roms/romOps.ts, sur le client simulé.
      ensureRemoteDir: (s, dir) => invoke('roms:ensureRemoteDir', async () => void (await client.shell(s, `mkdir -p '${dir}'`))),
      sha256Device: (s, p) =>
        invoke('roms:sha256Device', async () => /([a-f0-9]{64})/i.exec(await client.shell(s, `sha256sum '${p}'`))?.[1] ?? ''),
      writeRemoteText: (s, remote, content) =>
        invoke('roms:writeRemoteText', async () => {
          const tmp = mkdtempSync(join(tmpdir(), 'thor-remote-text-'))
          try {
            writeFileSync(join(tmp, 'content'), content)
            await client.pushFile(s, join(tmp, 'content'), remote)
          } finally {
            rmSync(tmp, { recursive: true, force: true })
          }
        }),
      readRemoteText: (s, p) => invoke('roms:readRemoteText', () => client.shell(s, `cat '${p}'`)),
    }),
    saves: partial<ElectronAPI['saves']>('saves', {}),
    vita: partial<ElectronAPI['vita']>('vita', {}),
  }
}
