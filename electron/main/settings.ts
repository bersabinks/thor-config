import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'

export interface AppSettings {
  simulationMode: boolean
  aynAbxyLayout: 'Xbox' | 'Nintendo'
  aynTriggerMode: 'Analog' | 'Digital'
  firmwareUpdateWaitSeconds: number
}

const DEFAULT_SETTINGS: AppSettings = {
  simulationMode: true,
  aynAbxyLayout: 'Xbox',
  aynTriggerMode: 'Analog',
  firmwareUpdateWaitSeconds: 30,
}

let inMemorySettings: AppSettings | null = null

function getSettingsPath(): string {
  const userDataPath = app.getPath('userData')
  mkdirSync(userDataPath, { recursive: true })
  return join(userDataPath, 'settings.json')
}

export function getSettings(): AppSettings {
  if (inMemorySettings) return inMemorySettings
  const path = getSettingsPath()
  if (existsSync(path)) {
    try {
      inMemorySettings = { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(path, 'utf-8')) }
    } catch {
      inMemorySettings = { ...DEFAULT_SETTINGS }
    }
  } else {
    inMemorySettings = { ...DEFAULT_SETTINGS }
  }
  return inMemorySettings!
}

export function setSettings(update: Partial<AppSettings>): void {
  inMemorySettings = { ...getSettings(), ...update }
  try {
    writeFileSync(getSettingsPath(), JSON.stringify(inMemorySettings, null, 2))
  } catch (err) {
    console.error('Failed to persist settings:', err)
  }
}
