# Brief de développement — App de configuration AYN Thor Max (mode 100% automatique)

## 0. Résumé du projet & hypothèses

**Nom de code** : `ThorConfig`

**Exigence centrale** : la console arrive vierge. L'utilisateur branche, lance l'app, et **ne fait plus rien** — hormis, une seule fois, glisser ses propres fichiers de jeux (dumps qu'il possède déjà) dans un dossier surveillé. Tout le reste — réglages Android/AYN, installation des émulateurs, configuration fine, rangement des ROMs, sauvegardes, PS Vita, launcher — est exécuté et **vérifié** automatiquement par l'app.

**Ce que ça implique en conception** :
- Aucune étape "instructions manuelles affichées à l'utilisateur" : quand une commande ADB directe n'existe pas pour un réglage, on bascule sur de l'automatisation d'UI (lecture de la hiérarchie d'écran Android via `uiautomator dump`, puis simulation de taps via `adb shell input tap`), pas sur un mode d'emploi.
- Chaque action doit être **vérifiée** en relisant l'état réel de l'appareil après coup (pas de "fire and forget"), avec retry automatique, et consignée dans un rapport d'audit final.
- Les émulateurs (logiciels open-source légaux : Dolphin, Azahar, Cemu, fork MelonDS, etc.) sont récupérés automatiquement par l'app depuis leurs dépôts GitHub officiels — exactement le principe d'Obtainium ou d'un gestionnaire de paquets (Chocolatey/winget). L'app ne source et ne fournit jamais de ROM protégée : les fichiers de jeux restent uniquement ceux que l'utilisateur dépose lui-même dans le dossier d'import.
- Un seul bouton "Configurer ma console" orchestre tout, de bout en bout.

**Stack retenue pour les prompts** : Electron + React (TypeScript), `@devicefarmer/adbkit` / appel direct au binaire `adb`, Node.js pour le traitement fichiers. Packaging Windows via `electron-builder`.
> Alternative .NET 8 + WPF/MAUI + `AdvancedSharpAdbClient` possible si tu préfères rester 100% écosystème Windows — dis-le-moi, j'adapte le Prompt 1.

**Contrainte additionnelle — développement multi-machines & tests à distance** :
- Le code vit sur GitHub (dépôt unique) : tu peux coder depuis n'importe quelle machine (maison, école) en te synchronisant dessus, avec Claude Code CLI en local ou Claude Code sur le web (claude.ai/code) selon la machine.
- Tu n'as pas encore la console toi-même : c'est un ami, qui possède déjà une AYN Thor Max, qui fera les tests réels. Ni ta machine de maison ni celle de l'école n'ont donc besoin d'ADB ou d'un accès USB à une console — seule la machine de ton ami en a besoin.
- Conséquence en conception : Prompt 1 inclut dès le départ un **mode simulation (dry-run) avec client ADB mocké**, pour que tu puisses valider une grande partie de la logique toi-même, sans matériel, avant même d'impliquer ton ami. Prompt 1 inclut aussi une **build automatique en installeur Windows publiée en GitHub Release** à chaque push, pour pouvoir envoyer un lien à ton ami sans lui demander d'installer Node.js ou Claude Code.

## Comment utiliser ces prompts

Colle-les dans l'ordre dans Claude Code (en local ou sur le web selon la machine), dans le même dépôt GitHub, en poussant (`git push`) après chaque prompt validé. Le Prompt 8 (orchestrateur) suppose que tous les modules précédents exposent une interface commune `run(): Promise<ModuleResult>` — précise-le à Claude Code si besoin de rappel de contexte entre deux sessions ou deux machines.

Rythme de validation recommandé :
- Après chaque prompt, teste d'abord ce qui est testable **sans console** en mode simulation (toi-même, sur ta machine).
- Regroupe 2 à 3 prompts avant de solliciter ton ami pour un vrai test sur sa console — ça évite de le déranger à chaque petite étape.

---

## Prompt 1 — Socle du projet, ADB & moteur de vérification générique

```
Crée le socle d'une application Electron + React + TypeScript nommée "ThorConfig".

Objectif : une app desktop Windows qui détecte une console Android en USB (ADB) et fournit un moteur générique de "action vérifiée" réutilisable par tous les modules à venir.

Exigences techniques :
- Electron + React 18 + TypeScript, Vite. Process principal Electron avec wrapper `adbClient.ts` :
  listDevices(), getDeviceProps(serial), pushFile(), pullFile(), shell(serial, cmd), installApk(),
  uninstallApk(), getPackageInfo(serial, packageName).
- Module `verification/index.ts` exposant une fonction générique :
  `runVerifiedAction<T>({ label, apply: () => Promise<void>, check: () => Promise<T>, expected: (result: T) => boolean, maxRetries, retryDelayMs }): Promise<StepResult>`
  où StepResult = { label, status: 'success' | 'failed_after_retries', attempts, lastValue }.
  Cette fonction : exécute `apply()`, attend un court délai, exécute `check()`, compare avec `expected()`,
  et si échec, réessaie jusqu'à `maxRetries` avec backoff, en loguant chaque tentative.
- Module `auditLog.ts` : un store centralisé (Zustand ou Context) qui accumule tous les StepResult de
  toute l'app, exposable en JSON, et affichable sous forme de checklist en temps réel dans l'UI (vert/rouge/jaune).
- UI : écran d'accueil avec statut de connexion de la console + une zone "Journal d'exécution" (liste
  scrollable des StepResult en direct) + sidebar avec les entrées : Préparation / Émulateurs / ROMs /
  Sauvegardes / PS Vita / Launcher / Rapport final — toutes vides pour l'instant sauf Préparation.
- electron-builder pour un installeur Windows (.exe, NSIS).

Mode simulation (important : je n'ai pas encore de console sous la main, un ami testera à ma place
plus tard) :
- Ajoute un `MockAdbClient` implémentant la même interface que `adbClient.ts`, qui simule un appareil
  connecté factice ("AYN Thor Max (simulation)"), répond à shell()/getPackageInfo()/etc. avec des
  valeurs plausibles configurables dans un fichier /src/mocks/fixtures.ts, et journalise chaque appel
  comme s'il était réel.
- Un toggle "Mode simulation" dans les Réglages de l'app bascule entre adbClient réel et MockAdbClient
  (via une factory `getAdbClient()` utilisée partout au lieu d'importer adbClient.ts directement).
- Objectif : pouvoir dérouler toute l'app (y compris les modules à venir) sans aucun appareil physique
  branché, pour valider la logique moi-même avant de solliciter mon ami testeur.

CI/CD pour partager des builds testables sans que le testeur installe quoi que ce soit :
- Ajoute un workflow GitHub Actions (/.github/workflows/build.yml) qui, à chaque push sur `main` :
  installe les dépendances, lance les tests s'ils existent, build l'app avec electron-builder pour
  Windows, et publie le `.exe` généré en tant que GitHub Release (tag automatique horodaté, ex.
  `build-2026-09-13-1830`), avec des notes de release minimales (liste des commits inclus).

Critère d'acceptation : `npm run dev` fonctionne en mode simulation sans aucun appareil branché (statut
"AYN Thor Max (simulation)" affiché, bouton de test "Vérifier que l'écran est allumé" qui répond via le
mock et log un succès) ; en mode réel, la même action utilise adb (apply = adb shell input keyevent
KEYCODE_WAKEUP, check = adb shell dumpsys power | grep mWakefulness, expected = contient 'Awake') ; et
un push sur `main` déclenche bien le workflow GitHub Actions et produit une Release téléchargeable.
```

---

## Prompt 2 — Réglages Android/AYN 100% automatisés (avec fallback UI Automator)

```
Ajoute le module "Préparation console" à ThorConfig (dossier /src/modules/prepare), entièrement
automatisé et sans écran d'instructions manuelles pour l'utilisateur.

Crée d'abord un sous-module `uiAutomation.ts` :
- dumpUiHierarchy(serial): Promise<UiNode[]> — exécute `adb shell uiautomator dump`, pull le XML généré,
  le parse en arbre de nœuds (texte, resource-id, bounds).
- findByText(nodes, text, opts?: { exact?: boolean }): UiNode | null
- tapNode(serial, node): calcule le centre des `bounds` et exécute `adb shell input tap x y`.
- navigateByTextPath(serial, steps: string[]): ouvre une app/menu puis tape successivement sur chaque
  libellé de `steps` en relisant la hiérarchie entre chaque tap (pour gérer les écrans qui changent).

Étapes à implémenter, chacune via `runVerifiedAction` (module du Prompt 1) :

1. Navigation par gestes : tenter `adb shell settings put secure ...` (rechercher la clé exacte selon
   la version Android ciblée), sinon fallback via uiAutomation : ouvrir Settings (intent
   android.settings.SETTINGS), navigateByTextPath(["System", "Gestures", "System navigation",
   "Gesture navigation"]). Vérification : relire la valeur du setting ou re-dumper l'écran et confirmer
   la radio sélectionnée.

2. Mise à jour firmware : lire la version actuelle (adb shell getprop ro.build.version.incremental),
   déclencher l'intent de vérification de mise à jour système, attendre et re-vérifier la version après
   un délai configurable (l'installation peut nécessiter un redémarrage — gérer une reconnexion ADB
   après reboot avec polling sur `adb wait-for-device`).

3. Réglages AYN Settings (ABXY layout = Xbox, mode gâchettes = Analog par défaut, configurables par
   l'utilisateur en amont via un petit formulaire dans les Réglages de ThorConfig) : localiser le
   package AYN Settings (adb shell pm list packages | grep ayn), l'ouvrir, et utiliser
   navigateByTextPath() avec les libellés exacts observés dans l'app (à ajuster si les libellés
   diffèrent selon la version — prévoir un fichier de config `aynMenuLabels.json` externalisant ces
   chaînes pour ne pas coder en dur un texte fragile). Vérification : re-dumper l'écran de réglage et
   confirmer que l'option sélectionnée correspond au choix demandé.

Chaque étape doit être idempotente et rejouable sans effet de bord si déjà appliquée.

Critère d'acceptation : le module s'exécute de bout en bout sans jamais afficher d'écran "à faire
manuellement" ; en cas d'échec après tous les retries, l'étape est marquée 'failed_after_retries' dans
le journal mais n'interrompt pas les étapes suivantes.
```

---

## Prompt 3 — Sourcing et installation automatique de tous les émulateurs

```
Ajoute le module "Émulateurs" à ThorConfig (dossier /src/modules/emulators), sans aucune sélection
manuelle de fichier APK par l'utilisateur.

1. Crée un manifest /src/modules/emulators/sources.json listant, pour chaque émulateur pris en charge
   (MelonDS fork Dual Screen, Azahar, Dolphin build de dev, Cemu, extensible à d'autres) :
   { id, displayName, githubRepo, assetPattern (regex pour repérer le bon .apk dans les releases),
     packageName }.

2. Crée `emulatorSource.ts` : fetchLatestRelease(githubRepo) via l'API GitHub Releases publique
   (https://api.github.com/repos/<owner>/<repo>/releases/latest), sélectionne l'asset correspondant à
   `assetPattern`, le télécharge dans un cache local (/cache/apk/<id>/<version>.apk), vérifie le hash
   SHA-256 si publié dans la release (checksums.txt ou équivalent).

3. Pour chaque émulateur, exécute une séquence runVerifiedAction en chaîne :
   a. apply = adbClient.installApk(serial, apkPath) ; check = getPackageInfo(serial, packageName) ;
      expected = version installée correspond à la version téléchargée.
   b. Applique le profil de configuration (repris du fichier /src/modules/emulators/profiles/*.json
      détaillant les réglages ci-dessous) en éditant le fichier de config sur l'appareil (pull, édition
      locale du xml/ini/json, push) ; check = re-pull le fichier et vérifie chaque clé attendue.

Profils de configuration à encoder :
- MelonDS (fork Dual Screen) : Renderer=OpenGL, Internal Resolution=4x, Dual Screen Mode=actif,
  Layout=Top->Internal/Bottom->External, Touch Controls Soft Input=Always Invisible, R2=Fast Forward.
- Azahar : Graphics API=Vulkan, Internal Resolution=4x, Asynchronous Shaders=ON, New 3DS Mode=ON,
  Screen Layout=Separate Screens, mapping auto des touches physiques (via une commande d'auto-map si
  elle existe en CLI/intent, sinon fallback uiAutomation).
- Dolphin : External Display=actif sur l'écran du bas, Border=0%, mapping manette GameCube par défaut,
  hotkey Screen Swap assignée à un bouton physique précis (ex: bouton Select).
- Cemu : dossier ROMs Wii U ajouté aux Game Paths, Controller 1=Wii U GamePad, priorité au format .wua.

Critère d'acceptation : à partir d'une console vierge connectée, lancer ce module installe et configure
les 4 émulateurs sans aucune interaction, et chaque étape est vérifiée (version installée + contenu du
fichier de config relu et comparé).
```

---

## Prompt 4 — Dossier d'import surveillé & rangement automatique des ROMs

```
Ajoute le module "ROMs" à ThorConfig (dossier /src/modules/roms), déclenché automatiquement, sans
bouton "scanner" à cliquer.

1. Au premier lancement de l'app, demander une seule fois un "dossier d'import" local (persisté dans
   les réglages). Mettre en place un watcher (chokidar) sur ce dossier : dès qu'un fichier stable
   (taille inchangée pendant Xs) apparaît, il entre automatiquement dans la file de traitement.

2. Pipeline de traitement par fichier, chacune des étapes vérifiée :
   - Identification système par extension + signature d'en-tête (mapping /src/modules/roms/systemMap.json,
     au moins NDS, 3DS, GC, Wii, Wii U, PS2).
   - Regroupement base/update/DLC pour les jeux multi-fichiers d'un même titre si détectable.
   - Génération de playlists .m3u pour les jeux multi-disques.
   - Conversion en CHD via `chdman` si le binaire est présent en PATH (sinon logguer l'étape comme
     "bloquante, chdman manquant" dans le rapport final plutôt que de planter le pipeline).
   - Push vers la console dans roms/<systeme>/ (convention ES-DE) ; vérification = pull du fichier
     poussé (ou hash côté device via `adb shell sha256sum`) comparé au hash local.

3. Traiter les fichiers en file d'attente avec une limite de parallélisme configurable pour ne pas
   saturer le lien USB, et reprendre automatiquement un transfert interrompu (device déconnecté puis
   reconnecté).

Critère d'acceptation : déposer un jeu de fichiers de test dans le dossier d'import déclenche, sans
aucune action utilisateur supplémentaire, leur classement, conversion (si applicable) et envoi vérifié
sur la console.
```

---

## Prompt 5 — Sauvegardes : coffre-fort automatique

```
Ajoute le module "Sauvegardes" à ThorConfig (dossier /src/modules/saves).

1. Mapping /src/modules/saves/emulatorSavePaths.json : chemins des dossiers de save par émulateur pris
   en charge (accessibles sans root).
2. Dès que le module Émulateurs (Prompt 3) termine avec succès pour un émulateur donné, déclenche
   automatiquement une première sauvegarde "état initial" horodatée, avec manifest.json listant chaque
   fichier et son hash SHA-256.
3. Fonction backup(serial): pull tous les dossiers connus -> dossier local horodaté + manifest.
   Fonction restore(serial, backupId): push des fichiers -> vérification hash post-transfert.
   Fonction migrate(sourceSerial, targetSerial): backup puis restore enchaînés, avec détection du
   changement d'appareil connecté (nouveau numéro de série ADB) plutôt qu'une demande manuelle à
   l'utilisateur de "débrancher/rebrancher".
4. UI : historique des sauvegardes avec statut de vérification (hash OK / KO) par fichier.

Critère d'acceptation : après configuration complète d'un émulateur, une sauvegarde initiale est créée
automatiquement et son intégrité (hash) est vérifiée sans action de l'utilisateur.
```

---

## Prompt 6 — Conversion PS Vita automatique

```
Ajoute le module "PS Vita" à ThorConfig (dossier /src/modules/vita), déclenché automatiquement quand
des fichiers .7z/.zip contenant une structure PS Vita reconnaissable (présence d'un param.sfo attendu
après extraction) sont détectés dans le dossier d'import surveillé (Prompt 4) ou un sous-dossier dédié
"PSVita/".

1. Extraction (node-7z / adm-zip selon format) dans un dossier de travail temporaire.
2. Re-compression au format attendu par Vita3K (structure app0/ + fichiers associés — documenter la
   structure exacte en commentaire avec une référence à vérifier dans la doc officielle Vita3K, et
   ajouter une vérification post-génération qui compare l'arborescence produite à une liste de fichiers
   attendus).
3. Génération d'un .dpt par jeu (titre + Title ID lus depuis le param.sfo).
4. Détection de la cible : si Vita3K tourne sur la console elle-même, push via ADB dans le dossier
   attendu (vérifié par pull/hash) ; si la cible est un PC, copie locale dans un dossier de sortie
   configurable (vérifiée par comparaison de taille/hash).

Critère d'acceptation : un fichier de test avec une structure PS Vita factice produit une sortie
conforme, et le module se déclenche sans clic depuis le simple dépôt du fichier dans le dossier
surveillé.
```

---

## Prompt 7 — Launcher : installation, configuration et mise en Home app automatiques

```
Ajoute le module "Launcher" à ThorConfig (dossier /src/modules/launcher).

1. Installe automatiquement le launcher cible (récupéré comme les émulateurs, Prompt 3, si distribué en
   open-source/APK officiel — sinon, si l'app est déjà préinstallée sur la Thor, détecte simplement sa
   présence via `adb shell pm list packages`).
2. Déclenche un rescan de bibliothèque + un scraping des métadonnées (filtré sur les plateformes
   pertinentes) via les intents/commandes ADB disponibles ; vérifie ensuite via `adb shell dumpsys` ou
   lecture de la base de données locale du launcher (si accessible en pull) que le nombre de jeux
   détectés correspond au nombre de fichiers effectivement présents dans roms/.
3. Définit le launcher comme Home app par défaut : `adb shell cmd package set-home-activity
   <package>/<activity>`, vérifié par `adb shell cmd package get-home-activities` (doit renvoyer le bon
   package).
4. Pour le cas connu d'erreur "invalid launch shortcut" sur les jeux PC scannés depuis Steam : détecter
   automatiquement les raccourcis cassés (tentative de lancement en arrière-plan qui échoue) et les
   régénérer directement via le package name de l'app de lancement des jeux PC, en évitant le chemin
   défaillant du launcher — vérifié par un lancement/fermeture immédiate qui confirme que le processus a
   bien démarré (adb shell dumpsys activity | grep <package>).

Critère d'acceptation : à la fin de ce module, le launcher est actif, défini comme Home, sa bibliothèque
reflète les jeux réellement présents sur la console, et aucun raccourci Steam connu ne renvoie l'erreur
de lancement sans qu'une tentative de correction automatique ait été appliquée.
```

---

## Prompt 8 — Orchestrateur "Configurer ma console" (bouton unique)

```
Ajoute un module "Orchestrator" à ThorConfig (dossier /src/modules/orchestrator) qui enchaîne tous les
modules précédents (Prepare, Emulators, Roms, Saves, Vita, Launcher) derrière un unique bouton
"Configurer ma console".

1. Chaque module doit exposer une interface commune :
   `interface ThorModule { id: string; run(ctx: RunContext): Promise<ModuleResult> }`
   où ModuleResult = { moduleId, steps: StepResult[], overallStatus }.
   Adapte les modules précédents si besoin pour se conformer à cette interface (sans dupliquer leur
   logique, juste un wrapper si nécessaire).

2. L'orchestrateur exécute les modules dans l'ordre : pré-vérifications (device connecté, USB debugging
   actif, espace disque suffisant, adb/platform-tools disponibles) -> Prepare -> Emulators -> Roms (si
   des fichiers sont déjà présents dans le dossier d'import) -> Saves -> Vita (si applicable) ->
   Launcher.

3. Gestion des blocages durs (device déconnecté en cours de route, stockage plein) : pause automatique
   de l'orchestrateur avec reprise dès que la condition est résolue (polling), sans redémarrer les
   modules déjà terminés avec succès.

4. Écran de suivi en temps réel : progression module par module, journal détaillé (réutilise
   auditLog du Prompt 1), et à la fin, un "Rapport final" agrégeant tous les StepResult de tous les
   modules sous forme de score (ex: "52/55 vérifications passées") avec le détail des échecs éventuels
   et un bouton "Relancer uniquement les étapes en échec".

5. Export du rapport final en fichier .json/.md, utile en cas de support ou de réinstallation future.

Critère d'acceptation : sur une console fraîchement déballée avec USB debugging déjà activé et un
dossier d'import déjà rempli, cliquer sur "Configurer ma console" produit, sans autre interaction, une
console entièrement configurée et un rapport final listant toutes les vérifications effectuées.
```

---

## Prompt 9 — Tests, robustesse & packaging final

```
Finalise ThorConfig pour une première version distribuable (le mode simulation et la CI GitHub Actions
existent déjà depuis le Prompt 1 — complète-les, ne les recrée pas) :

1. Gestion d'erreurs uniforme pour toutes les commandes ADB (déconnexion en cours d'opération, timeout,
   permission refusée), avec retry géré par le moteur du Prompt 1 partout où c'est pertinent.
2. Tests unitaires (Vitest) sur : le moteur runVerifiedAction (cas succès direct, succès après retry,
   échec après tous les retries), le parsing de la hiérarchie UI (uiAutomation.ts) sur des fichiers XML
   d'exemple, l'identification de système par signature (module ROMs), le calcul/vérification de hash
   (module Sauvegardes). Fais tourner ces tests avec MockAdbClient (Prompt 1) pour ne dépendre d'aucun
   appareil réel, y compris dans le workflow GitHub Actions.
3. Étends MockAdbClient et ses fixtures pour couvrir les scénarios ajoutés par les Prompts 2 à 8 (états
   simulés d'émulateurs installés, de fichiers ROMs déjà poussés, etc.), pour pouvoir dérouler tout
   l'orchestrateur (Prompt 8) en mode simulation de bout en bout.
4. README avec : prérequis pour un poste de développement (Node.js, Git, Claude Code) ET prérequis côté
   testeur (USB Debugging activé sur sa console, driver ADB Windows si besoin) — précise clairement que
   ce sont deux publics différents.
5. Vérifie que la Release GitHub Actions du Prompt 1 inclut bien un lien stable et facile à partager
   (ex. toujours republier aussi sous un tag fixe `latest-test` en plus du tag horodaté, pour ne pas
   avoir à renvoyer un nouveau lien à chaque fois).

Critère d'acceptation : `npm run test` passe (y compris en mode simulation, sans appareil réel) ; le
mode simulation permet de dérouler tout l'orchestrateur sans connexion réelle à une console ; et le lien
de Release GitHub (`latest-test`) pointe toujours vers le dernier build Windows fonctionnel.
```
