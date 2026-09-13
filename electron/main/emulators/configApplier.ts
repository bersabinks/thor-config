import { join } from 'path'
import { tmpdir } from 'os'
import { readFileSync, writeFileSync } from 'fs'
import { getAdbClient } from '../adb/factory'
import { getSettings } from '../settings'

function applyIniSettings(content: string, settings: Record<string, string>): string {
  let result = content
  for (const [key, value] of Object.entries(settings)) {
    const regex = new RegExp(`^(${key}\\s*=).*`, 'm')
    if (regex.test(result)) {
      result = result.replace(regex, `$1${value}`)
    } else {
      result = result.trimEnd() + `\n${key}=${value}\n`
    }
  }
  return result
}

function readIniSettings(content: string, keys: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of keys) {
    const regex = new RegExp(`^${key}\\s*=\\s*(.*)`, 'm')
    const match = regex.exec(content)
    result[key] = match?.[1]?.trim() ?? ''
  }
  return result
}

function tempPath(): string {
  return join(tmpdir(), `thorconfig-${Date.now()}-${Math.random().toString(36).slice(2)}.ini`)
}

export async function applyConfig(
  serial: string,
  configPath: string,
  settings: Record<string, string>
): Promise<void> {
  if (getSettings().simulationMode) return

  const client = getAdbClient()
  const local = tempPath()
  let content = ''

  try {
    await client.pullFile(serial, configPath, local)
    content = readFileSync(local, 'utf-8')
  } catch {
    // Le fichier de config n'existe pas encore sur l'appareil → on le crée
  }

  const updated = applyIniSettings(content, settings)
  writeFileSync(local, updated, 'utf-8')
  await client.pushFile(serial, local, configPath)
}

export async function verifyConfig(
  serial: string,
  configPath: string,
  expectedSettings: Record<string, string>
): Promise<Record<string, string>> {
  if (getSettings().simulationMode) {
    return { ...expectedSettings }
  }

  const client = getAdbClient()
  const local = tempPath()
  await client.pullFile(serial, configPath, local)
  const content = readFileSync(local, 'utf-8')
  return readIniSettings(content, Object.keys(expectedSettings))
}
