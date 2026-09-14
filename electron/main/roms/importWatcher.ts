import chokidar, { type FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'

let watcher: FSWatcher | null = null

/**
 * Surveille le dossier d'import. Un fichier n'est signalé (`roms:fileDetected`)
 * qu'une fois stable — taille inchangée pendant `stableMs` — grâce à
 * `awaitWriteFinish`, pour ne pas traiter un fichier en cours de copie.
 */
export function startImportWatcher(folder: string, stableMs = 2000): void {
  stopImportWatcher()
  watcher = chokidar.watch(folder, {
    ignoreInitial: false,
    depth: 6,
    awaitWriteFinish: { stabilityThreshold: stableMs, pollInterval: 200 },
  })
  watcher.on('add', (path) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('roms:fileDetected', path)
    }
  })
}

export function stopImportWatcher(): void {
  if (watcher) {
    void watcher.close()
    watcher = null
  }
}
