# PocketKart 3D — Pack Confort & Game Feel V3 🏎️🌴🌃🌈

**PocketKart 3D** est un jeu de course d'arcade 3D multijoueur inspiré de *Mario Kart*, pensé d'abord pour le **navigateur mobile** (iOS Safari / Android Chrome) tout en restant 100 % jouable sur PC. Foncez sur **3 circuits spectaculaires**, profitez d'un pilotage tactile calibre console (joystick flottant auto-centré, visée d'objets avant/arrière, bouclier remorqué, aspiration), défiez le **fantôme holographique** de vos amis par lien ou scannez le **QR Code** d'un salon en 2 secondes !

---

## ✨ Fonctionnalités & Nouveautés V3 (Confort & Game Feel)

### 🎮 Pilotage Calibre Console & Confort Mobile (V3)
- **Joystick flottant auto-centré OU Boutons Arcade `◀`/`▶`** : En mode joystick, poser le pouce n'importe où dans la zone gauche définit votre point `0` tout droit sans jamais tirer sur le côté ; basculez à tout moment vers les boutons `◀`/`▶` ou le **Volant Gyroscope 📱**.
- **Accélération Auto-Gaz ou Pédale `GAZ 🚀` manuelle** : Choisissez votre style sur l'accueil ou dans le menu Pause.
- **Gestes tactiles intelligents sur `OBJET`** :
  - **Toucher** : Tir / utilisation classique.
  - **Maintenir (`> 0.18s`)** avec Banane, Carapace Verte ou Rouge : **🛡️ Bouclier remorqué 3D** derrière le kart qui intercepte les carapaces ennemies ! Relâchez pour tirer.
  - **Glisser vers le bas (`⬇`)** : **Tir arrière** (carapaces envoyées derrière vous pour sniper vos poursuivants).
  - **Glisser vers le haut (`⬆`)** : **Lancer avant** (banane projetée 15 m devant sur la piste).
- **Aspiration (*Slipstream*) `💨`** : Restez dans le sillage d'un rival pendant 1,35 s pour déclencher des traînées de vent 3D et un boost d'aspiration !
- **Caméra prédictive (*Corner Look-Ahead*) & Signalisation 3D** : La caméra ouvre naturellement l'angle vers la sortie des virages, accompagnée de panneaux chevrons lumineux `>>>` / `<<<` et de pylônes laser d'alerte avant les zones sans barrières de *Route Céleste*.
- **Anti-Stunlock, Détection Contresens (`🔄 DEMI-TOUR !`) & Flèches de Proximité** : Clignotement d'invulnérabilité et remise dans l'axe après un choc, bouton **`↺ Replacer`** immédiat en cas de contresens, indicateurs colorés des rivaux proches en bas de l'écran, **prédiction client 0 ms** en ligne et **Menu Pause Solo (`⏸️`)** complet (avec pause auto si l'onglet passe en arrière-plan).

### 🗺️ 3 Circuits Arcade aux ambiances uniques
- 🌴 **Île Coco (*Lagon Tropical*)** : Plages ensoleillées, océan turquoise animé, palmiers et 2 tremplins de saut.
- 🌃 **Néon Drift (*Cyber Tokyo*)** : Nuit synthwave, asphalte humide aux vibrateurs cyan/magenta, viaduc surélevé, gratte-ciels illuminés et longues courbes de drift.
- 🌈 **Route Céleste (*Arc-en-Ciel Cosmique*)** : Ruban arc-en-ciel translucide dans une nébuleuse étoilée, 3 tremplins et sections sans barrières avec sauvetage par rayon OVNI.

### 🚀 Mécaniques Arcade & 7 Objets Explosifs
- **Départ Canon (*Rocket Start*)** au **"2"** du décompte, **Figures 360° (*Stunts*)** sur les tremplins et **Dérapage Mini-Turbo** à 3 niveaux (étincelles bleues → oranges → violettes + buffer de saut permissif).
- **7 Objets & Radar Arrière** : 🍄 Champi Turbo, 🐢 Carapace Verte, 🎯 Carapace Rouge, 🐚 **Carapace Bleue Ailée** (onde de choc sur le 1er), 🍌 Banane, ⭐ Super Étoile, ⚡ **Éclair** (rapetisse les pilotes devant) + alerte radar `⚠️ CARAPACE EN APPROCHE !`.

### 🌐 Viralité, Multijoueur Hybride (WebSocket + WebRTC P2P) & Audio Procédural
- **☁️ Multijoueur Hybride Zéro-Serveur (Vercel P2P + WebSocket local)** : Utilise automatiquement le serveur `/ws` en développement local, et bascule de façon transparente en **WebRTC Peer-to-Peer (`PeerJS` Host-Authoritative + serveurs STUN)** sur un hébergement statique comme **Vercel** (aucun serveur backend requis en production !).
- **⚡ Partie Publique** (départ auto en 10 s + bots IA) & **📱 Salon Privé avec QR Code SVG zoomable**.
- **👻 Défi Fantôme (`#challenge=...`)** : Course enregistrée toutes les 250 ms directement dans l'URL et rejouée à 60 fps sous forme de kart holographique cyan.
- **📸 Carte Podium Story (1080×1350 PNG)** avec **couronne `👑`** et **trophées humoristiques**, **🔥 Emotes & Klaxon 3D**, et **🎵 Musique + SFX 100 % Web Audio API**.

---

## 🚀 Installation, démarrage & déploiement Vercel

### Prérequis
- **Node.js** 18+ et **npm**

### 1. Installer les dépendances
```bash
npm install
```

### 2. Lancer en mode développement (Serveur WebSocket + Vite)
```bash
npm run dev
```
- Client Vite : `http://localhost:5173` (accessible sur votre réseau Wi-Fi local grâce à `--host`)
- Serveur WebSocket : `http://localhost:3001` (proxifié automatiquement sur `/ws` et `/api`)

### 3. Build de production et lancement Node unifié
```bash
npm run build
npm start
```
Le serveur Express (`server/index.js`) sert le bundle optimisé `dist/` ainsi que le serveur multijoueur `/ws` sur un seul port (`http://localhost:3001` par défaut, ou `process.env.PORT`).

### 4. Déployer gratuitement sur Vercel (100 % Statique + Multijoueur WebRTC P2P)
Le fichier `vercel.json` configure automatiquement le build Vite (`dist/`) et la réécriture SPA pour les liens d'invitation `?room=XXXX` :
```bash
npx vercel --prod
```
*(Ou importez simplement le dépôt Git sur [vercel.com](https://vercel.com) — sur Vercel CDN, `GameClient` bascule automatiquement en moins de 900 ms sur le mode **WebRTC P2P Host-Authoritative** pour les salons privés comme pour les parties publiques !)*

---

## 🎮 Commandes

### Sur Mobile / Tablette (Multi-Touch + Gyroscope optionnel)
- **Direction (Gauche)** : **Joystick flottant auto-centré** (défaut), **Boutons `◀` / `▶`** ou **Volant Gyroscope 📱**.
- **Gaz** : Automatique (*Auto-Gaz ON*) ou bouton **`GAZ 🚀`** (*Auto-Gaz OFF*).
- **`DÉRAPE` (Maintenir)** : Départ Canon au "2", dérapage Mini-Turbo en virage (saut permissif), figure 360° sur tremplin.
- **`OBJET` (Toucher / Maintenir / Glisser)** :
  - **Tap** : Utiliser l'objet.
  - **Maintenir** : **🛡️ Bouclier arrière** (banane / carapaces).
  - **Glisser `⬇` / `⬆`** : **Tir arrière** (carapaces) / **Lancer avant** (banane).
- **Pause Solo (`⏸️`) & Emotes (`🔥` `😈` `😂` `📯`)** accessibles directement sur le HUD.

### Sur Ordinateur (Clavier AZERTY & QWERTY)
| Action | Touches |
| :--- | :--- |
| **Tourner à gauche / droite** | `◀` / `▶`, `Q` ou `A` / `D` |
| **Accélérer / Viser vers l'avant** | `▲`, `Z` ou `W` (auto si *Auto-Gaz* activé ; lancer banane avant) |
| **Freiner / Reculer / Tir arrière** | `▼`, `S` ou `Maj` (`▼`/`S` + Objet = tir carapace arrière) |
| **Déraper / Départ Canon / Figure** | `Espace` ou `K` |
| **Objet (Tap = tir, Maintenir = 🛡️ Bouclier)** | `Entrée`, `E` ou `F` |
| **Pause Solo** | `Échap` ou `P` |
| **Emotes & Klaxon** | `1`, `2`, `3`, `4` ou `H` |

---

## 🗂️ Architecture du projet

```text
├── index.html                 # Point d'entrée mobile-first (viewport verrouillé, polices arcade)
├── vercel.json                # Configuration de déploiement statique Vite + réécriture SPA Vercel
├── server/
│   └── index.js               # Serveur Express + WebSocket optionnel (dev local / déploiement Node)
└── src/
    ├── main.js                # Intégration V3, boucle 60 fps, pause solo, codec Fantôme (#challenge=) & audio
    ├── shared/
    │   ├── constants.js       # Pilotes (RACERS), circuits (TRACKS), objets (ITEMS), emotes (EMOTES)
    │   ├── trackData.js       # 3 circuits splines, tremplins, panneaux de virage (turnSigns) & zones sans rail
    │   └── kartPhysics.js     # Physique V3 (bouclier, visée avant/arrière, aspiration, anti-stunlock, contresens)
    ├── net/
    │   ├── gameClient.js      # Client unifié Solo, WebSocket (/ws) & bascule auto WebRTC P2P (prédiction 0 ms)
    │   └── p2pAdapter.js      # Adaptateur WebRTC PeerJS Host-Authoritative (salons privés & matchmaking public)
    ├── gfx/
    │   ├── sceneManager.js    # Rendu Three.js, caméra prédictive (look-ahead), fantôme 3D, shake & photo-finish
    │   ├── trackBuilder.js    # 3 mondes 3D, panneaux chevrons lumineux, pylônes d'alerte vide & tremplins
    │   ├── kartFactory.js     # Toy Karts, bouclier 3D remorqué, clignotement invulnérable & vent d'aspiration
    │   └── itemVisuals.js     # Boîtes ?, carapace bleue ailée, onde de choc d'explosion et projectiles 3D
    ├── ui/
    │   ├── styles.css         # Thème arcade glossy, pause solo, flèches de proximité & alerte demi-tour
    │   ├── touchControls.js   # Joystick flottant / boutons ◀▶, gestes OBJET (visée/bouclier), pédale GAZ & gyro
    │   └── hudAndScreens.js   # Accueil, salon QR Code, HUD V3, modale Pause Solo, Carte Story & Défi Fantôme
    └── audio/
        └── soundEngine.js     # Synthétiseur Web Audio API, pause fluide, SFX bouclier/aspiration & musiques
```
