# ThorConfig

Application Windows qui configure automatiquement une console **AYN Thor Max** (Android) via ADB, derrière
un bouton unique « Configurer ma console » : préparation (navigation par gestes, firmware, réglages AYN),
émulateurs, ROMs, sauvegardes, PS Vita, launcher et utilitaires. Chaque action est **vérifiée** après coup et le rapport
final distingue succès, échecs et étapes non automatisables.

Ce README s'adresse à **deux publics différents**, avec des prérequis qui n'ont rien à voir :

| Vous êtes… | Vous voulez… | Section |
|---|---|---|
| **Développeur** | modifier le code, lancer les tests, publier un build | [🧑‍💻 Développeur](#-développeur--poste-de-développement) |
| **Testeur** | installer l'application et l'essayer sur votre console | [🎮 Testeur](#-testeur--tester-sur-une-vraie-console) |

> Le testeur **n'a pas besoin** de Node.js, de Git ni de Claude Code. Le développeur **n'a pas besoin** d'une
> console : le mode simulation couvre tout le parcours.

---

## 🧑‍💻 Développeur — poste de développement

### Prérequis

| Outil | Version | Rôle | Vérification |
|---|---|---|---|
| **Node.js** | 20 LTS (celle de la CI) | build, tests, Electron | `node --version` |
| **Git** | récent | synchronisation multi-machines, déclenche la CI | `git --version` |
| **Claude Code** | dernière | implémentation des prompts (`prompts-claude-code-ayn-thor.md`) | `claude --version` |
| Android platform-tools | *optionnel* | seulement pour brancher une vraie console | `adb version` |

Installation rapide sous Windows :

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
npm install -g @anthropic-ai/claude-code
```

Un compte GitHub avec accès au dépôt est nécessaire pour pousser (et donc produire un build pour le testeur).

### Démarrer

```powershell
git clone https://github.com/bersabinks/thor-config.git
cd thor-config
npm ci
npm run dev
```

L'application démarre **en mode simulation** (réglage par défaut) : une console fictive « AYN Thor Max
(simulation) » apparaît sans rien brancher, et le bouton « Configurer ma console » déroule tout
l'orchestrateur. Pour une vraie console : Réglages → désactiver le mode simulation.

### Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | application en développement (rechargement à chaud) |
| `npm test` | tests Vitest — aucun appareil requis |
| `npx tsc --noEmit` | vérification de types (renderer + main) |
| `npm run build` | compilation dans `out/` |
| `npm run build:package` | compilation + installeur NSIS dans `release/<version>/ThorConfig-Setup-<version>.exe` |

### Tests et mode simulation

Les tests n'utilisent jamais d'appareil réel, en local comme sur GitHub Actions :

- `electron/main/adb/__tests__/` — classification des erreurs ADB, client réel (processus `adb` simulé),
  résolution du binaire, `MockAdbClient`.
- `src/verification/__tests__/` — moteur `runVerifiedAction` : succès direct, succès après retry, échec après
  tous les retries, erreurs non récupérables.
- `src/modules/**/__tests__/` — parsing de la hiérarchie UI, identification des ROMs par signature,
  hash/manifest des sauvegardes, PS Vita, launcher, orchestrateur.
- `src/modules/orchestrator/__tests__/simulation.e2e.test.ts` — **bout en bout** : le bouton unique complet
  sur la console simulée, y compris déconnexion en cours de run, timeout, permission refusée, débogage USB
  non autorisé et adb absent.

La console simulée (`src/mocks/simulatedDevice.ts`) est **à état** : `settings put` modifie la valeur relue,
`installApk` rend le paquet visible, un fichier poussé a une empreinte SHA-256, `Android/data` est refusé
comme sur la vraie console. Deux scénarios : `configured` (défaut de l'application) et `fresh` (sortie
d'usine). Des pannes peuvent être injectées :

```ts
const client = new MockAdbClient({ scenario: 'fresh', latency: 'none', quiet: true })
client.injectFault({ code: 'TIMEOUT', match: 'uiautomator dump', times: 2 })
client.setConnectionState('disconnected') // puis 'device' pour « rebrancher »
```

### Gestion des erreurs ADB

Toutes les commandes passent par `RealAdbClient`, qui applique un délai maximum par opération
(`ADB_TIMEOUTS` : 60 s pour un shell, 30 min pour un transfert…) et convertit chaque échec en `AdbError`
typée (`electron/main/adb/errors.ts`). Le code traverse l'IPC Electron et le moteur de vérification décide :

| Code | Cause typique | Nouvel essai automatique |
|---|---|---|
| `DEVICE_DISCONNECTED` | câble débranché pendant l'opération | oui ; l'orchestrateur se met aussi en pause entre deux modules |
| `DEVICE_OFFLINE` | connexion USB instable | oui |
| `TIMEOUT` | la console ne répond plus | oui |
| `COMMAND_FAILED` | commande en échec (code de sortie ≠ 0) | oui |
| `PERMISSION_DENIED` | dossier protégé (`Android/data`), root requis | **non** — échec immédiat |
| `DEVICE_UNAUTHORIZED` | popup « Autoriser le débogage USB » non validée | **non** — consigne affichée |
| `ADB_NOT_FOUND` | platform-tools absents | **non** — consigne affichée |

Piège connu : `adb shell` rejette sur code de sortie non nul — un `grep`/`find` sans résultat doit être suivi de
`|| true`. La console simulée reproduit ce comportement pour le détecter dans les tests.

### CI/CD et lien pour le testeur

`.github/workflows/build.yml` (runner Windows) : `npm ci` → typecheck → tests → build → installeur.

- **Pull request** : tout est vérifié, l'installeur est disponible en artefact du workflow, rien n'est publié.
- **Push sur `main`** : si les tests passent, publication d'une Release horodatée (`build-AAAA-MM-JJ-HHMM`)
  **et** mise à jour du tag fixe `latest-test` (tag déplacé sur le commit, installeur remplacé, anciens
  fichiers purgés). Si les tests échouent, rien n'est publié : `latest-test` reste sur le dernier build
  fonctionnel.

Lien permanent à partager une fois pour toutes :
**https://github.com/bersabinks/thor-config/releases/download/latest-test/ThorConfig-Setup.exe**

### Structure

```
electron/main/adb/        client ADB réel, simulé, erreurs typées, résolution d'adb, Zero-Setup platform-tools
electron/main/diagnostics/ journal du jour (logs/app-AAAA-MM-JJ.log) et pack de diagnostic .zip
electron/main/net/        téléchargement en flux avec SHA-256 (platform-tools, firmware Vita3K)
electron/main/…           opérations côté main (fichiers, APK, archives) exposées en IPC
electron/preload/         pont window.electronAPI
src/verification/         runVerifiedAction : apply → check → retry
src/modules/<module>/     logique des modules (prepare, emulators, roms, saves, vita, launcher, utilities)
src/modules/orchestrator/ bouton unique, pré-vérifications, garde de connexion, rapport
src/mocks/                console simulée et fixtures
```

---

## 🎮 Testeur — tester sur une vraie console

Rien à installer côté développement : un installeur Windows, les outils ADB de Google et la console.

### Prérequis

- **PC Windows 10 ou 11, 64 bits.**
- **Câble USB de données** (un câble de charge seule ne permet pas ADB).
- **Débogage USB activé sur la console** (une seule fois) :
  1. Paramètres → À propos de la tablette → touchez **7 fois** « Numéro de build » (« Vous êtes
     développeur »).
  2. Paramètres → Système → **Options pour les développeurs** → activez **Débogage USB**.
- **ADB : rien à installer.** Au premier lancement, si aucun adb n'est trouvé sur le PC, ThorConfig
  télécharge les Android platform-tools officiels de Google
  (`platform-tools-latest-windows.zip`, ~8 Mio) dans `%APPDATA%\ThorConfig\platform-tools` et les utilise
  directement — le PATH du système n'est pas modifié. L'indicateur à côté du nom de la console affiche
  « Téléchargement d'ADB… », puis « ADB intégré ». Connexion Internet requise la première fois.
  - Sans Internet, ou si l'indicateur affiche « ADB non installé » : `winget install Google.PlatformTools`,
    ou le zip de https://developer.android.com/tools/releases/platform-tools extrait dans
    `C:\platform-tools` (détecté automatiquement), puis « Réessayer ».
- **Driver USB ADB Windows : seulement si besoin.** Windows 10/11 reconnaît généralement la console sans
  rien installer. Si l'application reste sur « Aucun appareil connecté » alors que la console est branchée
  et déverrouillée : installez le **Google USB Driver** (https://developer.android.com/studio/run/win-usb),
  puis dans le Gestionnaire de périphériques → appareil Android → Mettre à jour le pilote → choisir ce
  driver.

### Installer et lancer

1. Téléchargez l'installeur (lien permanent, toujours le dernier build fonctionnel) :
   **https://github.com/bersabinks/thor-config/releases/download/latest-test/ThorConfig-Setup.exe**
2. Lancez-le. L'installeur n'est pas signé : si Windows SmartScreen s'affiche, cliquez « Informations
   complémentaires » → « Exécuter quand même ».
3. Branchez la console en USB, déverrouillez-la. À la popup **« Autoriser le débogage USB ? »**, cochez
   « Toujours autoriser depuis cet ordinateur » et validez.
4. Ouvrez ThorConfig → **Réglages** → **désactivez le mode simulation** (il est activé par défaut).
5. La console apparaît en haut de l'écran. Cliquez sur **« Configurer ma console »** (ou sur le bouton
   indiqué par le développeur).

### Si quelque chose bloque

| Message dans l'application | À faire |
|---|---|
| « ADB non installé » / « ADB introuvable sur ce PC » | vérifiez la connexion Internet puis « Réessayer », ou installez les platform-tools à la main (voir prérequis) |
| « Débogage USB non autorisé » | déverrouillez la console et acceptez la popup d'autorisation |
| « Console déconnectée » / « En pause » | vérifiez le câble ; la configuration reprend seule une fois rebranchée |
| « Console hors ligne » | débranchez puis rebranchez le câble |
| « Délai dépassé » | la console ne répond plus : déverrouillez-la, vérifiez qu'elle n'est pas en veille |
| « Permission refusée par Android » | limite d'Android (dossier protégé) : à signaler au développeur, pas de manipulation à faire |

### Émulateurs et mises à jour

« Configurer ma console » installe WatermelonDS (DS), Azahar (3DS), Dolphin (GameCube/Wii), Cemu (Wii U)
et PPSSPP (PSP), puis **Obtainium**, qui gardera ces émulateurs à jour.

**DuckStation (PlayStation 1) fait exception** : il n'est distribué que par Google Play, donc ThorConfig ne
peut pas l'installer (l'étape est marquée « ignorée », ce n'est pas une erreur) et Obtainium ne peut pas le
suivre. Installez-le à la main depuis le Play Store ; vos jeux PS1 sont rangés dans `ROMs/psx` quoi qu'il arrive. Une fenêtre « Importer des apps » s'ouvre alors dans
Obtainium sur la console : **confirmez-la**. Si elle n'apparaît pas : Obtainium → Import/Export →
Obtainium Import → `Download/thorconfig-obtainium-apps.json`.

### Utilitaires

« Configurer ma console » installe et paramètre aussi les utilitaires système recommandés :

- **ClusterTune** — régulation thermique et sous-cadençage CPU/GPU via le service PServer AYN (sans root).
  La tuile est ajoutée automatiquement aux paramètres rapides. Profil par défaut recommandé :
  **Équilibré / Safe**.
- **Final ROM** — boîte à outils ROM directement sur Android (conversion CHD, NSZ/XCZ, patchs IPS/UPS,
  playlists m3u). Le dossier `/sdcard/ROMs/` est préparé automatiquement.
- **ZArchiver** — gestionnaire d'archives complet (7z, zip, rar). Détecté automatiquement, sinon renvoi
  vers sa page Play Store sur la console.

**Recommandé en installation manuelle — AB Download Manager (ABDM)** : gestionnaire de téléchargements
multi-thread rapide et moderne ([GitHub](https://github.com/amir1376/ab-download-manager)), pratique pour
récupérer directement de gros fichiers ou des archives sur la console.

#### Profils ClusterTune recommandés

| Émulateur / Usage | Profil recommandé | Remarques |
|---|---|---|
| **Nintendo DS (MelonDS)** | Équilibré / Safe | Température minimale, batterie maximale |
| **Nintendo 3DS (Azahar)** | Équilibré / Safe | Pleine vitesse à 4× sans surchauffe |
| **PSP / RetroArch** | Équilibré / Safe | Aucune saccade, consommation réduite |
| **Switch / PS2 / Wii U** | Performance | Puissance maximale requise pour le 60 FPS |
| **Usage général** | Équilibré / Safe | Profil idéal par défaut |

> ⚠️ *Éviter le profil « Économie » lors de sessions d'émulation lourde afin d'éviter tout ralentissement.*

### PS Vita (Vita3K)

Si Vita3K est installé sur la console, « Configurer ma console » télécharge les trois fichiers firmware
officiels depuis les serveurs Sony (firmware 3.74, paquet de pré-installation, paquet de polices, ~320 Mio
au total), vérifie leur empreinte SHA-256 et les dépose dans `/sdcard/PSVita/firmware/`. Android
n'autorisant pas l'écriture dans les données de Vita3K, l'installation se termine dans Vita3K :
**Install Firmware** → sélectionner chaque fichier indiqué dans le rapport.

### Envoyer un retour

- le **pack de diagnostic** : bouton « Exporter le diagnostic (.zip) » dans le rapport final ou dans
  Réglages → Diagnostic. Envoyez le fichier **avec l'empreinte SHA-256 affichée**, pour vérifier qu'il est
  arrivé intact ;
- une **capture du rapport final** (ou du journal) ;
- si le résultat n'est pas celui attendu : ce que vous avez vu **sur l'écran de la console elle-même**
  (photo ou courte vidéo si besoin) ;
- si vous voulez repartir d'une console propre pour un prochain test, dites-le avant de relancer.
