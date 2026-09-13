import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  adb: {
    listDevices: () => ipcRenderer.invoke('adb:listDevices'),
    getDeviceProps: (serial: string) => ipcRenderer.invoke('adb:getDeviceProps', serial),
    pushFile: (serial: string, localPath: string, remotePath: string) =>
      ipcRenderer.invoke('adb:pushFile', serial, localPath, remotePath),
    pullFile: (serial: string, remotePath: string, localPath: string) =>
      ipcRenderer.invoke('adb:pullFile', serial, remotePath, localPath),
    shell: (serial: string, cmd: string) => ipcRenderer.invoke('adb:shell', serial, cmd),
    installApk: (serial: string, apkPath: string) =>
      ipcRenderer.invoke('adb:installApk', serial, apkPath),
    uninstallApk: (serial: string, packageName: string) =>
      ipcRenderer.invoke('adb:uninstallApk', serial, packageName),
    getPackageInfo: (serial: string, packageName: string) =>
      ipcRenderer.invoke('adb:getPackageInfo', serial, packageName),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
  },
})
