import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc/handlers'
import { initAppLog, logRendererMessage } from './diagnostics/appLog'
import { startAdbSetup } from './adb/platformToolsService'

const isDev = !app.isPackaged

// Journal du jour (userData/logs/app-AAAA-MM-JJ.log), repris dans le pack de diagnostic.
initAppLog(join(app.getPath('userData'), 'logs'))

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    title: 'ThorConfig',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.webContents.on('console-message', (_e, level, message, line, sourceId) =>
    logRendererMessage(level, message, sourceId, line)
  )

  if (isDev) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  console.log(`ThorConfig ${app.getVersion()} démarré (${process.platform}, Electron ${process.versions.electron})`)
  registerIpcHandlers()
  createWindow()
  // Zero-Setup ADB : télécharge les platform-tools si aucun adb n'est présent.
  void startAdbSetup()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
