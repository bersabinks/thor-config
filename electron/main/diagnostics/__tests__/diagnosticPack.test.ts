import { afterEach, describe, expect, it } from 'vitest'
import AdmZip from 'adm-zip'
import { createHash } from 'crypto'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { MockAdbClient } from '../../adb/mockClient'
import {
  collectDeviceDiagnostics,
  diagnosticFileName,
  writeDiagnosticPack,
  DIAGNOSTIC_ENTRIES,
} from '../diagnosticPack'
import { createAppLogger, formatLogLine, logFileName } from '../appLog'

let dir = ''
const tmp = () => (dir = mkdtempSync(join(tmpdir(), 'thor-diag-')))
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = ''
})

const client = () => new MockAdbClient({ latency: 'none', quiet: true })

describe('collectDeviceDiagnostics', () => {
  it('console connectée : getprop complet et dernier dump UI', async () => {
    const d = await collectDeviceDiagnostics(client())
    expect(d.getprop).toMatch(/^# AYN Thor Max \(simulation\) \(mock-ayn-thor-001\)/)
    expect(d.getprop).toContain('[ro.product.model]: [AYN Thor Max]')
    expect(d.uiDump).toContain('<hierarchy')
  })

  it('console débranchée : note explicite, pas de dump', async () => {
    const c = client()
    c.setConnectionState('disconnected')
    const d = await collectDeviceDiagnostics(c)
    expect(d.getprop).toMatch(/Aucune console connectée/)
    expect(d.uiDump).toBeNull()
  })

  it('console non autorisée : état signalé', async () => {
    const c = client()
    c.setConnectionState('unauthorized')
    expect((await collectDeviceDiagnostics(c)).getprop).toMatch(/état « unauthorized »/)
  })

  it('getprop en échec : l’erreur est consignée au lieu de faire échouer l’export', async () => {
    const c = client()
    c.injectFault({ code: 'TIMEOUT', match: 'shell getprop' })
    const d = await collectDeviceDiagnostics(c)
    expect(d.getprop).toMatch(/getprop a échoué : Délai dépassé/)
    expect(d.uiDump).toContain('<hierarchy')
  })

  it('aucun dump UI sur la console : entrée absente', async () => {
    const c = client()
    c.injectFault({ code: 'COMMAND_FAILED', match: 'window_dump.xml' })
    expect((await collectDeviceDiagnostics(c)).uiDump).toBeNull()
  })
})

describe('writeDiagnosticPack', () => {
  it('zip lisible avec les 4 fichiers et SHA-256 du fichier écrit', async () => {
    const out = join(tmp(), 'sortie', 'diag.zip')
    const audit = JSON.stringify([{ label: 'Navigation par gestes', status: 'success' }])
    const res = writeDiagnosticPack(out, {
      auditLogJson: audit,
      appLog: '2026-09-15T10:00:00.000Z [INFO] [main] démarré\n',
      getprop: '[ro.product.model]: [AYN Thor Max]\n',
      uiDump: '<hierarchy/>',
    })

    expect(res.entries.sort()).toEqual(Object.values(DIAGNOSTIC_ENTRIES).sort())
    expect(res.sha256).toBe(createHash('sha256').update(readFileSync(out)).digest('hex'))
    const zip = new AdmZip(out)
    expect(zip.readAsText(DIAGNOSTIC_ENTRIES.auditLog)).toBe(audit)
    expect(zip.readAsText(DIAGNOSTIC_ENTRIES.uiDump)).toBe('<hierarchy/>')
  })

  it('sans dump UI ni log du jour : pas de thorconfig-ui.xml, app.log explicatif', () => {
    const out = join(tmp(), 'diag.zip')
    const res = writeDiagnosticPack(out, { auditLogJson: '[]', appLog: null, getprop: '#', uiDump: null })
    expect(res.entries).not.toContain(DIAGNOSTIC_ENTRIES.uiDump)
    expect(new AdmZip(out).readAsText(DIAGNOSTIC_ENTRIES.appLog)).toMatch(/Aucun log/)
  })

  it('nom de fichier horodaté', () => {
    expect(diagnosticFileName(new Date(2026, 8, 5, 7, 3))).toBe('ThorConfig-diagnostic-20260905-0703.zip')
  })
})

describe('journal applicatif du jour', () => {
  it('écrit une ligne par appel dans le fichier du jour et le relit', () => {
    const logs = tmp()
    const now = new Date(2026, 8, 15, 14, 30)
    const logger = createAppLogger(logs, () => now)
    logger.write('info', 'main', ['ADB prêt', { devices: 1 }])
    logger.write('warn', 'renderer', ['tentative 2'])

    expect(logFileName(now)).toBe('app-2026-09-15.log')
    const content = logger.readToday()!
    expect(content.split('\n').filter(Boolean)).toHaveLength(2)
    expect(content).toContain('[INFO] [main] ADB prêt { devices: 1 }')
    expect(content).toContain('[WARN] [renderer] tentative 2')
  })

  it('aucun log aujourd’hui : null', () => {
    expect(createAppLogger(tmp()).readToday()).toBeNull()
  })

  it('formatLogLine horodate en ISO', () => {
    const line = formatLogLine('error', 'main', ['boom'], new Date('2026-09-15T12:00:00.000Z'))
    expect(line).toBe('2026-09-15T12:00:00.000Z [ERROR] [main] boom\n')
  })
})
