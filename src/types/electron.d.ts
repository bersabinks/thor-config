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
  roms: {
    readHeader(localPath: string, length: number): Promise<Uint8Array>
    sha256Local(localPath: string): Promise<string>
    hasChdman(): Promise<boolean>
    chdmanConvert(localPath: string): Promise<string>
    ensureRemoteDir(serial: string, remoteDir: string): Promise<void>
    sha256Device(serial: string, remotePath: string): Promise<string>
    writeRemoteText(serial: string, remotePath: string, content: string): Promise<void>
    readRemoteText(serial: string, remotePath: string): Promise<string>
    pickImportFolder(): Promise<string | null>
    startWatcher(folder: string): Promise<void>
    stopWatcher(): Promise<void>
    onFileDetected(cb: (path: string) => void): () => void
  }
  saves: {
    listDeviceFiles(serial: string, dir: string): Promise<string[]>
    sha256Device(serial: string, p: string): Promise<string>
    deviceFileSize(serial: string, p: string): Promise<number>
    ensureRemoteDir(serial: string, dir: string): Promise<void>
    pullFile(serial: string, devicePath: string, localPath: string): Promise<void>
    pushFile(serial: string, localPath: string, devicePath: string): Promise<void>
    sha256Local(localPath: string): Promise<string>
    writeText(localPath: string, content: string): Promise<void>
    readText(localPath: string): Promise<string>
    listBackups(emulatorId: string): Promise<string[]>
    readManifest(emulatorId: string, backupId: string): Promise<string | null>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
