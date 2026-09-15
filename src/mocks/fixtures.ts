import type { PackageInfo } from '../../electron/main/adb/types'

export interface MockFixtures {
  deviceProps: Record<string, string>
  shellResponses: Record<string, string>
  installedPackages: Record<string, PackageInfo>
  commandDelayMs: number
  transferDelayMs: number
  installDelayMs: number
}

// XML de hiérarchie simulant l'écran AYN Settings après configuration (Xbox + Analog sélectionnés)
const AYN_SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="com.ayn.settings:id/root" class="android.widget.FrameLayout" package="com.ayn.settings" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][1080,2400]">
    <node index="0" text="Controller" resource-id="com.ayn.settings:id/menu_controller" class="android.widget.TextView" package="com.ayn.settings" content-desc="" checkable="false" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,100][1080,180]"/>
    <node index="1" text="Button Layout" resource-id="com.ayn.settings:id/menu_layout" class="android.widget.TextView" package="com.ayn.settings" content-desc="" checkable="false" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,200][1080,280]"/>
    <node index="2" text="Xbox" resource-id="com.ayn.settings:id/layout_xbox" class="android.widget.RadioButton" package="com.ayn.settings" content-desc="" checkable="true" checked="true" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="true" bounds="[32,300][540,380]"/>
    <node index="3" text="Nintendo" resource-id="com.ayn.settings:id/layout_nintendo" class="android.widget.RadioButton" package="com.ayn.settings" content-desc="" checkable="true" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[540,300][1048,380]"/>
    <node index="4" text="Trigger Mode" resource-id="com.ayn.settings:id/menu_trigger" class="android.widget.TextView" package="com.ayn.settings" content-desc="" checkable="false" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,400][1080,480]"/>
    <node index="5" text="Analog" resource-id="com.ayn.settings:id/trigger_analog" class="android.widget.RadioButton" package="com.ayn.settings" content-desc="" checkable="true" checked="true" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="true" bounds="[32,500][540,580]"/>
    <node index="6" text="Digital" resource-id="com.ayn.settings:id/trigger_digital" class="android.widget.RadioButton" package="com.ayn.settings" content-desc="" checkable="true" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[540,500][1048,580]"/>
  </node>
</hierarchy>`

// XML simulant l'écran System navigation (Gesture sélectionné)
const GESTURE_NAV_XML = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="android:id/content" class="android.widget.FrameLayout" package="com.android.settings" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][1080,2400]">
    <node index="0" text="System navigation" resource-id="" class="android.widget.TextView" package="com.android.settings" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,100][1080,170]"/>
    <node index="1" text="Gesture navigation" resource-id="" class="android.widget.RadioButton" package="com.android.settings" content-desc="" checkable="true" checked="true" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="true" bounds="[0,200][1080,300]"/>
    <node index="2" text="3-button navigation" resource-id="" class="android.widget.RadioButton" package="com.android.settings" content-desc="" checkable="true" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,320][1080,420]"/>
  </node>
</hierarchy>`

// Mapping contexte → XML de hiérarchie simulé
const UI_XML_RESPONSES: Record<string, string> = {
  'com.ayn.settings': AYN_SETTINGS_XML,
  'android.settings': GESTURE_NAV_XML,
}
const DEFAULT_CONTEXT = 'com.ayn.settings'
let lastLaunchedContext = DEFAULT_CONTEXT

/** Réinitialise le contexte simulé — à appeler dans beforeEach des tests */
export function resetMockContext(): void {
  lastLaunchedContext = DEFAULT_CONTEXT
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

  // Réponses statiques : clé = sous-chaîne de la commande shell ; valeur = réponse simulée.
  // Les commandes à état (settings, pm list packages, fichiers, launcher) sont
  // gérées par SimulatedDevice (simulatedDevice.ts), consulté avant cette table.
  shellResponses: {
    // Prompt 1
    'input keyevent KEYCODE_WAKEUP': '',
    'dumpsys power | grep mWakefulness': 'mWakefulness=Awake',

    // Prompt 8 — pré-vérification espace disque (df -k /sdcard) : ~85 Gio libres
    'df -k':
      'Filesystem     1K-blocks     Used Available Use% Mounted on\n/dev/fuse      117440512 27262976  90177536  24% /storage/emulated',

    // Firmware
    'am start -a android.settings.SYSTEM_UPDATE_SETTINGS': '',

    // AYN Settings
    'monkey -p com.ayn.settings': '',
    'am start -n com.ayn.settings': '',

    // UI Automator dump → renvoie la hiérarchie selon le contexte en cours
    'uiautomator dump': 'UI hierarchy dumped to: /sdcard/window_dump.xml',
    'input tap': '',
    'am start -a android.settings.SETTINGS': '',
  },

  installedPackages: {
    // Émulateurs pré-installés en simulation (version correspond à prepareApk sim-1.0)
    // Les clés DOIVENT correspondre aux packageName de sources.json (cf. sources.test.ts).
    'me.magnum.melonds': { packageName: 'me.magnum.melonds', versionName: 'sim-1.0', versionCode: 10000 },
    'org.azahar_emu.azahar': { packageName: 'org.azahar_emu.azahar', versionName: 'sim-1.0', versionCode: 10000 },
    'org.dolphinemu.dolphinemu': { packageName: 'org.dolphinemu.dolphinemu', versionName: 'sim-1.0', versionCode: 10000 },
    'info.cemu.cemu': { packageName: 'info.cemu.cemu', versionName: 'sim-1.0', versionCode: 10000 },
  },

  commandDelayMs: 200,
  transferDelayMs: 500,
  installDelayMs: 1500,
}

/**
 * Retourne l'XML de hiérarchie UI correspondant au contexte d'écran actuel.
 * Met à jour le contexte si la commande correspond à un lancement d'app.
 *
 * IMPORTANT : 'android.settings.SETTINGS' N'EST PAS une sous-chaîne de
 * 'android.settings.SYSTEM_UPDATE_SETTINGS' (différence S-E vs S-Y),
 * donc la vérification ci-dessous ne change pas le contexte pour le firmware update.
 */
export function getUiXmlForContext(cmd: string): string {
  if (cmd.includes('com.ayn.settings') || (cmd.includes('ayn') && !cmd.includes('pm list'))) {
    lastLaunchedContext = 'com.ayn.settings'
  } else if (cmd.includes('android.settings.SETTINGS')) {
    // Matche android.settings.SETTINGS mais PAS android.settings.SYSTEM_UPDATE_SETTINGS
    lastLaunchedContext = 'android.settings'
  }
  // android.settings.SYSTEM_UPDATE_SETTINGS et autres intents ne changent PAS le contexte
  return UI_XML_RESPONSES[lastLaunchedContext] ?? AYN_SETTINGS_XML
}
