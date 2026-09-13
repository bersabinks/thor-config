# Guide de démarrage détaillé — ThorConfig
### (édition multi-machines + test à distance par un ami)

Ce guide accompagne `prompts-claude-code-ayn-thor.md`. Contexte pris en compte ici :
- Tu vas coder depuis **plusieurs machines** (maison, école).
- Tu **n'as pas encore la console** (livraison dans quelques mois) : c'est **un ami**, qui possède déjà
  une AYN Thor Max, qui fera les tests réels à ta place.

Conséquence : le code doit vivre sur **GitHub** (pour te suivre d'une machine à l'autre), et l'app doit
pouvoir se tester en bonne partie **sans aucune console branchée** (mode simulation), le reste étant
validé par ton ami via un installeur qu'on lui envoie — pas besoin qu'il installe Node.js ou quoi que ce
soit de développeur.

---

## Étape 1 — Installer les outils sur ton PC (maison, et pareil à l'école si tu as les droits admin)

### 1.1 Node.js
- https://nodejs.org, télécharge la version **LTS**, installe avec les options par défaut.
- Ferme/rouvre PowerShell, vérifie :
  ```
  node --version
  npm --version
  ```

### 1.2 Git (obligatoire cette fois, pas juste "conseillé")
- https://git-scm.com/download/win, ou en une commande :
  ```
  winget install Git.Git
  ```
- Ferme/rouvre PowerShell, vérifie :
  ```
  git --version
  ```
- Configure ton identité (une seule fois, sert à signer tes commits) :
  ```
  git config --global user.name "Ton Nom"
  git config --global user.email "ton-email@example.com"
  ```

### 1.3 Un compte GitHub
- Si tu n'en as pas déjà un : https://github.com/join, crée un compte gratuit.
- Retiens bien ton nom d'utilisateur GitHub, on s'en sert à l'étape 2.

### 1.4 Claude Code CLI
```
npm install -g @anthropic-ai/claude-code
```
Vérifie :
```
claude --version
```

### 1.5 ADB — pas nécessaire tout de suite
Comme c'est ton ami qui teste sur sa console, **ta machine n'a pas besoin d'ADB pour l'instant**. Tu
l'installeras uniquement le jour où tu recevras ta propre console (voir le guide précédent, section
"Android Platform Tools", si besoin à ce moment-là).

---

## Étape 2 — Créer le dépôt GitHub du projet

1. Va sur https://github.com/new (connecté à ton compte).
2. Nom du dépôt : `thor-config`.
3. Visibilité : **Public** est le plus simple ici — il n'y a aucune donnée sensible dans ce projet (ni
   ROM, ni clé, ni info perso), et ça permettra à ton ami de télécharger les builds sans avoir besoin
   d'un compte GitHub. Si tu préfères le garder **Privé**, c'est possible aussi, mais il faudra alors
   inviter ton ami comme "collaborateur" du dépôt (Settings > Collaborators) pour qu'il puisse
   télécharger les fichiers de build.
4. Ne coche ni "Add a README", ni ".gitignore", ni licence — Claude Code va générer tout ça.
5. Clique "Create repository". Sur la page qui s'affiche, note l'URL en haut (ex :
   `https://github.com/TonPseudo/thor-config.git`) — tu en auras besoin juste après.

---

## Étape 3 — Créer le dossier local, lancer Claude Code, exécuter le Prompt 1

1. Crée un dossier, ex `C:\Dev\thor-config`, ouvre un terminal dedans (clic droit > "Ouvrir dans le
   terminal", ou `cd C:\Dev\thor-config`).
2. Lance :
   ```
   claude
   ```
3. Colle le contenu du bloc "Prompt 1" (depuis `prompts-claude-code-ayn-thor.md`), valide les actions
   proposées.
4. Une fois terminé :
   ```
   npm install
   npm run dev
   ```
   Active le "Mode simulation" dans les Réglages de l'app si ce n'est pas déjà activé par défaut — tu
   dois voir une console factice "AYN Thor Max (simulation)" apparaître, sans rien avoir branché. Teste
   le bouton "Vérifier que l'écran est allumé" : il doit répondre en mode simulé.
5. Connecte ce dossier au dépôt GitHub créé à l'étape 2 :
   ```
   git init
   git remote add origin https://github.com/TonPseudo/thor-config.git
   git add -A
   git commit -m "Prompt 1 - socle du projet"
   git branch -M main
   git push -u origin main
   ```
   (Remplace l'URL par la tienne. Si `git init` dit que c'est déjà un dépôt git, c'est que Claude Code
   l'a fait pour toi — passe directement à `git remote add origin ...`.)
6. Va vérifier sur la page GitHub du dépôt (rafraîchis la page) que les fichiers sont bien apparus.

**Répète un `git add -A / git commit -m "..." / git push` à la fin de chaque prompt suivant**, ça garde
tout synchronisé pour pouvoir continuer depuis une autre machine.

---

## Étape 4 — Travailler depuis l'école

### Option A — tu as les droits administrateur sur le PC de l'école
Refais l'étape 1 (Node.js, Git, Claude Code) sur ce PC, puis :
```
git clone https://github.com/TonPseudo/thor-config.git
cd thor-config
claude
```
Dis simplement à Claude Code : *"Continue le projet ThorConfig déjà présent dans ce dossier (cloné
depuis GitHub), voici le prochain prompt à implémenter :"* puis colle le prompt suivant.

### Option B — pas de droits admin, ou juste plus rapide : Claude Code sur le web
1. Va sur https://claude.ai/code dans le navigateur du PC de l'école.
2. Clique "Select repository...", connecte ton compte GitHub si demandé (autorise l'app "Claude"), et
   choisis `thor-config`.
3. Dans la zone de texte en bas, écris directement ta demande, par exemple : *"Lis le fichier
   prompts-claude-code-ayn-thor.md à la racine du dépôt. Implémente uniquement la section Prompt 4."*
4. Claude travaille dans un environnement cloud isolé, puis pousse ses changements sur une **branche**
   et te propose une **Pull Request** (un récapitulatif des changements à valider).
5. Relis la Pull Request depuis l'interface, et clique "Merge" pour l'intégrer dans `main` si tout te
   semble correct — sinon écris un message à Claude pour lui demander des ajustements avant de fusionner.

### Dans les deux cas — en revenant sur une autre machine
Avant de continuer, récupère toujours les derniers changements :
```
git pull
```
(ou clone à nouveau si c'est la première fois sur cette machine).

---

## Étape 5 — Récupérer un build à envoyer à ton ami

Grâce à la CI ajoutée dans le Prompt 1, chaque `git push` sur `main` (ou chaque Pull Request mergée)
déclenche automatiquement une construction de l'app.

1. Sur la page GitHub du dépôt, onglet **Actions** : tu dois voir un workflow en cours ou terminé après
   chaque push.
2. Une fois terminé (coche verte), va dans l'onglet **Releases** (sur la page principale du dépôt, dans
   la colonne de droite, ou `https://github.com/TonPseudo/thor-config/releases`).
3. Télécharge le lien du `.exe` le plus récent (ou copie le lien direct) — c'est ce lien que tu enverras
   à ton ami (Discord, mail, WhatsApp, peu importe).

Pas besoin de renvoyer un nouveau lien à chaque fois si tu as suivi le Prompt 9 : demande à Claude Code
d'exposer une release à URL fixe (`latest-test`) que tu peux garder en favori et renvoyer telle quelle.

---

## Étape 6 — Dérouler les Prompts 2 à 8

Pour chaque prompt, dans l'ordre :

1. Colle le prompt dans Claude Code (local ou web selon la machine où tu es), valide les actions.
2. Teste d'abord **toi-même, en mode simulation** (`npm run dev`, toggle simulation activé) tout ce qui
   ne nécessite pas de vraie console — logique de tri des fichiers, écrans, enchaînement des étapes.
3. `git add -A / git commit / git push` (ou merge la Pull Request si tu es passé par le web).
4. Regroupe 2 à 3 prompts avant de solliciter ton ami pour un vrai test — voir l'étape 5 pour récupérer
   le lien du build, et la section "Instructions pour ton ami" plus bas pour ce qu'il doit faire de son
   côté.
5. Quand ton ami te remonte un problème (voir la section dédiée plus bas pour ce qu'il doit t'envoyer),
   recolle l'info telle quelle dans Claude Code en lui demandant de corriger, avant de continuer.

Attention particulière :
- **Prompt 2** : les libellés exacts des menus AYN peuvent varier selon le firmware — c'est ton ami qui
  pourra te dire ce qu'il voit vraiment à l'écran si l'automatisation ne trouve pas un menu.
- **Prompt 3** : demande à Claude Code de vérifier via recherche web que les dépôts GitHub des
  émulateurs dans `sources.json` sont les bons (fork MelonDS Dual Screen, Azahar, build Dolphin adapté,
  Cemu).

---

## Étape 7 — Le dossier d'import (ROMs / dumps)

Le classement des fichiers (Prompt 4) et pas mal de logique associée sont testables **toi-même en mode
simulation**, avec de faux fichiers vides ayant juste la bonne extension (ex: `test.nds`, `test.iso`) —
pas besoin d'attendre ton ami pour vérifier que le tri fonctionne. Seul l'envoi réel vers une console
(le `push` ADB) nécessite le matériel de ton ami.

---

## Étape 8 — "Configurer ma console" : c'est ton ami qui l'exécute

Une fois les Prompts 1 à 8 en place et un build envoyé à ton ami :
1. Il installe le `.exe`, active le débogage USB sur sa console (voir instructions à lui transmettre
   ci-dessous), la branche, et clique sur le bouton "Configurer ma console" dans l'app.
2. Il t'envoie une capture du rapport final (score de vérifications, détail des échecs éventuels).
3. Tu relaies ça à Claude Code pour corriger ce qui doit l'être, tu repousses, un nouveau build se
   génère, il retélécharge et retest la partie corrigée.

---

## Étape 9 — Finaliser avec le Prompt 9

Une fois le comportement validé par ton ami sur sa vraie console, colle le Prompt 9 pour compléter les
tests automatisés et le README, puis `git push` une dernière fois.

---

## Instructions à transmettre à ton ami (testeur)

*(Tu peux copier-coller ce bloc directement dans un message à ton ami.)*

> Salut ! Merci d'avance pour les tests 🙏 Voici ce qu'il faut faire :
>
> **1. Une seule fois, avant le premier test :**
> - Allume ta AYN Thor Max, va dans Réglages > À propos de la tablette.
> - Tape 7 fois de suite rapidement sur "Numéro de build" (un message "Vous êtes développeur"
>   apparaît).
> - Retourne dans Réglages > Système > "Options pour les développeurs", active "Débogage USB".
>
> **2. À chaque nouveau test :**
> - Télécharge le fichier `.exe` depuis le lien que je t'envoie, installe-le sur ton PC.
> - Branche ta console en USB à ton PC (câble qui transfère des données, pas juste un câble de charge).
> - Une popup apparaît sur l'écran de la console : "Autoriser le débogage USB ?" — coche "Toujours
>   autoriser depuis cet ordinateur" et valide.
> - Ouvre l'app installée : elle doit détecter ta console automatiquement.
> - Fais ce que je t'indique dans mon message (souvent : cliquer sur un bouton précis, ou sur
>   "Configurer ma console").
>
> **3. Pour me faire ton retour, envoie-moi :**
> - Une **capture d'écran** de l'app (le journal en bas, ou le rapport final) après le test.
> - Si quelque chose plante ou ne fait pas ce qui était prévu : décris ce que tu as vu sur **l'écran de
>   la console elle-même** (pas juste dans l'app), idéalement avec une photo ou une petite vidéo si ce
>   n'est pas clair à décrire.
> - Si un module a déjà touché ta console (réglages, émulateurs) et que tu veux repartir propre pour un
>   prochain test, dis-le-moi, je te dirai s'il faut désinstaller quelque chose avant.
>
> Merci encore, chaque retour m'aide à corriger avant le test suivant !

---

## Lexique complémentaire

- **Dépôt (repository / repo)** : l'espace GitHub qui contient tout le code du projet.
- **Commit** : un "instantané" enregistré des changements, avec un message descriptif.
- **Push / Pull** : envoyer tes commits vers GitHub (push) / récupérer les commits des autres ou d'une
  autre machine depuis GitHub (pull).
- **Clone** : copier un dépôt GitHub sur une nouvelle machine pour la première fois.
- **Branche** : une ligne de développement parallèle à `main`, utilisée notamment par Claude Code sur le
  web pour proposer ses changements sans les appliquer directement.
- **Pull Request (PR)** : une proposition de changements sur une branche, à relire avant de l'intégrer
  ("merge") dans `main`.
- **CI (intégration continue) / GitHub Actions** : des scripts qui se déclenchent automatiquement sur
  GitHub à chaque push, ici pour construire l'installeur Windows.
- **Release** : une version publiée du projet sur GitHub, avec des fichiers téléchargeables attachés
  (ici, le `.exe`).
- **Mode simulation (dry-run)** : un mode de l'app qui simule une console au lieu d'en utiliser une
  vraie, pour tester sans matériel.
