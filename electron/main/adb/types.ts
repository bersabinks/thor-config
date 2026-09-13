export interface AdbDevice {
  serial: string
  model: string
  state: 'device' | 'offline' | 'unauthorized'
}

export interface PackageInfo {
  packageName: string
  versionName: string
  versionCode: number
}

export interface AdbClient {
  listDevices(): Promise<AdbDevice[]>
  getDeviceProps(serial: string): Promise<Record<string, string>>
  pushFile(serial: string, localPath: string, remotePath: string): Promise<void>
  pullFile(serial: string, remotePath: string, localPath: string): Promise<void>
  shell(serial: string, cmd: string): Promise<string>
  installApk(serial: string, apkPath: string): Promise<void>
  uninstallApk(serial: string, packageName: string): Promise<void>
  getPackageInfo(serial: string, packageName: string): Promise<PackageInfo | null>
  waitForDevice(serial: string, timeoutMs?: number): Promise<void>
}
