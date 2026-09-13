import { MOCK_FIXTURES } from '@mocks/fixtures'
import type { AdbClient, AdbDevice, PackageInfo } from './types'

const MOCK_SERIAL = 'mock-ayn-thor-001'

function log(method: string, ...args: unknown[]) {
  console.log(`[MockADB] ${method}(`, ...args, ')')
}

export class MockAdbClient implements AdbClient {
  async listDevices(): Promise<AdbDevice[]> {
    log('listDevices')
    return [{ serial: MOCK_SERIAL, model: 'AYN Thor Max (simulation)', state: 'device' }]
  }

  async getDeviceProps(serial: string): Promise<Record<string, string>> {
    log('getDeviceProps', serial)
    return MOCK_FIXTURES.deviceProps
  }

  async pushFile(serial: string, localPath: string, remotePath: string): Promise<void> {
    log('pushFile', serial, localPath, remotePath)
    await delay(MOCK_FIXTURES.transferDelayMs)
  }

  async pullFile(serial: string, remotePath: string, localPath: string): Promise<void> {
    log('pullFile', serial, remotePath, localPath)
    await delay(MOCK_FIXTURES.transferDelayMs)
  }

  async shell(serial: string, cmd: string): Promise<string> {
    log('shell', serial, cmd)
    await delay(MOCK_FIXTURES.commandDelayMs)

    for (const [pattern, response] of Object.entries(MOCK_FIXTURES.shellResponses)) {
      if (cmd.includes(pattern)) return response
    }
    return ''
  }

  async installApk(serial: string, apkPath: string): Promise<void> {
    log('installApk', serial, apkPath)
    await delay(MOCK_FIXTURES.installDelayMs)
  }

  async uninstallApk(serial: string, packageName: string): Promise<void> {
    log('uninstallApk', serial, packageName)
    await delay(MOCK_FIXTURES.commandDelayMs)
  }

  async getPackageInfo(serial: string, packageName: string): Promise<PackageInfo | null> {
    log('getPackageInfo', serial, packageName)
    await delay(MOCK_FIXTURES.commandDelayMs)
    return MOCK_FIXTURES.installedPackages[packageName] ?? null
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
