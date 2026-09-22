import type { PrepareApkSource } from '../emulators/emulatorInstall'
import type { LauncherConfig } from './launcherProcess'

export interface FrontendDef extends LauncherConfig {
  description: string
  badge?: string
  apkSource?: PrepareApkSource
}

export const SUPPORTED_FRONTENDS: Record<string, FrontendDef> = {
  cocoon: {
    id: 'cocoon',
    displayName: 'Cocoon (Thor FE)',
    packageName: 'rip.moth.cocoonshell',
    mainActivity: 'rip.moth.cocoonshell/.MainActivity',
    description: 'Interface épurée et moderne conçue sur mesure pour l’AYN Thor et son ergonomie.',
    badge: 'Recommandé (Thor)',
    apkSource: {
      id: 'cocoon',
      sourceType: 'github',
      githubRepo: 'inssekt/CocoonFE',
      assetPattern: '\\.apk$',
      packageName: 'rip.moth.cocoonshell',
    },
  },
  daijishou: {
    id: 'daijishou',
    displayName: 'Daijishō',
    packageName: 'com.magneticchen.daijishou',
    mainActivity: 'com.magneticchen.daijishou/.MainActivity',
    description: 'Interface visuelle très populaire avec scraping automatique des jaquettes et résumés.',
    badge: 'Populaire & Visuel',
    apkSource: {
      id: 'daijishou',
      sourceType: 'github',
      githubRepo: 'TapiocaFox/Daijishou',
      assetPattern: '\\.apk$',
      packageName: 'com.magneticchen.daijishou',
    },
  },
  esde: {
    id: 'esde',
    displayName: 'ES-DE (EmulationStation)',
    packageName: 'org.es_de.frontend',
    mainActivity: 'org.es_de.frontend/.MainActivity',
    description: 'Le standard absolu des puristes, 100% compatible avec l’arborescence /sdcard/ROMs/.',
    badge: 'Standard Rétro',
  },
}

export function getFrontendDef(id?: string): FrontendDef {
  if (id && SUPPORTED_FRONTENDS[id]) {
    return SUPPORTED_FRONTENDS[id]
  }
  return SUPPORTED_FRONTENDS.cocoon
}
