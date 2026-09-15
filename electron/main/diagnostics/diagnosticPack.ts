import AdmZip from 'adm-zip'
import { createHash } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { AdbClient } from '../adb/types'
import { describeError } from '../adb/errors'

/** Même chemin que dumpUiHierarchy (src/modules/prepare/uiAutomation.ts). */
export const UI_DUMP_REMOTE_PATH = '/sdcard/window_dump.xml'

export const DIAGNOSTIC_ENTRIES = {
  auditLog: 'auditLog.json',
  appLog: 'app.log',
  getprop: 'getprop.txt',
  uiDump: 'thorconfig-ui.xml',
} as const

export interface DeviceDiagnostics {
  getprop: string
  /** Dernier dump UI Automator resté sur la console, s'il existe. */
  uiDump: string | null
}

export interface DiagnosticContents extends DeviceDiagnostics {
  auditLogJson: string
  appLog: string | null
}

export interface DiagnosticPackResult {
  path: string
  sha256: string
  bytes: number
  entries: string[]
}

const pad = (n: number) => String(n).padStart(2, '0')

export function diagnosticFileName(date: Date = new Date()): string {
  return `ThorConfig-diagnostic-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.zip`
}

/** Propriétés et dump UI de la première console autorisée ; jamais d'exception. */
export async function collectDeviceDiagnostics(client: AdbClient): Promise<DeviceDiagnostics> {
  let devices
  try {
    devices = await client.listDevices()
  } catch (err) {
    return { getprop: `# ADB indisponible : ${describeError(err)}\n`, uiDump: null }
  }

  const device = devices.find((d) => d.state === 'device')
  if (!device) {
    const other = devices[0]
    return {
      getprop: other
        ? `# Console « ${other.model} » (${other.serial}) en état « ${other.state} » : propriétés non lisibles.\n`
        : '# Aucune console connectée au moment de l’export.\n',
      uiDump: null,
    }
  }

  const header = `# ${device.model} (${device.serial}) — adb shell getprop\n`
  let getprop: string
  try {
    getprop = `${header}${await client.shell(device.serial, 'getprop')}\n`
  } catch (err) {
    getprop = `${header}# getprop a échoué : ${describeError(err)}\n`
  }

  let uiDump: string | null = null
  try {
    const xml = await client.shell(device.serial, `cat ${UI_DUMP_REMOTE_PATH}`)
    uiDump = xml.includes('<hierarchy') ? xml : null
  } catch {
    /* aucun dump sur la console */
  }
  return { getprop, uiDump }
}

export function buildDiagnosticZip(contents: DiagnosticContents): { buffer: Buffer; entries: string[] } {
  const zip = new AdmZip()
  const add = (name: string, text: string) => zip.addFile(name, Buffer.from(text, 'utf-8'))

  add(DIAGNOSTIC_ENTRIES.auditLog, contents.auditLogJson)
  add(DIAGNOSTIC_ENTRIES.appLog, contents.appLog ?? '# Aucun log Electron enregistré aujourd’hui.\n')
  add(DIAGNOSTIC_ENTRIES.getprop, contents.getprop)
  if (contents.uiDump !== null) add(DIAGNOSTIC_ENTRIES.uiDump, contents.uiDump)

  return { buffer: zip.toBuffer(), entries: zip.getEntries().map((e) => e.entryName) }
}

/** Écrit le zip puis calcule le SHA-256 du fichier réellement écrit. */
export function writeDiagnosticPack(outPath: string, contents: DiagnosticContents): DiagnosticPackResult {
  const { buffer, entries } = buildDiagnosticZip(contents)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, buffer)
  const written = readFileSync(outPath)
  return {
    path: outPath,
    sha256: createHash('sha256').update(written).digest('hex'),
    bytes: written.length,
    entries,
  }
}
