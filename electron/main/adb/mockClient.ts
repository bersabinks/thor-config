import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { basename, dirname } from 'path'
import { MOCK_FIXTURES } from '@mocks/fixtures'
import { SimulatedDevice, fakeSha256, type MockScenario, type RemoteFile } from '@mocks/simulatedDevice'
import { AdbError, type AdbErrorCode } from './errors'
import type { AdbClient, AdbDevice, PackageInfo } from './types'

export const MOCK_SERIAL = 'mock-ayn-thor-001'

export type MockConnectionState = 'device' | 'offline' | 'unauthorized' | 'disconnected'

export interface MockAdbOptions {
  /** État initial de la console (défaut 'configured'). */
  scenario?: MockScenario
  /** 'realistic' (défaut) reproduit les délais d'une vraie console ; 'none' pour les tests. */
  latency?: 'realistic' | 'none'
  /** Désactive les logs console. */
  quiet?: boolean
}

/** Panne ADB injectée, pour vérifier la gestion d'erreurs sans matériel. */
export interface MockFault {
  code: AdbErrorCode
  /**
   * Filtre sur la description de l'appel (« shell settings put … », « push a b »,
   * « install x.apk », « listDevices »…). Absent = n'importe quel appel.
   */
  match?: string | RegExp
  /** Nombre d'appels touchés (défaut 1 ; Infinity = permanent). */
  times?: number
}

const CONNECTION_ERRORS: Record<Exclude<MockConnectionState, 'device'>, AdbErrorCode> = {
  disconnected: 'DEVICE_DISCONNECTED',
  offline: 'DEVICE_OFFLINE',
  unauthorized: 'DEVICE_UNAUTHORIZED',
}

const MAX_HASHED_BYTES = 8 * 1024 * 1024
const MAX_TEXT_BYTES = 64 * 1024

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function matches(filter: MockFault['match'], call: string): boolean {
  if (filter === undefined) return true
  return typeof filter === 'string' ? call.includes(filter) : filter.test(call)
}

/** Empreinte d'un fichier local poussé : vrai SHA-256 s'il existe et reste raisonnable. */
function describeLocal(localPath: string): RemoteFile {
  try {
    if (existsSync(localPath)) {
      const stat = statSync(localPath)
      const size = stat.size
      if (stat.isFile() && size <= MAX_HASHED_BYTES) {
        const buf = readFileSync(localPath)
        return {
          size,
          sha256: createHash('sha256').update(buf).digest('hex'),
          content: size <= MAX_TEXT_BYTES ? buf.toString('utf-8') : undefined,
        }
      }
      return { size, sha256: fakeSha256(basename(localPath)) }
    }
  } catch {
    /* fichier illisible : empreinte factice */
  }
  return { size: 0, sha256: fakeSha256(basename(localPath)) }
}

/**
 * Client ADB de simulation : transport (délais, état de connexion, pannes
 * injectées) au-dessus d'une console à état (SimulatedDevice). Les erreurs
 * levées sont les mêmes AdbError que RealAdbClient.
 */
export class MockAdbClient implements AdbClient {
  readonly device: SimulatedDevice
  private connection: MockConnectionState = 'device'
  private faults: Array<{ fault: MockFault; remaining: number }> = []
  private readonly realistic: boolean
  private readonly quiet: boolean

  constructor(options: MockAdbOptions = {}) {
    this.device = new SimulatedDevice(options.scenario)
    this.realistic = (options.latency ?? 'realistic') === 'realistic'
    this.quiet = options.quiet ?? false
  }

  get connectionState(): MockConnectionState {
    return this.connection
  }

  /** Simule un débranchement, une console hors ligne ou non autorisée. */
  setConnectionState(state: MockConnectionState): void {
    this.connection = state
  }

  injectFault(fault: MockFault): void {
    this.faults.push({ fault, remaining: fault.times ?? 1 })
  }

  clearFaults(): void {
    this.faults = []
  }

  /** Point d'entrée commun : log, latence, panne injectée, état de connexion. */
  private async enter(call: string, delayMs: number, needsDevice = true): Promise<void> {
    if (!this.quiet) console.log(`[MockADB] ${call}`)
    if (this.realistic && delayMs > 0) await delay(delayMs)

    const hit = this.faults.find((f) => f.remaining > 0 && matches(f.fault.match, call))
    if (hit) {
      hit.remaining--
      throw new AdbError(hit.fault.code, `simulation : ${call}`)
    }
    if (needsDevice && this.connection !== 'device') {
      throw new AdbError(CONNECTION_ERRORS[this.connection], `simulation : ${call}`)
    }
  }

  async listDevices(): Promise<AdbDevice[]> {
    await this.enter('listDevices', 0, false)
    if (this.connection === 'disconnected') return []
    return [{ serial: MOCK_SERIAL, model: 'AYN Thor Max (simulation)', state: this.connection }]
  }

  async getDeviceProps(_serial: string): Promise<Record<string, string>> {
    await this.enter('getDeviceProps', MOCK_FIXTURES.commandDelayMs)
    return { ...MOCK_FIXTURES.deviceProps }
  }

  async pushFile(_serial: string, localPath: string, remotePath: string): Promise<void> {
    await this.enter(`push ${localPath} ${remotePath}`, MOCK_FIXTURES.transferDelayMs)
    this.device.pushFile(remotePath, describeLocal(localPath))
  }

  async pullFile(_serial: string, remotePath: string, localPath: string): Promise<void> {
    await this.enter(`pull ${remotePath} ${localPath}`, MOCK_FIXTURES.transferDelayMs)
    const file = this.device.pullFile(remotePath)
    if (file.content !== undefined) {
      mkdirSync(dirname(localPath), { recursive: true })
      writeFileSync(localPath, file.content)
    }
  }

  async shell(_serial: string, cmd: string): Promise<string> {
    await this.enter(`shell ${cmd}`, MOCK_FIXTURES.commandDelayMs)
    return this.device.shell(cmd)
  }

  async installApk(_serial: string, apkPath: string): Promise<void> {
    await this.enter(`install ${apkPath}`, MOCK_FIXTURES.installDelayMs)
    this.device.installApk(apkPath)
  }

  async uninstallApk(_serial: string, packageName: string): Promise<void> {
    await this.enter(`uninstall ${packageName}`, MOCK_FIXTURES.commandDelayMs)
    this.device.uninstall(packageName)
  }

  async getPackageInfo(_serial: string, packageName: string): Promise<PackageInfo | null> {
    await this.enter(`getPackageInfo ${packageName}`, MOCK_FIXTURES.commandDelayMs)
    return this.device.getPackageInfo(packageName)
  }

  /** Attend le retour de la console (setConnectionState('device')) ou lève TIMEOUT. */
  async waitForDevice(_serial: string, timeoutMs = 120000): Promise<void> {
    await this.enter(`waitForDevice (timeout=${timeoutMs}ms)`, 0, false)
    const deadline = Date.now() + timeoutMs
    while (this.connection !== 'device') {
      if (Date.now() >= deadline) {
        throw new AdbError('TIMEOUT', 'simulation : wait-for-device', `Délai dépassé (${Math.round(timeoutMs / 1000)} s) — la console ne répond pas.`)
      }
      await delay(250)
    }
    if (this.realistic) await delay(Math.min(300, timeoutMs))
  }
}
