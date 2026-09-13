import { execFile } from 'child_process'
import { promisify } from 'util'
import type { AdbClient, AdbDevice, PackageInfo } from './types'

const execFileAsync = promisify(execFile)

async function runAdb(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('adb', args)
  return stdout.trim()
}

export class RealAdbClient implements AdbClient {
  async listDevices(): Promise<AdbDevice[]> {
    const output = await runAdb('devices', '-l')
    return output
      .split('\n')
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
    const output = await runAdb('-s', serial, 'shell', 'getprop')
    const props: Record<string, string> = {}
    for (const line of output.split('\n')) {
      const match = line.match(/^\[(.+)\]:\s*\[(.*)]\s*$/)
      if (match) props[match[1]] = match[2]
    }
    return props
  }

  async pushFile(serial: string, localPath: string, remotePath: string): Promise<void> {
    await runAdb('-s', serial, 'push', localPath, remotePath)
  }

  async pullFile(serial: string, remotePath: string, localPath: string): Promise<void> {
    await runAdb('-s', serial, 'pull', remotePath, localPath)
  }

  async shell(serial: string, cmd: string): Promise<string> {
    const output = await runAdb('-s', serial, 'shell', cmd)
    return output
  }

  async installApk(serial: string, apkPath: string): Promise<void> {
    await runAdb('-s', serial, 'install', '-r', apkPath)
  }

  async uninstallApk(serial: string, packageName: string): Promise<void> {
    await runAdb('-s', serial, 'uninstall', packageName)
  }

  async getPackageInfo(serial: string, packageName: string): Promise<PackageInfo | null> {
    try {
      const output = await runAdb('-s', serial, 'shell', `dumpsys package ${packageName}`)
      if (!output.includes('Package [')) return null
      const versionNameMatch = output.match(/versionName=(\S+)/)
      const versionCodeMatch = output.match(/versionCode=(\d+)/)
      return {
        packageName,
        versionName: versionNameMatch?.[1] ?? '0',
        versionCode: parseInt(versionCodeMatch?.[1] ?? '0', 10),
      }
    } catch {
      return null
    }
  }
}
