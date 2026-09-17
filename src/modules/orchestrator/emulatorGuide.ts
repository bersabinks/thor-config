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
    id: 'watermelonds',
    displayName: 'WatermelonDS (DS — Dual Screen)',
    // Libellés relevés dans les ressources de WatermelonDS 0.7.0 (pref_video.xml,
    // pref_retroachievements.xml, strings.xml) le 2026-09-15.
    intro: 'Settings, écrans Video et RetroAchievements (libellés de WatermelonDS 0.7.0).',
    settings: [
      { path: 'Settings → Video → Renderer', value: 'Vulkan (recommandé sur Adreno)' },
      { path: 'Settings → Video → Internal resolution', value: '4×' },
      { path: 'Settings → Video → Dual screen presets', value: 'Internal: Top, External: Bottom' },
      { path: 'Dual screen presets → Keep DS aspect ratio', value: 'ON' },
      { path: 'Dual screen presets → Integer scale', value: 'ON' },
      { path: 'Settings → RetroAchievements → Enable RetroAchievements', value: 'Au choix (compte RetroAchievements requis)' },
    ],
    thor: {
      gpuDriver: {
        applicable: true,
        instructions: `Avec le renderer Vulkan : Settings → Video → Adreno Vulkan driver → importer l’archive Turnip. Option réservée au build GitHub arm64 sur Android 9+ (celui installé par ThorConfig). ${TURNIP_SOURCE}`,
      },
      internalResolution: {
        value: '4×',
        rationale:
          'Rendu à 1024×768 par écran DS : tient dans les 1080 px de hauteur de l’écran principal. Avec Integer scale, l’image reste nette ; au-delà de 5×, aucun gain visible et plus de chauffe.',
      },
      triggers:
        'La DS n’a pas de gâchettes : L2/R2 sont libres (Settings → Input). R2 → avance rapide, L2 → échange des écrans. Le mode Analog/Digital d’AYN Settings est sans effet sur ces raccourcis.',
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
    id: 'ppsspp',
    displayName: 'PPSSPP (PSP)',
    // Libellés relevés dans assets/lang/en_US.ini de PPSSPP (Graphics, Controls).
    intro: 'Settings → Graphics pour le rendu, Settings → Controls pour le mapping.',
    settings: [
      { path: 'Graphics → Rendering backend', value: 'Vulkan (redémarre PPSSPP)' },
      { path: 'Graphics → Rendering resolution', value: '3×' },
      { path: 'Graphics → Texture scaling → Upscale level', value: '2× (xBRZ)' },
      { path: 'Graphics → Texture filtering → Anisotropic filtering', value: '4× ou 8×' },
      { path: 'Controls → Control mapping', value: 'Gâchettes L2/R2 → L et R du PSP' },
    ],
    thor: {
      gpuDriver: {
        applicable: true,
        instructions: `Rendering backend en Vulkan, puis pilote Turnip via le gestionnaire de pilotes d’Android (PPSSPP utilise le pilote système par défaut ; l’import de pilote personnalisé n’existe pas dans toutes les versions — à vérifier sur la console). ${TURNIP_SOURCE}`,
      },
      internalResolution: {
        value: '3×',
        rationale:
          '3× = 1440×816 à partir des 480×272 du PSP : sous les 1080 px de l’écran principal, marge confortable pour l’Adreno 740. 4× (1920×1088) reste possible sur les jeux légers, au prix de la chauffe.',
      },
      triggers:
        'Le PSP n’a que L et R (numériques) : mapper L2/R2 dessus dans Control mapping. Les gâchettes AYN en mode Analog fonctionnent (seuil d’appui) ; passer en Digital si un appui n’est pas détecté.',
    },
    screenshots: [],
  },
  {
    id: 'duckstation',
    displayName: 'DuckStation (PS1)',
    // Non installé par ThorConfig (Google Play uniquement) : libellés issus de la
    // documentation communautaire, à confirmer sur la console.
    intro:
      'Installe DuckStation depuis le Google Play Store sur ta console (cherche « DuckStation »), puis reviens ici. ' +
      'Libellés des réglages à confirmer sur la console (le code Android n’est pas public).',
    settings: [
      {
        path: '1. Installation (obligatoire, manuelle)',
        value: 'Google Play → rechercher « DuckStation » → Installer',
      },
      { path: 'Settings → Graphics → GPU Renderer', value: 'Vulkan' },
      { path: 'Settings → Graphics → Internal resolution (upscaling)', value: '3× (4× sur les jeux 2D)' },
      { path: 'Settings → Graphics → PGXP geometry correction', value: 'Activé' },
      { path: 'Settings → Graphics → Widescreen hack', value: 'Désactivé (casse certains jeux)' },
      { path: 'Settings → Controllers → Controller 1', value: 'Analog Controller (DualShock) — sticks + L2/R2 analogiques' },
      { path: 'Settings → Controllers → Multitap', value: 'Désactivé (sauf jeu 3-4 joueurs)' },
    ],
    thor: {
      gpuDriver: {
        applicable: true,
        instructions: `Renderer Vulkan puis, si l’option existe dans la version installée, import d’un pilote Turnip. ${TURNIP_SOURCE}`,
      },
      internalResolution: {
        value: '3×',
        rationale:
          '3× ≈ 1120×896 à partir des 320×240 de la PS1 : proche de la définition de l’écran, sans coût notable pour l’Adreno 740. 4× passe sans peine sur les jeux 2D. PGXP corrige en plus le tremblement des polygones ; le Widescreen hack, lui, déforme ou casse les jeux non prévus pour le 16/9 — à laisser désactivé.',
      },
      triggers:
        'Manette en mode Analog Controller (DualShock) : les gâchettes AYN en mode Analog alimentent L2/R2 en axes, indispensables pour les jeux de course (Gran Turismo…). En mode Digital, L2/R2 restent de simples boutons.',
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

/** Affiché dans le rapport final pour les émulateurs non installables par ADB. */
export const MANUAL_INSTALL_NOTE =
  'DuckStation non installable automatiquement — installation manuelle via Google Play requise'

export function guideFor(id: string): EmulatorGuide | undefined {
  return EMULATOR_GUIDES.find((g) => g.id === id)
}

export interface UtilityGuide {
  id: string
  displayName: string
  intro: string
  settings: GuideSetting[]
}

export const UTILITY_GUIDES: UtilityGuide[] = [
  {
    id: 'clustertune',
    displayName: 'ClusterTune',
    intro: 'Ouvrir l’application ClusterTune ou appuyer sur la tuile du volet des paramètres rapides.',
    settings: [
      { path: 'Profil par défaut recommandé', value: 'Équilibré / Safe (optimise température et autonomie)' },
      { path: 'Profil pour DS / 3DS / PSP', value: 'Équilibré (suffisant pour la pleine vitesse)' },
      { path: 'Profil pour Switch / PS2 / Wii U', value: 'Performance (puissance CPU maximale requise)' },
      { path: 'Profil Économie', value: 'À éviter en émulation lourde (risque de saccades)' },
    ],
  },
  {
    id: 'finalrom',
    displayName: 'Final ROM',
    intro: 'Ouvrir Final ROM pour la conversion ou le patch de ROMs directement sur la console.',
    settings: [
      { path: 'Dossier de travail des ROMs', value: '/sdcard/ROMs/' },
      { path: 'Compression recommandée', value: 'Format CHD pour CD/DVD (PS1, PS2, Dreamcast)' },
    ],
  },
  {
    id: 'gamehub',
    displayName: 'GameHub (Jeux Steam)',
    intro:
      'Installer depuis le Play Store ; si le Play Store répond « élément introuvable », ' +
      'récupérer l’APK sur https://gamehub.xiaoji.com/ (miroir : https://github.com/gamehublite/gamehub-oss). ' +
      'Connexion Steam IMPÉRATIVEMENT par QR code depuis l’application Steam mobile : ' +
      'ne jamais saisir identifiant et mot de passe en clair dans GameHub.',
    settings: [
      {
        path: 'Stockage',
        value: 'Stockage interne uniquement (pas de MicroSD), prévoir 50+ Go libres',
      },
      {
        path: 'Résolution',
        value: '1280x720 (720p) — compromis netteté/performances sur l’OLED 6″',
      },
      {
        path: 'Compatibilité',
        value: 'Proton 10.0 arm64x2 / preset Translation « Extreme » (rétrograder si plantage)',
      },
      {
        path: 'Pilote GPU',
        value: 'Turnip 26.0.0 R2 (à télécharger dans l’onglet pilotes de GameHub)',
      },
      {
        path: 'Réglages console',
        value: 'Mode High Performance + Ventilateur Smart + écran haut 120 Hz',
      },
      {
        path: 'Alternative',
        value: 'Jeux incompatibles ou clavier/souris : streaming Moonlight/Sunshine',
      },
    ],
  },
]
