export * from './biosDetect'
export * from './biosProcess'

import type { BiosIpc } from './biosProcess'

export function makeDefaultBiosIpc(): BiosIpc {
  return {
    sha256Local: (localPath) => window.electronAPI.roms.sha256Local(localPath),
    sha256Device: (serial, remotePath) => window.electronAPI.roms.sha256Device(serial, remotePath),
    ensureRemoteDir: (serial, remoteDir) => window.electronAPI.roms.ensureRemoteDir(serial, remoteDir),
    pushFile: (serial, localPath, remotePath) => window.electronAPI.adb.pushFile(serial, localPath, remotePath),
  }
}

export function makeSimulationBiosIpc(): BiosIpc {
  const store = new Map<string, string>()

  function fakeHash(name: string): string {
    let h = 0
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
    return h.toString(16).padStart(8, '0').repeat(8)
  }

  return {
    sha256Local: async (localPath) => fakeHash(localPath),
    sha256Device: async (_serial, remotePath) => {
      const h = store.get(remotePath)
      if (!h) throw new Error('File not on device')
      return h
    },
    ensureRemoteDir: async () => {},
    pushFile: async (_serial, localPath, remotePath) => {
      store.set(remotePath, fakeHash(localPath))
    },
  }
}
