import type { AdbDevice, PackageInfo } from '../../electron/main/adb/types'
import type { PrepareApkResult } from '../../electron/main/emulators/source'
import type { PrepareApkSource } from '../modules/emulators/emulatorInstall'
import type { AdbSetupState } from '../../electron/main/adb/platformTools'
import type { DiagnosticPackResult } from '../../electron/main/diagnostics/diagnosticPack'
import type { FirmwareDownloadResult } from '../../electron/main/vita/firmwareDownload'

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
    /** Zero-Setup ADB : état courant, relance, abonnement aux changements. */
    getSetupState(): Promise<AdbSetupState>
    retrySetup(): Promise<AdbSetupState>
    onSetupState(cb: (state: AdbSetupState) => void): () => void
  }
  diagnostics: {
    /** Ouvre la boîte « Enregistrer sous » ; null si annulé. */
    export(auditLogJson: string): Promise<DiagnosticPackResult | null>
  }
  settings: {
    get(key: string): Promise<unknown>
    set(key: string, value: unknown): Promise<void>
  }
  emulators: {
    prepareApk(source: PrepareApkSource): Promise<PrepareApkResult>
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
    listImportFiles(folder: string): Promise<string[]>
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
  vita: {
    listArchive(archivePath: string): Promise<string[]>
    extractArchive(archivePath: string): Promise<{ workDir: string; files: string[] }>
    readLocalBytes(localPath: string): Promise<Uint8Array>
    prepareOutputDir(titleId: string): Promise<string>
    createZipFromDir(sourceDir: string, outPath: string): Promise<void>
    writeText(localPath: string, content: string): Promise<void>
    readText(localPath: string): Promise<string>
    sha256Local(localPath: string): Promise<string>
    fileSize(localPath: string): Promise<number>
    copyLocal(sourcePath: string, destPath: string): Promise<void>
    resolvePcOutputDir(configured: string): Promise<string>
    removeWorkDir(workDir: string): Promise<void>
    downloadFirmware(id: string): Promise<FirmwareDownloadResult>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
