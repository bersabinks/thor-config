# 🎮 Guide Pas-à-Pas pour le Testeur — AYN Thor Max & ThorConfig

Salut et merci pour ton aide précieuse sur les tests de **ThorConfig** ! 🙏  
Ce guide t'explique exactement quoi faire, étape par étape, en toute simplicité.

---

## ⚡ Étape 1 : Préparer la console (À faire une seule fois)

Sur ta **AYN Thor Max** :
1. Va dans **Paramètres (Settings)** > **À propos de l'appareil (About)**.
2. Descends tout en bas et tapote **7 fois d'affilée** sur **« Numéro de build » (Build number)** jusqu'à voir le message : *« Vous êtes désormais développeur ! »*.
3. Reviens en arrière dans **Paramètres** > **Système** > **Options pour les développeurs**.
4. Active l'interrupteur **« Débogage USB » (USB Debugging)**.

---

## 🔌 Étape 2 : Connecter la console au PC

1. Branche ta console au PC avec un **câble USB-C de transfert de données** (évite les câbles basiques qui ne font que la recharge).
2. Regarde l'écran de ta console : une invite apparaît disant **« Autoriser le débogage USB ? »**.
3. Coche impérativement la case **« Toujours autoriser depuis cet ordinateur »**, puis clique sur **Autoriser / OK**.
4. *Important* : Garde l'écran de la console allumé pendant les manipulations.

---

## 🔴 Étape 3 : BASCULER THORCONFIG EN MODE RÉEL (Très important !)

Par défaut, l'application démarre en mode simulation (pour les développeurs sans console).  
**Pour que l'application communique réellement avec ta console physique :**

1. Ouvre **ThorConfig** sur ton PC.
2. Dans le menu de gauche, clique sur **Réglages**.
3. Tout en haut, **décoche l'interrupteur « Activer le mode simulation »**.
4. Regarde en haut à gauche : le badge orange `SIMULATION` disparaît et le statut passe au vert : **AYN Thor Max (Connecté)**.

---

## 📁 Étape 4 : Lancer le test des ROMs (Dossier ThorRomsTest)

1. Décompresse le dossier **`ThorRomsTest`** sur ton PC (par exemple sur ton Bureau).
   *(Ce pack léger de ~8 Go contient 1 jeu par console pour tester rapidement le déploiement sans attendre des heures).*
2. Dans ThorConfig, va sur l'onglet **ROMs** (menu de gauche).
3. Clique sur le bouton **« Choisir un dossier d'import »** et sélectionne ton dossier **`ThorRomsTest`**.
4. **ThorConfig prend le relais automatiquement** :
   - Il identifie chaque console (Switch, PS2, Xbox, Wii, N3DS, PSP, etc.).
   - Il crée les dossiers sur ta console dans `/sdcard/ROMs/<console>/`.
   - Il transfère les jeux et vérifie leur intégrité (SHA-256).
   - Suis la barre de progression jusqu'à la fin.

---

## 🕹️ Étape 5 : Vérification sur ta console

Une fois le transfert marqué comme terminé dans ThorConfig :
1. Prends ta console en main.
2. Ouvre ton lanceur de jeux (ES-DE / Daijishō) ou directement les émulateurs (ex. Dolphin, NetherSX2, PPSSPP, MelonDS, Azahar, Vita3K, Yuzu/Citron).
3. Lance 1 ou 2 jeux de test pour vérifier :
   - Est-ce que le jeu démarre correctement ?
   - Les boutons et joysticks répondent-ils bien ?
   - Le son et l'image sont-ils fluides ?

---

## ⚠️ Ce qu'il FAUT FAIRE et NE PAS FAIRE

### ✅ À FAIRE :
- Laisser le câble branché et le PC tranquille pendant le transfert.
- Envoyer une **capture d'écran** ou le rapport de ThorConfig s'il y a une erreur rouge.
- Prendre une photo/courte vidéo de l'écran de la console si un jeu refuse de se lancer.

### ❌ À NE PAS FAIRE :
- **Ne débranche JAMAIS le câble USB** pendant un transfert en cours.
- **Ne laisse pas la console se mettre en veille prolongée** pendant le processus.
- **Ne copie pas manuellement les fichiers à la main** : laisse ThorConfig faire le travail pour tester que l'automatisation fonctionne bien.

Merci énormément pour ton test ! 🚀
