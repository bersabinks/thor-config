import type { PackageInfo } from '../../electron/main/adb/types'

export interface MockFixtures {
  deviceProps: Record<string, string>
  shellResponses: Record<string, string>
  installedPackages: Record<string, PackageInfo>
  commandDelayMs: number
  transferDelayMs: number
  installDelayMs: number
}

export const MOCK_FIXTURES: MockFixtures = {
  deviceProps: {
    'ro.product.model': 'AYN Thor Max',
    'ro.product.manufacturer': 'AYN',
    'ro.build.version.release': '13',
    'ro.build.version.sdk': '33',
    'ro.build.version.incremental': '20240101.001',
    'ro.product.cpu.abi': 'arm64-v8a',
    'ro.sf.lcd_density': '240',
  },

  // Clé = sous-chaîne de la commande shell ; valeur = réponse simulée
  shellResponses: {
    'input keyevent KEYCODE_WAKEUP': '',
    'dumpsys power | grep mWakefulness': 'mWakefulness=Awake',
    'getprop ro.build.version.incremental': '20240101.001',
    'settings get secure navigation_mode': '2',
    'pm list packages | grep ayn': 'package:com.ayn.settings',
    'pm list packages': 'package:com.ayn.settings\npackage:org.emulator.dolphin\n',
    'sha256sum': 'abc123def456  /sdcard/test.rom',
  },

  installedPackages: {},

  commandDelayMs: 200,
  transferDelayMs: 500,
  installDelayMs: 1500,
}
