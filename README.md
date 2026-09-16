# ThorConfig — AYN Thor Max

Application desktop (Electron + React + TypeScript) de configuration et de provisionnement en **1 clic** pour la console portable double écran **AYN Thor Max** sous Android.

---

## 🚀 Fonctionnalités principales

ThorConfig orchestre automatiquement toutes les étapes nécessaires pour préparer la console :

1. **Préparation du système** :
   - Vérification de la connexion ADB et des propriétés de la console.
   - Configuration de la navigation par gestes Android.
   - Validation des réglages AYN et des doubles écrans.

2. **Émulateurs** :
   - Téléchargement et installation des dernières versions :
     - **MelonDS Dual Screen** (Nintendo DS)
     - **Azahar** (Nintendo 3DS)
     - **Dolphin dev build** (GameCube / Wii)
     - **Cemu Android port** (Wii U)
   - Guide de configuration manuel intégré pour les réglages spécifiques double écran.

3. **ROMs & Rangement automatique** :
   - Détection des formats, conversion CHD automatique (via `chdman`), génération des playlists multi-disques `.m3u` et copie vers les dossiers cibles (`/sdcard/ROMs/<Console>/`).

4. **Sauvegardes** :
   - Sauvegarde de l'état initial des émulateurs dès l'installation terminée.

5. **PS Vita** :
   - Détection des dumps Vita, conversion `.dpt` / extraction et copie sur console.

6. **Launcher** :
   - Définition du launcher comme application Home par défaut sur Android.

7. **Utilitaires** :
   - Installation et paramétrage des utilitaires système recommandés pour la console :
     - **ClusterTune** : Régulation thermique et sous-cadençage CPU/GPU via le service PServer AYN (sans root). Activation automatique de la tuile dans les paramètres rapides. Profil par défaut recommandé : **Équilibré / Safe**.
     - **Final ROM** : Boîte à outils ROM directement sur Android (conversion CHD, NSZ/XCZ, patchs IPS/UPS, playlists m3u). Préparation automatique du dossier `/sdcard/ROMs/`.
     - **ZArchiver** : Gestionnaire d'archives complet (7z, zip, rar). Détection automatique ou renvoi vers la page Play Store sur la console.

---

## 💡 Utilitaires recommandés en installation manuelle

- **AB Download Manager (ABDM)** :  
  Gestionnaire de téléchargements multi-thread rapide et moderne ([GitHub](https://github.com/amir1376/ab-download-manager)).  
  *Conseillé pour les utilisateurs qui souhaitent télécharger directement des fichiers volumineux ou des archives sur la console.*

---

## ⚙️ Profils ClusterTune recommandés

| Émulateur / Usage | Profil recommandé | Remarques |
|---|---|---|
| **Nintendo DS (MelonDS)** | Équilibré / Safe | Température minimale, batterie maximale |
| **Nintendo 3DS (Azahar)** | Équilibré / Safe | Pleine vitesse à 4× sans surchauffe |
| **PSP / RetroArch** | Équilibré / Safe | Aucune saccade, consommation réduite |
| **Switch / PS2 / Wii U** | Performance | Puissance maximale requise pour le 60 FPS |
| **Usage général** | Équilibré / Safe | Profil idéal par défaut |

> ⚠️ *Éviter le profil « Économie » lors de sessions d'émulation lourde afin d'éviter tout ralentissement.*

---

## 🛠️ Développement & Tests

```bash
# Installation des dépendances
npm install

# Lancement des tests unitaires (Vitest)
npm test

# Vérification des types TypeScript
npx tsc --noEmit

# Démarrage de l'application en mode développement
npm run dev
```
