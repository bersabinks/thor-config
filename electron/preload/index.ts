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
    waitForDevice: (serial: string, timeoutMs?: number) =>
      ipcRenderer.invoke('adb:waitForDevice', serial, timeoutMs),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
  },
  emulators: {
    prepareApk: (id: string, githubRepo: string, assetPattern: string) =>
      ipcRenderer.invoke('emulators:prepareApk', id, githubRepo, assetPattern),
    applyConfig: (serial: string, configPath: string, settings: Record<string, string>) =>
      ipcRenderer.invoke('emulators:applyConfig', serial, configPath, settings),
    verifyConfig: (serial: string, configPath: string, settings: Record<string, string>) =>
      ipcRenderer.invoke('emulators:verifyConfig', serial, configPath, settings),
  },
  roms: {
    readHeader: (localPath: string, length: number) =>
      ipcRenderer.invoke('roms:readHeader', localPath, length),
    sha256Local: (localPath: string) => ipcRenderer.invoke('roms:sha256Local', localPath),
    hasChdman: () => ipcRenderer.invoke('roms:hasChdman'),
    chdmanConvert: (localPath: string) => ipcRenderer.invoke('roms:chdmanConvert', localPath),
    ensureRemoteDir: (serial: string, remoteDir: string) =>
      ipcRenderer.invoke('roms:ensureRemoteDir', serial, remoteDir),
    sha256Device: (serial: string, remotePath: string) =>
      ipcRenderer.invoke('roms:sha256Device', serial, remotePath),
    writeRemoteText: (serial: string, remotePath: string, content: string) =>
      ipcRenderer.invoke('roms:writeRemoteText', serial, remotePath, content),
    readRemoteText: (serial: string, remotePath: string) =>
      ipcRenderer.invoke('roms:readRemoteText', serial, remotePath),
    pickImportFolder: () => ipcRenderer.invoke('roms:pickImportFolder'),
    startWatcher: (folder: string) => ipcRenderer.invoke('roms:startWatcher', folder),
    stopWatcher: () => ipcRenderer.invoke('roms:stopWatcher'),
    onFileDetected: (cb: (path: string) => void) => {
      const listener = (_e: unknown, path: string) => cb(path)
      ipcRenderer.on('roms:fileDetected', listener)
      return () => ipcRenderer.removeListener('roms:fileDetected', listener)
    },
  },
})
