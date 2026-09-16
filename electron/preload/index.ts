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
    getSetupState: () => ipcRenderer.invoke('adb:getSetupState'),
    retrySetup: () => ipcRenderer.invoke('adb:retrySetup'),
    onSetupState: (cb: (state: unknown) => void) => {
      const listener = (_e: unknown, state: unknown) => cb(state)
      ipcRenderer.on('adb:setupState', listener)
      return () => ipcRenderer.removeListener('adb:setupState', listener)
    },
  },
  diagnostics: {
    export: (auditLogJson: string) => ipcRenderer.invoke('diagnostics:export', auditLogJson),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
  },
  emulators: {
    prepareApk: (source: unknown) => ipcRenderer.invoke('emulators:prepareApk', source),
    latestVersion: (source: unknown) => ipcRenderer.invoke('emulators:latestVersion', source),
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
    listImportFiles: (folder: string) => ipcRenderer.invoke('roms:listImportFiles', folder),
    onFileDetected: (cb: (path: string) => void) => {
      const listener = (_e: unknown, path: string) => cb(path)
      ipcRenderer.on('roms:fileDetected', listener)
      return () => ipcRenderer.removeListener('roms:fileDetected', listener)
    },
  },
  saves: {
    listDeviceFiles: (serial: string, dir: string) =>
      ipcRenderer.invoke('saves:listDeviceFiles', serial, dir),
    sha256Device: (serial: string, p: string) => ipcRenderer.invoke('saves:sha256Device', serial, p),
    deviceFileSize: (serial: string, p: string) =>
      ipcRenderer.invoke('saves:deviceFileSize', serial, p),
    ensureRemoteDir: (serial: string, dir: string) =>
      ipcRenderer.invoke('saves:ensureRemoteDir', serial, dir),
    pullFile: (serial: string, dp: string, lp: string) =>
      ipcRenderer.invoke('saves:pullFile', serial, dp, lp),
    pushFile: (serial: string, lp: string, dp: string) =>
      ipcRenderer.invoke('saves:pushFile', serial, lp, dp),
    sha256Local: (lp: string) => ipcRenderer.invoke('saves:sha256Local', lp),
    writeText: (lp: string, content: string) => ipcRenderer.invoke('saves:writeText', lp, content),
    readText: (lp: string) => ipcRenderer.invoke('saves:readText', lp),
    listBackups: (emulatorId: string) => ipcRenderer.invoke('saves:listBackups', emulatorId),
    readManifest: (emulatorId: string, backupId: string) =>
      ipcRenderer.invoke('saves:readManifest', emulatorId, backupId),
  },
  vita: {
    listArchive: (p: string) => ipcRenderer.invoke('vita:listArchive', p),
    extractArchive: (p: string) => ipcRenderer.invoke('vita:extractArchive', p),
    readLocalBytes: (p: string) => ipcRenderer.invoke('vita:readLocalBytes', p),
    prepareOutputDir: (titleId: string) => ipcRenderer.invoke('vita:prepareOutputDir', titleId),
    createZipFromDir: (src: string, out: string) =>
      ipcRenderer.invoke('vita:createZipFromDir', src, out),
    writeText: (p: string, content: string) => ipcRenderer.invoke('vita:writeText', p, content),
    readText: (p: string) => ipcRenderer.invoke('vita:readText', p),
    sha256Local: (p: string) => ipcRenderer.invoke('vita:sha256Local', p),
    fileSize: (p: string) => ipcRenderer.invoke('vita:fileSize', p),
    copyLocal: (src: string, dest: string) => ipcRenderer.invoke('vita:copyLocal', src, dest),
    resolvePcOutputDir: (configured: string) =>
      ipcRenderer.invoke('vita:resolvePcOutputDir', configured),
    removeWorkDir: (dir: string) => ipcRenderer.invoke('vita:removeWorkDir', dir),
    downloadFirmware: (id: string) => ipcRenderer.invoke('vita:downloadFirmware', id),
  },
})
