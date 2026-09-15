import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { getAdbClient } from '../adb/factory'
import { getAdbSetupState, startAdbSetup } from '../adb/platformToolsService'
import { readTodayLog } from '../diagnostics/appLog'
import {
  collectDeviceDiagnostics,
  diagnosticFileName,
  writeDiagnosticPack,
} from '../diagnostics/diagnosticPack'
import { getSettings, setSettings } from '../settings'
import { prepareApk } from '../emulators/source'
import { applyConfig, verifyConfig } from '../emulators/configApplier'
import * as romOps from '../roms/romOps'
import { startImportWatcher, stopImportWatcher } from '../roms/importWatcher'
import * as saveOps from '../saves/saveOps'
import * as vitaOps from '../vita/vitaOps'

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

  // ── Zero-Setup ADB ─────────────────────────────────────────────────────────
  ipcMain.handle('adb:getSetupState', () => getAdbSetupState())
  ipcMain.handle('adb:retrySetup', () => startAdbSetup())

  // ── Pack de diagnostic ─────────────────────────────────────────────────────
  ipcMain.handle('diagnostics:export', async (e, auditLogJson: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: Electron.SaveDialogOptions = {
      title: 'Exporter le diagnostic ThorConfig',
      defaultPath: join(app.getPath('documents'), diagnosticFileName()),
      filters: [{ name: 'Archive zip', extensions: ['zip'] }],
    }
    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (canceled || !filePath) return null
    const device = await collectDeviceDiagnostics(getAdbClient())
    const result = writeDiagnosticPack(filePath, { auditLogJson, appLog: readTodayLog(), ...device })
    console.log(`Diagnostic exporté : ${result.path} (SHA-256 ${result.sha256})`)
    return result
  })

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
  ipcMain.handle('roms:listImportFiles', (_e, folder: string) => romOps.listImportFiles(folder))

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

  // ── PS Vita ────────────────────────────────────────────────────────────────
  ipcMain.handle('vita:listArchive', (_e, p: string) => vitaOps.listArchive(p))
  ipcMain.handle('vita:extractArchive', (_e, p: string) => vitaOps.extractArchive(p))
  ipcMain.handle('vita:readLocalBytes', (_e, p: string) => vitaOps.readLocalBytes(p))
  ipcMain.handle('vita:prepareOutputDir', (_e, titleId: string) =>
    vitaOps.prepareOutputDir(titleId)
  )
  ipcMain.handle('vita:createZipFromDir', (_e, src: string, out: string) =>
    vitaOps.createZipFromDir(src, out)
  )
  ipcMain.handle('vita:writeText', (_e, p: string, content: string) =>
    vitaOps.writeText(p, content)
  )
  ipcMain.handle('vita:readText', (_e, p: string) => vitaOps.readText(p))
  ipcMain.handle('vita:sha256Local', (_e, p: string) => vitaOps.sha256Local(p))
  ipcMain.handle('vita:fileSize', (_e, p: string) => vitaOps.fileSize(p))
  ipcMain.handle('vita:copyLocal', (_e, src: string, dest: string) =>
    vitaOps.copyLocal(src, dest)
  )
  ipcMain.handle('vita:resolvePcOutputDir', (_e, configured: string) =>
    vitaOps.resolvePcOutputDir(configured)
  )
  ipcMain.handle('vita:removeWorkDir', (_e, dir: string) => vitaOps.removeWorkDir(dir))
  ipcMain.handle('vita:downloadFirmware', (_e, id: string) => vitaOps.downloadFirmware(id))
}
