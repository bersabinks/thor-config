/**
 * Guide de configuration guidée des émulateurs.
 *
 * Enquête ADB (Prompts 3 et 8) : les fichiers de config des émulateurs sont sous
 * /data/data/<pkg>/… et ne sont accessibles ni en lecture ni en écriture sans
 * root. Les 4 profils sont donc `_confirmed: false` et l'étape « Configuration »
 * du module Émulateurs est volontairement `skipped` — on n'écrit rien à l'aveugle.
 *
 * La configuration reste donc à faire une fois, à la main, dans chaque émulateur.
 * Ce guide traduit les valeurs cibles des profils (src/modules/emulators/profiles)
 * en instructions lisibles, affichées dans le récapitulatif de l'orchestrateur.
 *
 * Les `id` correspondent à src/modules/emulators/sources.json.
 */

export interface GuideSetting {
  /** Emplacement du réglage dans l'app (menu → sous-menu). */
  path: string
  /** Valeur à sélectionner. */
  value: string
}

export interface EmulatorGuide {
  id: string
  displayName: string
  /** Où trouver les réglages, en une phrase. */
  intro: string
  settings: GuideSetting[]
}

export const EMULATOR_GUIDES: EmulatorGuide[] = [
  {
    id: 'melonds-ds',
    displayName: 'MelonDS Dual Screen',
    intro: 'Menu ⋮ → Settings, puis la section Video.',
    settings: [
      { path: 'Video → Renderer', value: 'OpenGL' },
      { path: 'Video → Internal resolution', value: '4× (native)' },
      { path: 'Video → Dual screen mode', value: 'Activé' },
      { path: 'Video → Screen layout', value: 'Haut → écran interne, Bas → écran externe' },
      { path: 'Input → Touchscreen (soft input)', value: 'Always invisible' },
      { path: 'Input → Bouton R2', value: 'Fast forward (avance rapide)' },
    ],
  },
  {
    id: 'azahar',
    displayName: 'Azahar (3DS)',
    intro: 'Menu ⋮ → Settings, sections Graphics et System.',
    settings: [
      { path: 'Graphics → Graphics API', value: 'Vulkan' },
      { path: 'Graphics → Internal resolution', value: '4×' },
      { path: 'Graphics → Asynchronous shader compilation', value: 'Activé' },
      { path: 'Graphics → Async presentation', value: 'Activé' },
      { path: 'System → New 3DS mode', value: 'Activé' },
      { path: 'Layout → Screen layout', value: 'Separate windows / écrans séparés' },
      { path: 'Controls', value: 'Auto-mapper les touches physiques de la Thor' },
    ],
  },
  {
    id: 'dolphin',
    displayName: 'Dolphin (dev build)',
    intro: 'Onglet Config puis Graphics ; le mapping via Controllers.',
    settings: [
      { path: 'Graphics → Second/External display', value: 'Activé sur l’écran du bas' },
      { path: 'Graphics → Cadre (border)', value: '0 %' },
      { path: 'Graphics → Internal resolution', value: '4×' },
      { path: 'Controllers → GameCube Controller 1', value: 'Manette standard (Standard Controller)' },
      { path: 'Hotkeys → Screen swap', value: 'Bouton Select' },
    ],
  },
  {
    id: 'cemu',
    displayName: 'Cemu (Wii U)',
    intro: 'Menu Options → General settings, onglet Game Paths.',
    settings: [
      { path: 'General → Game Paths', value: 'Ajouter /sdcard/ROMs/WiiU' },
      { path: 'Input → Controller 1', value: 'Wii U GamePad' },
      { path: 'General → Format de jeu préféré', value: '.wua' },
    ],
  },
]

export function guideFor(id: string): EmulatorGuide | undefined {
  return EMULATOR_GUIDES.find((g) => g.id === id)
}
