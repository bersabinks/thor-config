import type { AdbDevice, PackageInfo } from '../../electron/main/adb/types'
import type { PrepareApkResult } from '../../electron/main/emulators/source'

export interface ElectronAPI {
  adb: {
    listDevices(): Promise<AdbDevice[]>
    getDeviceProps(serial: string): Promise<Record<string, string>>
    pushFile(serial: string, localPath: string, remotePath: string): Promise<void>
    pullFile(serial: string, remotePath: string, localPath: string): Promise<void>
    shell(serial: string, cmd: string): Promise<string>
    installApk(serial: string, apkPath: string): Promise<void>
    uninstallApk(serial: string, packageName: string): Promise<void>
    getPackageInfo(serial: string, packageName: string): Promise<PackageInfo | null>
    waitForDevice(serial: string, timeoutMs?: number): Promise<void>
  }
  settings: {
    get(key: string): Promise<unknown>
    set(key: string, value: unknown): Promise<void>
  }
  emulators: {
    prepareApk(id: string, githubRepo: string, assetPattern: string): Promise<PrepareApkResult>
    applyConfig(serial: string, configPath: string, settings: Record<string, string>): Promise<void>
    verifyConfig(
      serial: string,
      configPath: string,
      settings: Record<string, string>
    ): Promise<Record<string, string>>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
