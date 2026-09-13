import { ipcMain } from 'electron'
import { getAdbClient } from '../adb/factory'
import { getSettings, setSettings } from '../settings'

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

  ipcMain.handle('settings:get', <K extends keyof ReturnType<typeof getSettings>>(_e: Electron.IpcMainInvokeEvent, key: K) =>
    getSettings()[key]
  )

  ipcMain.handle('settings:set', <K extends keyof ReturnType<typeof getSettings>>(_e: Electron.IpcMainInvokeEvent, key: K, value: ReturnType<typeof getSettings>[K]) => {
    setSettings({ [key]: value } as Partial<ReturnType<typeof getSettings>>)
  })
}
