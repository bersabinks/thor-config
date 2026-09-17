import { execFile } from 'child_process'
import type { AdbClient, AdbDevice, PackageInfo } from './types'
import { AdbError, classifyAdbFailure } from './errors'
import { resolveAdbPath } from './adbPath'

/** Délais maximum par type d'opération : au-delà, la console est considérée comme muette. */
export const ADB_TIMEOUTS = {
  listDevices: 15_000,
  shell: 60_000,
  /** push/pull de ROMs volumineuses (ISO de plusieurs Gio en USB 2). */
  transfer: 30 * 60_000,
  install: 5 * 60_000,
  waitForDevice: 120_000,
}

/** Un dump uiautomator ou un `find` sur une grosse bibliothèque dépasse le 1 Mio par défaut. */
const MAX_BUFFER = 64 * 1024 * 1024

export class RealAdbClient implements AdbClient {
  /**
   * @param adbPath binaire adb imposé ; sinon résolu à chaque appel (le testeur
   * peut installer les platform-tools sans relancer l'app).
   */
  constructor(private readonly adbPath?: string) {}

  /** Exécute adb ; tout échec est converti en AdbError typée (voir errors.ts). */
  private run(args: string[], timeoutMs: number): Promise<string> {
    let custom: string | undefined
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getSettings } = require('../settings')
      custom = getSettings()?.customAdbPath
    } catch {
      // ignore
    }
    const bin = this.adbPath ?? resolveAdbPath(process.env, undefined, undefined, custom)
    return new Promise((resolve, reject) => {
      execFile(
        bin,
        args,
        { timeout: timeoutMs, maxBuffer: MAX_BUFFER, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            reject(
              classifyAdbFailure(
                {
                  code: error.code,
                  killed: error.killed,
                  signal: error.signal,
                  stdout: String(stdout ?? ''),
                  stderr: String(stderr ?? ''),
                  message: error.message,
                },
                timeoutMs
              )
            )
            return
          }
          resolve(String(stdout).trim())
        }
      )
    })
  }

  async listDevices(): Promise<AdbDevice[]> {
    const output = await this.run(['devices', '-l'], ADB_TIMEOUTS.listDevices)
    return output
      .split(/\r?\n/)
      .slice(1)
      .filter((line) => line.includes('\t') && !line.startsWith('*'))
      .map((line) => {
        const tabIdx = line.indexOf('\t')
        const serial = line.slice(0, tabIdx).trim()
        const rest = line.slice(tabIdx + 1).trim()
        const modelMatch = rest.match(/model:(\S+)/)
        const state = rest.startsWith('device') ? 'device' : rest.startsWith('offline') ? 'offline' : 'unauthorized'
        return { serial, model: modelMatch?.[1]?.replace(/_/g, ' ') ?? 'Unknown', state }
      })
  }

  async getDeviceProps(serial: string): Promise<Record<string, string>> {
    const output = await this.run(['-s', serial, 'shell', 'getprop'], ADB_TIMEOUTS.shell)
    const props: Record<string, string> = {}
    for (const line of output.split(/\r?\n/)) {
      const match = line.match(/^\[(.+)\]:\s*\[(.*)]\s*$/)
      if (match) props[match[1]] = match[2]
    }
    return props
  }

  async pushFile(serial: string, localPath: string, remotePath: string): Promise<void> {
    await this.run(['-s', serial, 'push', localPath, remotePath], ADB_TIMEOUTS.transfer)
  }

  async pullFile(serial: string, remotePath: string, localPath: string): Promise<void> {
    await this.run(['-s', serial, 'pull', remotePath, localPath], ADB_TIMEOUTS.transfer)
  }

  async shell(serial: string, cmd: string): Promise<string> {
    return this.run(['-s', serial, 'shell', cmd], ADB_TIMEOUTS.shell)
  }

  async installApk(serial: string, apkPath: string): Promise<void> {
    await this.run(['-s', serial, 'install', '-r', apkPath], ADB_TIMEOUTS.install)
  }

  async uninstallApk(serial: string, packageName: string): Promise<void> {
    await this.run(['-s', serial, 'uninstall', packageName], ADB_TIMEOUTS.shell)
  }

  async waitForDevice(serial: string, timeoutMs = ADB_TIMEOUTS.waitForDevice): Promise<void> {
    await this.run(['-s', serial, 'wait-for-device'], timeoutMs)
  }

  async getPackageInfo(serial: string, packageName: string): Promise<PackageInfo | null> {
    let output: string
    try {
      output = await this.run(['-s', serial, 'shell', `dumpsys package ${packageName}`], ADB_TIMEOUTS.shell)
    } catch (err) {
      // Échec de la commande elle-même → paquet considéré absent. Une console
      // injoignable doit en revanche remonter, pour être retentée ou signalée.
      if (err instanceof AdbError && err.code === 'COMMAND_FAILED') return null
      throw err
    }
    if (!output.includes('Package [')) return null
    const versionNameMatch = output.match(/versionName=(\S+)/)
    const versionCodeMatch = output.match(/versionCode=(\d+)/)
    return {
      packageName,
      versionName: versionNameMatch?.[1] ?? '0',
      versionCode: parseInt(versionCodeMatch?.[1] ?? '0', 10),
    }
  }
}
