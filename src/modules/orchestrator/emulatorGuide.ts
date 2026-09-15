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
 * en instructions lisibles, affichées dans le récapitulatif de l'orchestrateur,
 * complétées des réglages propres au matériel de la Thor Max.
 *
 * Les `id` correspondent à src/modules/emulators/sources.json.
 */

/** Matériel de référence (fiche constructeur AYN, Thor Max). */
export const THOR_MAX_HARDWARE = {
  soc: 'Snapdragon 8 Gen 2',
  gpu: 'Adreno 740',
  mainScreen: '6″ AMOLED 1920×1080, 120 Hz',
  secondScreen: '3,92″ AMOLED 1240×1080, 60 Hz',
  /** Réglages Thor documentés (docs émulateurs, communauté) mais pas encore validés sur la console du testeur. */
  verifiedOnHardware: false,
} as const

export interface GuideSetting {
  /** Emplacement du réglage dans l'app (menu → sous-menu). */
  path: string
  /** Valeur à sélectionner. */
  value: string
}

/** Capture d'écran statique embarquée (import d'image Vite), affichée si présente. */
export interface GuideScreenshot {
  src: string
  caption: string
}

export interface ThorMaxTuning {
  gpuDriver: {
    /** Faux si l'émulateur n'utilise pas Vulkan (Turnip est un pilote Vulkan). */
    applicable: boolean
    instructions: string
  }
  internalResolution: {
    value: string
    rationale: string
  }
  /** Mapping des gâchettes analogiques L2/R2 de la Thor. */
  triggers: string
}

export interface EmulatorGuide {
  id: string
  displayName: string
  /** Où trouver les réglages, en une phrase. */
  intro: string
  settings: GuideSetting[]
  thor: ThorMaxTuning
  /** Vide tant qu'aucune capture n'est embarquée : la fiche reste en texte seul. */
  screenshots: GuideScreenshot[]
}

const TURNIP_SOURCE =
  'Pilote Turnip compatible Adreno 740 : archive .zip « AdrenoTools » (ex. dépôt GitHub K11MCH1/AdrenoToolsDrivers), à copier sur la console puis à sélectionner dans l’émulateur. En cas de régression graphique, revenir au pilote système.'

export const EMULATOR_GUIDES: EmulatorGuide[] = [
  {
    id: 'melonds-ds',
    displayName: 'MelonDS Dual Screen',
    intro: 'Menu ⋮ → Settings, puis la section Video.',
    settings: [
      { path: 'Video → Renderer', value: 'OpenGL' },
      { path: 'Video → Internal resolution', value: '4×' },
      { path: 'Video → Dual screen mode', value: 'Activé' },
      { path: 'Video → Screen layout', value: 'Haut → écran interne, Bas → écran externe' },
      { path: 'Input → Touchscreen (soft input)', value: 'Always invisible' },
      { path: 'Input → Bouton R2', value: 'Fast forward (avance rapide)' },
    ],
    thor: {
      gpuDriver: {
        applicable: false,
        instructions:
          'Non applicable : melonDS utilise OpenGL ES (ou le rendu logiciel). Turnip est un pilote Vulkan, il n’apporte rien ici — garder le pilote système.',
      },
      internalResolution: {
        value: '4×',
        rationale:
          'Rendu OpenGL à 1024×768 par écran DS : tient dans les 1080 px de hauteur de l’écran principal. 5× (1280×960) reste possible ; au-delà, aucun gain visible et plus de chauffe.',
      },
      triggers:
        'La DS n’a pas de gâchettes : L2/R2 sont libres. R2 → avance rapide, L2 → échange des écrans. Le mode Analog/Digital d’AYN Settings est sans effet sur ces raccourcis.',
    },
    screenshots: [],
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
    thor: {
      gpuDriver: {
        applicable: true,
        instructions: `Avec l’API Vulkan : Settings → GPU Driver → Install → choisir l’archive Turnip. Recommandé si des jeux affichent des défauts graphiques avec le pilote Qualcomm. ${TURNIP_SOURCE}`,
      },
      internalResolution: {
        value: '4×',
        rationale:
          'Écran supérieur 3DS en 1600×960 : l’échelle entière la plus proche des 1080 px de l’écran principal, confortable pour l’Adreno 740. Descendre à 3× sur les rares jeux qui ralentissent.',
      },
      triggers:
        'L2/R2 → ZL/ZR (New 3DS). Ce sont des boutons numériques : si l’appui n’est pas détecté avec les gâchettes AYN en mode Analog, remapper en appuyant à fond ou passer AYN Settings en Digital.',
    },
    screenshots: [],
  },
  {
    id: 'dolphin',
    displayName: 'Dolphin (dev build)',
    intro: 'Onglet Config puis Graphics ; le mapping via Controllers.',
    settings: [
      { path: 'Graphics → Second/External display', value: 'Activé sur l’écran du bas' },
      { path: 'Graphics → Cadre (border)', value: '0 %' },
      { path: 'Graphics → Internal resolution', value: '2×' },
      { path: 'Controllers → GameCube Controller 1', value: 'Manette standard (Standard Controller)' },
      { path: 'Hotkeys → Screen swap', value: 'Bouton Select' },
    ],
    thor: {
      gpuDriver: {
        applicable: true,
        instructions: `Backend Vulkan, puis Config → Graphics → GPU Driver (gestionnaire de pilotes intégré à Dolphin via libadrenotools ; l’emplacement exact peut varier selon la version). ${TURNIP_SOURCE}`,
      },
      internalResolution: {
        value: '2×',
        rationale:
          '2× ≈ 1080p (1280×1056 pour la GameCube) : correspond à la définition de l’écran principal. 3× reste jouable sur beaucoup de jeux GameCube mais n’apporte qu’un léger anticrénelage ; à éviter sur Wii.',
      },
      triggers:
        'Gâchettes AYN en mode Analog, puis Controllers → GameCube Controller 1 → Triggers : L-Analog = axe L2, R-Analog = axe R2, L et R (clic numérique) = même gâchette enfoncée à fond. Indispensable pour les jeux à pression progressive (ex. Super Mario Sunshine).',
    },
    screenshots: [],
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
    thor: {
      gpuDriver: {
        applicable: true,
        instructions: `Cemu Android n’a qu’un rendu Vulkan : Settings → Graphics → pilote personnalisé (Custom driver) → choisir l’archive Turnip. Option présente dans les versions récentes du fork Android ; si elle est absente, mettre Cemu à jour. ${TURNIP_SOURCE}`,
      },
      internalResolution: {
        value: 'Native (720p ou 1080p selon le jeu)',
        rationale:
          'Pas d’upscaling : les jeux Wii U sortent déjà en 720p/1080p, l’écran fait 1080p et l’émulation Wii U est la plus exigeante des quatre pour l’Adreno 740.',
      },
      triggers:
        'L2/R2 → ZL/ZR du GamePad Wii U (boutons numériques). Si l’appui n’est pas reconnu en mode Analog, passer les gâchettes AYN en Digital.',
    },
    screenshots: [],
  },
]

export function guideFor(id: string): EmulatorGuide | undefined {
  return EMULATOR_GUIDES.find((g) => g.id === id)
}
