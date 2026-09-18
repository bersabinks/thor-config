import { join } from 'path'
import { tmpdir } from 'os'
import { readFileSync, writeFileSync } from 'fs'
import { getAdbClient } from '../adb/factory'
import { getSettings } from '../settings'

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface ParsedKey {
  section: string | null
  key: string
}

export function parseIniKey(fullKey: string): ParsedKey {
  const match = fullKey.match(/^\[([^\]]+)\]\s*(.+)$/)
  if (match) {
    return { section: match[1].trim(), key: match[2].trim() }
  }
  const dotIndex = fullKey.indexOf('.')
  if (dotIndex > 0 && !fullKey.includes(' ') && fullKey.indexOf('.') === fullKey.lastIndexOf('.')) {
    return { section: fullKey.slice(0, dotIndex).trim(), key: fullKey.slice(dotIndex + 1).trim() }
  }
  return { section: null, key: fullKey.trim() }
}

export function applyIniSettings(content: string, settings: Record<string, string>): string {
  let result = content

  for (const [fullKey, value] of Object.entries(settings)) {
    const { section, key } = parseIniKey(fullKey)

    if (section) {
      const sectionHeaderRegex = new RegExp(`^\\[${escapeRe(section)}\\]\\s*$`, 'm')
      const sectionMatch = sectionHeaderRegex.exec(result)

      if (sectionMatch && sectionMatch.index !== undefined) {
        const startIdx = sectionMatch.index + sectionMatch[0].length
        // Trouve la prochaine section ou la fin du texte
        const nextSectionMatch = /^\[[^\]]+\]/m.exec(result.slice(startIdx))
        const endIdx = nextSectionMatch ? startIdx + nextSectionMatch.index : result.length

        const sectionBody = result.slice(startIdx, endIdx)
        const keyRegex = new RegExp(`^(${escapeRe(key)}\\s*=).*$`, 'm')

        if (keyRegex.test(sectionBody)) {
          const updatedSectionBody = sectionBody.replace(keyRegex, `${key} = ${value}`)
          result = result.slice(0, startIdx) + updatedSectionBody + result.slice(endIdx)
        } else {
          // Insère la clé au début de la section
          const insertion = `\n${key} = ${value}`
          result = result.slice(0, startIdx) + insertion + result.slice(startIdx)
        }
      } else {
        // La section n'existe pas encore, on l'ajoute à la fin
        result = result.trimEnd() + `\n\n[${section}]\n${key} = ${value}\n`
      }
    } else {
      // Clé globale sans section
      const regex = new RegExp(`^(${escapeRe(key)}\\s*=).*`, 'm')
      if (regex.test(result)) {
        result = result.replace(regex, `${key} = ${value}`)
      } else {
        result = result.trimEnd() + `\n${key} = ${value}\n`
      }
    }
  }

  return result
}

export function readIniSettings(content: string, keys: string[]): Record<string, string> {
  const result: Record<string, string> = {}

  for (const fullKey of keys) {
    const { section, key } = parseIniKey(fullKey)

    if (section) {
      const sectionHeaderRegex = new RegExp(`^\\[${escapeRe(section)}\\]\\s*$`, 'm')
      const sectionMatch = sectionHeaderRegex.exec(content)

      if (sectionMatch && sectionMatch.index !== undefined) {
        const startIdx = sectionMatch.index + sectionMatch[0].length
        const nextSectionMatch = /^\[[^\]]+\]/m.exec(content.slice(startIdx))
        const endIdx = nextSectionMatch ? startIdx + nextSectionMatch.index : content.length

        const sectionBody = content.slice(startIdx, endIdx)
        const keyRegex = new RegExp(`^${escapeRe(key)}\\s*=\\s*(.*)$`, 'm')
        const match = keyRegex.exec(sectionBody)
        result[fullKey] = match?.[1]?.trim() ?? ''
      } else {
        result[fullKey] = ''
      }
    } else {
      const regex = new RegExp(`^${escapeRe(key)}\\s*=\\s*(.*)`, 'm')
      const match = regex.exec(content)
      result[fullKey] = match?.[1]?.trim() ?? ''
    }
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

  // S'assure que le dossier parent distant existe bien avant de push
  const lastSlash = configPath.lastIndexOf('/')
  if (lastSlash > 0) {
    const remoteDir = configPath.substring(0, lastSlash)
    try {
      await client.shell(serial, `mkdir -p "${remoteDir}"`)
    } catch {
      // ignore
    }
  }

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

