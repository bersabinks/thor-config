import { ipcMain, dialog } from 'electron'
import { getAdbClient } from '../adb/factory'
import { getSettings, setSettings } from '../settings'
import { prepareApk } from '../emulators/source'
import { applyConfig, verifyConfig } from '../emulators/configApplier'
import * as romOps from '../roms/romOps'
import { startImportWatcher, stopImportWatcher } from '../roms/importWatcher'
import * as saveOps from '../saves/saveOps'

export function registerIpcHandlers(): void {
  ipcMain.handle('adb:listDevices', () => getAdbClient().listDevices())

  ipcMain.handle('adb:getDeviceProps', (_e, serial: string) =>
    getAdbClient().getDeviceProps(serial)
  )

  ipcMain.handle('adb:pushFile', (_e, serial: string, localPath: string, remotePath: string) =>
    getAdbClient().pushFile(serial, localPath, remotePath)
  )

  ipcMain.handle('adb:pullFile', (_e, serial: string, remotePath: string, localPath: string) =>
    getAdbClient().pullFile(serial, remotePath, localPath)
  )

  ipcMain.handle('adb:shell', (_e, serial: string, cmd: string) =>
    getAdbClient().shell(serial, cmd)
  )

  ipcMain.handle('adb:installApk', (_e, serial: string, apkPath: string) =>
    getAdbClient().installApk(serial, apkPath)
  )

  ipcMain.handle('adb:uninstallApk', (_e, serial: string, packageName: string) =>
    getAdbClient().uninstallApk(serial, packageName)
  )

  ipcMain.handle('adb:getPackageInfo', (_e, serial: string, packageName: string) =>
    getAdbClient().getPackageInfo(serial, packageName)
  )

  ipcMain.handle('adb:waitForDevice', (_e, serial: string, timeoutMs?: number) =>
    getAdbClient().waitForDevice(serial, timeoutMs)
  )

  ipcMain.handle('settings:get', <K extends keyof ReturnType<typeof getSettings>>(_e: Electron.IpcMainInvokeEvent, key: K) =>
    getSettings()[key]
  )

  ipcMain.handle('settings:set', <K extends keyof ReturnType<typeof getSettings>>(_e: Electron.IpcMainInvokeEvent, key: K, value: ReturnType<typeof getSettings>[K]) => {
    setSettings({ [key]: value } as Partial<ReturnType<typeof getSettings>>)
  })

  ipcMain.handle(
    'emulators:prepareApk',
    (_e, id: string, githubRepo: string, assetPattern: string) =>
      prepareApk(id, githubRepo, assetPattern)
  )

  ipcMain.handle(
    'emulators:applyConfig',
    (_e, serial: string, configPath: string, settings: Record<string, string>) =>
      applyConfig(serial, configPath, settings)
  )

  ipcMain.handle(
    'emulators:verifyConfig',
    (_e, serial: string, configPath: string, settings: Record<string, string>) =>
      verifyConfig(serial, configPath, settings)
  )

  // ── ROMs ──────────────────────────────────────────────────────────────────
  ipcMain.handle('roms:readHeader', (_e, localPath: string, length: number) =>
    romOps.readHeader(localPath, length)
  )
  ipcMain.handle('roms:sha256Local', (_e, localPath: string) => romOps.sha256Local(localPath))
  ipcMain.handle('roms:hasChdman', () => romOps.hasChdman())
  ipcMain.handle('roms:chdmanConvert', (_e, localPath: string) => romOps.chdmanConvert(localPath))
  ipcMain.handle('roms:ensureRemoteDir', (_e, serial: string, remoteDir: string) =>
    romOps.ensureRemoteDir(serial, remoteDir)
  )
  ipcMain.handle('roms:sha256Device', (_e, serial: string, remotePath: string) =>
    romOps.sha256Device(serial, remotePath)
  )
  ipcMain.handle('roms:writeRemoteText', (_e, serial: string, remotePath: string, content: string) =>
    romOps.writeRemoteText(serial, remotePath, content)
  )
  ipcMain.handle('roms:readRemoteText', (_e, serial: string, remotePath: string) =>
    romOps.readRemoteText(serial, remotePath)
  )
  ipcMain.handle('roms:pickImportFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('roms:startWatcher', (_e, folder: string) => startImportWatcher(folder))
  ipcMain.handle('roms:stopWatcher', () => stopImportWatcher())

  // ── Sauvegardes ────────────────────────────────────────────────────────────
  ipcMain.handle('saves:listDeviceFiles', (_e, serial: string, dir: string) =>
    saveOps.listDeviceFiles(serial, dir)
  )
  ipcMain.handle('saves:sha256Device', (_e, serial: string, p: string) =>
    saveOps.sha256Device(serial, p)
  )
  ipcMain.handle('saves:deviceFileSize', (_e, serial: string, p: string) =>
    saveOps.deviceFileSize(serial, p)
  )
  ipcMain.handle('saves:ensureRemoteDir', (_e, serial: string, dir: string) =>
    saveOps.ensureRemoteDir(serial, dir)
  )
  ipcMain.handle('saves:pullFile', (_e, serial: string, dp: string, lp: string) =>
    saveOps.pullFile(serial, dp, lp)
  )
  ipcMain.handle('saves:pushFile', (_e, serial: string, lp: string, dp: string) =>
    saveOps.pushFile(serial, lp, dp)
  )
  ipcMain.handle('saves:sha256Local', (_e, lp: string) => saveOps.sha256Local(lp))
  ipcMain.handle('saves:writeText', (_e, lp: string, content: string) =>
    saveOps.writeText(lp, content)
  )
  ipcMain.handle('saves:readText', (_e, lp: string) => saveOps.readText(lp))
  ipcMain.handle('saves:listBackups', (_e, emulatorId: string) => saveOps.listBackups(emulatorId))
  ipcMain.handle('saves:readManifest', (_e, emulatorId: string, backupId: string) =>
    saveOps.readManifest(emulatorId, backupId)
  )
}
