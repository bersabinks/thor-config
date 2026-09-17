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

## 📁 Étape 3 : Où placer le dossier de ROMs de test sur ton PC ?

1. Décompresse ou copie le dossier **`ThorRomsTest`** où tu veux sur ton PC (par exemple sur ton **Bureau**, ou dans `C:\ThorRomsTest`).
2. Ce dossier de test ne pèse que **~8 Go** et contient **un seul jeu par console** pour tester rapidement le déploiement sans saturer ta connexion ni attendre des heures :
   - **Nintendo DS** : *Super Mario 64 DS* (16 Mo)
   - **Nintendo 3DS** : *Captain Toad : Treasure Tracker* (512 Mo)
   - **Sony PSP** : *Need for Speed : Most Wanted 5-1-0* (179 Mo)
   - **Sony PS1** : *Dragon Ball : Final Bout* (65 Mo)
   - **Sony PS2** : *Jak and Daxter : The Precursor Legacy* (855 Mo)
   - **Nintendo Wii** : *Super Paper Mario* (387 Mo)
   - **Nintendo Wii U** : *The Legend of Zelda : The Wind Waker HD* (838 Mo)
   - **Nintendo Switch** : *Mario Tennis Aces* (2.2 Go)
   - **Sony PS Vita** : *Adventures of Mana* (508 Mo)
   - **Microsoft Xbox** : *Jet Set Radio Future* (2.4 Go)

---

## 🚀 Étape 4 : Lancer et utiliser ThorConfig

1. Ouvre l'application **`ThorConfig.exe`** sur ton PC.
2. En haut à gauche, vérifie que ta console est bien détectée avec son numéro de série (si l'app est en « Mode simulation », désactive-le dans les **Réglages** pour passer sur ta vraie console).
3. Va dans le menu **ROMs** (barre latérale à gauche).
4. Clique sur le bouton **« Choisir un dossier d'import »** et sélectionne ton dossier **`ThorRomsTest`**.
5. **L'application gère tout automatiquement** :
   - Elle analyse chaque jeu (format, signature, console associée).
   - Elle crée les dossiers nécessaires sur ta console dans `/sdcard/ROMs/<console>/`.
   - Elle transfère les fichiers via USB avec une vérification de sécurité (SHA-256) pour garantir qu'aucun jeu n'est endommagé.
   - Tu peux suivre la barre de progression et le statut en temps réel.

---

## 🕹️ Étape 5 : Vérification sur la console

Une fois le transfert marqué comme terminé dans ThorConfig :
1. Prends ta console en main.
2. Ouvre ton lanceur de jeux (ES-DE / Daijishō) ou directement l'émulateur correspondant (ex. Dolphin, NetherSX2 / AetherSX2, PPSSPP, MelonDS, Citra/Azahar, Vita3K, Yuzu/Citron).
3. Lance un ou deux jeux de test pour vérifier :
   - Est-ce que le jeu démarre correctement ?
   - Les boutons et joysticks répondent-ils bien ?
   - Le son et l'image sont-ils fluides ?

---

## ⚠️ Ce qu'il FAUT FAIRE et NE PAS FAIRE

### ✅ À FAIRE :
- Laisser le câble branché et le PC tranquille pendant le transfert.
- Envoyer une **capture d'écran** ou le rapport de ThorConfig si une étape affiche une erreur rouge.
- Prendre une photo/courte vidéo de l'écran de la console si un jeu refuse de se lancer.

### ❌ À NE PAS FAIRE :
- **Ne débranche JAMAIS le câble USB** pendant un transfert de fichier en cours.
- **Ne laisse pas la console s'éteindre ou se mettre en veille prolongée** pendant le processus.
- **Ne copie pas manuellement les fichiers à la main** : laisse ThorConfig faire le travail pour tester que l'automatisation fonctionne bien.

Merci énormément pour ton test ! 🚀
