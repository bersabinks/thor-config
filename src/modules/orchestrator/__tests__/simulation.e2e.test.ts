import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MockAdbClient, MOCK_SERIAL, type MockAdbOptions } from '../../../../electron/main/adb/mockClient'
import { createSimulatedElectronApi } from '../../../mocks/simulatedElectronApi'
import sources from '../../emulators/sources.json'
import { OBTAINIUM_APPS_JSON_REMOTE_PATH, OBTAINIUM_SOURCE } from '../../emulators'
import {
  buildThorModules,
  makeDefaultPreCheckIpc,
  makeDeviceGuard,
  runOrchestrator,
  runPreChecks,
  type ModulePhase,
  type OrchestratorHandlers,
  type OrchestratorResult,
} from '..'

/**
 * Déroulé complet du bouton « Configurer ma console » en mode simulation, sans
 * aucun appareil : même assemblage que OrchestratorModule.tsx, avec
 * window.electronAPI branché sur MockAdbClient (erreurs sérialisées comme l'IPC
 * Electron). Les délais (retries, attente firmware, navigation UI) passent en
 * temps simulé.
 */

const ORDER = ['prechecks', 'prepare', 'emulators', 'roms', 'saves', 'vita', 'launcher', 'utilities']

/** Fait avancer le temps simulé jusqu'à ce que la promesse se termine. */
async function drive<T>(promise: Promise<T>): Promise<T> {
  let settled = false
  promise.then(
    () => (settled = true),
    () => (settled = true)
  )
  for (let i = 0; i < 20_000 && !settled; i++) await vi.advanceTimersByTimeAsync(500)
  if (!settled) throw new Error('Orchestrateur bloqué en simulation')
  return promise
}

function setup(options: MockAdbOptions = {}): MockAdbClient {
  const client = new MockAdbClient({ latency: 'none', quiet: true, ...options })
  vi.stubGlobal('window', { electronAPI: createSimulatedElectronApi(client) })
  return client
}

async function runFull(handlers: OrchestratorHandlers = {}): Promise<OrchestratorResult> {
  const ipc = makeDefaultPreCheckIpc()
  const modules = await drive(buildThorModules({ simulation: true }))
  return drive(
    runOrchestrator({
      serial: MOCK_SERIAL,
      modules,
      preChecks: () => runPreChecks(ipc).then((r) => ({ steps: r.steps, canProceed: r.canProceed })),
      guard: makeDeviceGuard(ipc),
      guardPollMs: 1000,
      handlers,
    })
  )
}

const mod = (res: OrchestratorResult, id: string) => res.modules.find((m) => m.moduleId === id)!
const step = (res: OrchestratorResult, id: string, label: string) =>
  mod(res, id).steps.find((s) => s.label.includes(label))!

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Orchestrateur en simulation — bout en bout', () => {
  it('console déjà configurée : tous les modules s’exécutent, aucun échec', async () => {
    setup({ scenario: 'configured' })
    const res = await runFull()

    expect(res.aborted).toBe(false)
    expect(res.modules.map((m) => m.moduleId)).toEqual(ORDER)
    // Aucun module ignoré faute de données : la simulation couvre tout le parcours.
    expect(res.modules.filter((m) => m.overallStatus === 'skipped')).toEqual([])
    expect(res.modules.filter((m) => m.overallStatus === 'failed')).toEqual([])
    expect(mod(res, 'prechecks').overallStatus).toBe('success')
    expect(mod(res, 'prepare').overallStatus).toBe('success')
    expect(res.report.totals.failed).toBe(0)
  })

  it('console sortie d’usine : l’état simulé est réellement modifié', async () => {
    const client = setup({ scenario: 'fresh' })
    const res = await runFull()

    expect(res.aborted).toBe(false)
    expect(client.device.settings.get('secure/navigation_mode')).toBe('2')
    // DuckStation n'est pas installable automatiquement (Google Play uniquement).
    for (const s of sources.filter((x) => x.sourceType !== 'playstore')) {
      expect(client.device.getPackageInfo(s.packageName), s.packageName).not.toBeNull()
      expect(step(res, 'emulators', `${s.displayName} — Installation`).status).toBe('success')
    }
    const duck = sources.find((s) => s.sourceType === 'playstore')!
    expect(step(res, 'emulators', `${duck.displayName} — Installation`).status).toBe('skipped')
    expect(client.device.getPackageInfo(duck.packageName)).toBeNull()
    // Émulateurs installés → la sauvegarde initiale s'exécute.
    expect(mod(res, 'saves').overallStatus).not.toBe('skipped')

    // Obtainium installé par le même pipeline, alimenté avec la liste des émulateurs.
    expect(step(res, 'emulators', 'Obtainium — Installation').status).toBe('success')
    expect(client.device.getPackageInfo(OBTAINIUM_SOURCE.packageName)).not.toBeNull()
    expect(step(res, 'emulators', 'Obtainium — Liste des émulateurs').status).toBe('success')
    const appsJson = JSON.parse(client.device.files.get(OBTAINIUM_APPS_JSON_REMOTE_PATH)!.content!)
    expect(appsJson.apps.map((a: { id: string }) => a.id)).toEqual(
      sources.filter((s) => s.sourceType !== 'playstore').map((s) => s.packageName)
    )
    expect(step(res, 'emulators', 'Obtainium — Import').status).toBe('skipped')
    expect(mod(res, 'prepare').overallStatus).toBe('success')
  })
})

describe('Orchestrateur en simulation — erreurs ADB', () => {
  it('déconnexion entre deux modules : pause puis reprise automatique', async () => {
    const client = setup()
    const events: string[] = []
    const res = await runFull({
      onModulePhase: (id, phase: ModulePhase) => {
        events.push(`${id}:${phase}`)
        if (id === 'emulators' && phase !== 'running') client.setConnectionState('disconnected')
      },
      onPause: (id, reason) => {
        events.push(`pause:${id}:${reason}`)
        setTimeout(() => client.setConnectionState('device'), 10_000)
      },
      onResume: (id) => events.push(`resume:${id}`),
    })

    const pauses = events.filter((e) => e.startsWith('pause:'))
    expect(pauses).toHaveLength(1)
    expect(pauses[0]).toMatch(/^pause:roms:Console déconnectée/)
    expect(events.indexOf('resume:roms')).toBeLessThan(events.indexOf('roms:running'))
    expect(res.aborted).toBe(false)
    expect(res.modules.filter((m) => m.overallStatus === 'failed')).toEqual([])
  })

  it('déconnexion passagère pendant une commande : l’étape est retentée et réussit', async () => {
    const client = setup()
    client.injectFault({ code: 'DEVICE_DISCONNECTED', match: 'settings get secure navigation_mode', times: 1 })
    const res = await runFull()

    const gesture = step(res, 'prepare', 'Navigation par gestes')
    expect(gesture.status).toBe('success')
    expect(gesture.attempts).toBe(2)
  })

  it('timeout répété : échec après retries sans bloquer les modules suivants', async () => {
    const client = setup()
    client.injectFault({ code: 'TIMEOUT', match: 'uiautomator dump', times: Infinity })
    const res = await runFull()

    const abxy = step(res, 'prepare', 'Layout ABXY')
    expect(abxy.status).toBe('failed_after_retries')
    expect(abxy.attempts).toBe(3)
    expect(abxy.errorCode).toBe('TIMEOUT')
    expect(abxy.error).toContain('Délai dépassé')
    expect(mod(res, 'launcher').overallStatus).not.toBe('failed')
  })

  it('permission refusée : échec immédiat, message lisible, run poursuivi', async () => {
    const client = setup({ scenario: 'fresh' })
    client.injectFault({ code: 'PERMISSION_DENIED', match: 'settings put', times: Infinity })
    const res = await runFull()

    const gesture = step(res, 'prepare', 'Navigation par gestes')
    expect(gesture.status).toBe('failed_after_retries')
    expect(gesture.attempts).toBe(1)
    expect(gesture.errorCode).toBe('PERMISSION_DENIED')
    expect(gesture.error).toMatch(/Permission refusée/)
    expect(gesture.error).not.toMatch(/Error invoking|\[ADB:/)
    expect(step(res, 'emulators', 'Installation').status).toBe('success')
  })

  it('console débranchée au lancement : pré-vérifications bloquantes', async () => {
    const client = setup()
    client.setConnectionState('disconnected')
    const res = await runFull()

    expect(res.aborted).toBe(true)
    expect(step(res, 'prechecks', 'Console connectée').status).toBe('failed_after_retries')
    expect(res.modules.slice(1).every((m) => m.overallStatus === 'skipped')).toBe(true)
  })

  it('débogage USB non autorisé : blocage avec la consigne à suivre', async () => {
    const client = setup()
    client.setConnectionState('unauthorized')
    const res = await runFull()

    expect(res.aborted).toBe(true)
    expect(step(res, 'prechecks', 'Débogage USB autorisé').error).toMatch(/Autorisez le débogage USB/)
  })

  it('adb introuvable : message orienté installation des platform-tools', async () => {
    const client = setup()
    client.injectFault({ code: 'ADB_NOT_FOUND', match: 'listDevices', times: Infinity })
    const res = await runFull()

    expect(res.aborted).toBe(true)
    const adb = step(res, 'prechecks', 'Plate-forme ADB disponible')
    expect(adb.error).toMatch(/platform-tools/)
    expect(adb.error).not.toMatch(/Error invoking|\[ADB:/)
  })
})
