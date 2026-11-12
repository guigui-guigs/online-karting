# PocketKart 3D — Édition Ultime V5 🏎️✨🏆

**PocketKart 3D** est un jeu de course d'arcade 3D multijoueur inspiré de *Mario Kart*, pensé pour le **navigateur mobile** (iOS Safari / Android Chrome) et le **PC** (Clavier & Manettes). Foncez sur **6 circuits vivants** (+ variantes **Miroir ⇄** et **1 Arène de Bataille 360°**), faites évoluer votre pilote du **Niveau 1 au Niveau 30**, personnalisez votre kart dans le **Garage**, admirez la **Cérémonie Podium 3D**, et affrontez vos amis en **WebSocket** ou **WebRTC Peer-to-Peer** !

---

## ✨ Nouveautés V5 — Édition Ultime

- **Pipeline Graphique HDR & Post-Processing (`EffectComposer`)** : Rendu Three.js r170 avec `RoomEnvironment` PMREM, `UnrealBloomPass`, shader dynamique `SpeedFXShaderPass` (aberration chromatique, flou radial & vignette d'impact/boost) et tone mapping `ACESFilmic` via `OutputPass`.
- **Qualité Graphique Adaptative (`Auto / Ultra / Équilibré / Éco`)** : Détection automatique desktop/mobile et sélecteur rapide dans les réglages (Accueil & Pause) avec persistance locale.
- **Cérémonie Podium 3D & Paddock Showroom** : Socle Paddock dédié sur l'accueil et véritable podium 3D à 3 marches avec confettis animés et caméra cinématique en fin de course (`👁️ Vue Podium 3D`).
- **Biomes Vivants & VFX de Piste** :
  - *Pic Polaire* : flocons 3D & aurores boréales ondulantes.
  - *Néon Drift* : pluie néon, hologrammes & trafic aérien cyber.
  - *Île Coco* : mouettes, lucioles tropicales & tribunes de spectateurs animés.
  - *Volcan Magma* : braises ascendantes & lueur de lave pulsante.
  - *Route Céleste* : étoiles filantes & poussière cosmique scintillante.
  - *Flipper Arcade* & *Stade Ballon* : projecteurs balayants dynamiques.
  - **Traces de pneus persistantes, fumée cartoon, ondes de choc Mini-Turbo**, éclats cristallins sur les boîtes `?`, saut de pièces dorées et sillages lumineux de carapaces.
- **Audio Polyphonique & Musique de Paddock** : Musique synthwave lounge dédiée aux menus (`home` / `lobby` / `finished`), 7 thèmes de course enrichis (accords, percussions, arpèges de dernier tour, spatialisation stéréo), carillons de paliers de drift (`1 / 2 / 3`) et son de dépassement.
- **Support Complet Manette / Gamepad** : Plug-and-play Xbox, DualSense et Switch Pro (`navigator.getGamepads()`), vibration dual-rumble, badge manette et bouton Pause dédié.
- **HUD Télémétrie AAA** : Tachymètre SVG incurvé `0–180 km/h` avec jauge Mini-Turbo à 3 paliers, chrono & split delta par tour (`-0.52s` / `+0.24s`), tour de classement live 6 pilotes sur grand écran, popups d'action arcade, killfeed live compact et barres de stats comparatives au Garage.

---

## 🏆 Fonctionnalités Complètes

### 🎯 Progression, Garage, 6 Circuits & 5 Formats
- **Progression & Niveaux (1 → 30)** : XP cumulée, rangs de pilote, pièces 🪙 ramassées en piste et **Défis Flash** renouvelables.
- **Garage & Atelier** : 6 châssis (*Standard MK*, *Dune Buggy*, *Moto Cyber*, *Bulldozer Heavy*, *Aéroglisseur X*, *Formule Or*) + 5 styles de boost/néon débloquables par niveau ou achetables en pièces.
- **6 Circuits + Miroir ⇄ + Arène** : *Île Coco*, *Pic Polaire*, *Néon Drift*, *Flipper Arcade*, *Volcan Magma*, *Route Céleste* + 🎈 *Stade Ballon*.
- **5 Formats de Jeu** : **Course Simple**, **Grand Prix** (3 Coupes & trophées), **Élimination (*Knockout*)**, **Contre-la-Montre** (3 Champis, médailles & record fantôme) et **Bataille de Ballons 360°**, en `50cc`, `100cc` et `150cc`.

### 🚀 Mécaniques Arcade & Multijoueur Hybride
- **Départ Canon (*Rocket Start*)**, **Figures 360° (*Stunts*)**, **Dérapage Mini-Turbo à 3 niveaux**, **Aspiration (*Slipstream*)** et **Bouclier 3D remorqué** (`🛡️`).
- **7 Objets** : 🍄 Champi Turbo, 🐢 Carapace Verte, 🎯 Carapace Rouge, 🐚 Carapace Bleue Ailée, 🍌 Banane, ⭐ Super Étoile, ⚡ Éclair.
- **Multijoueur Hybride (WebSocket + WebRTC P2P)** : Serveur `/ws` en local et bascule automatique **WebRTC Peer-to-Peer** sur hébergement statique (Vercel), **Compte & Social** (amis, classements Supabase), **Défi Fantôme (`#challenge=...`)** et **Carte Podium Story (1080×1350 PNG)**.

---

## 🚀 Installation, démarrage & déploiement

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
- Client Vite : `http://localhost:5173` (accessible sur le réseau local via `--host`)
- Serveur WebSocket : `http://localhost:3001` (proxifié sur `/ws` et `/api`)

### 3. Build de production et lancement Node unifié
```bash
npm run build
npm start
```
Le serveur Express (`server/index.js`) sert le bundle optimisé `dist/` (avec découpage en chunks `three`, `supabase` et `index`) ainsi que le serveur multijoueur `/ws`.

### 4. Déployer sur Vercel
Le fichier `vercel.json` configure le build Vite (`dist/`) et la réécriture SPA pour les liens d'invitation `?room=XXXX` :
```bash
npx vercel --prod
```

---

## 🎮 Commandes

### Sur Mobile / Tablette (Multi-Touch + Gyroscope optionnel)
- **Direction (Gauche)** : **Joystick flottant auto-centré** (défaut), **Boutons `◀` / `▶`** ou **Volant Gyroscope 📱**.
- **Gaz** : Automatique (*Auto-Gaz ON*) ou pédale **`GAZ 🚀`** (*Auto-Gaz OFF*).
- **`DÉRAPE` (Maintenir)** : Départ Canon au "2", dérapage Mini-Turbo (anneau de charge 3 paliers), figure 360° sur tremplin.
- **`OBJET` (Toucher / Maintenir / Glisser)** : Tap = utiliser, Maintenir = 🛡️ Bouclier arrière, Glisser `⬇` / `⬆` = Tir arrière / Lancer avant.

### Sur Ordinateur (Clavier AZERTY & QWERTY)
| Action | Touches |
| :--- | :--- |
| **Tourner à gauche / droite** | `◀` / `▶`, `Q` ou `A` / `D` |
| **Accélérer / Viser vers l'avant** | `▲`, `Z` ou `W` |
| **Freiner / Reculer / Tir arrière** | `▼`, `S` ou `Maj` (`▼`/`S` + Objet = tir arrière) |
| **Déraper / Départ Canon / Figure** | `Espace` ou `K` |
| **Objet (Tap = tir, Maintenir = 🛡️ Bouclier)** | `Entrée`, `E` ou `F` |
| **Pause Solo** | `Échap` ou `P` |
| **Emotes & Klaxon** | `1`, `2`, `3`, `4` ou `H` |

### Sur Manette (Xbox / DualSense / Switch Pro)
| Action | Bouton / Axe |
| :--- | :--- |
| **Direction / Visée objet** | Stick gauche (X/Y) ou Croix directionnelle |
| **Accélérer** | `RT / R2` ou `A / Croix` |
| **Freiner / Reculer** | `LT / L2` ou `B / Rond` |
| **Déraper / Sauter / Figure** | `RB / R1` ou `Y / Triangle` |
| **Objet (Tap = tir, Maintenir = 🛡️ Bouclier)** | `LB / L1` ou `X / Carré` |
| **Pause Solo** | `Start / Options` |

---

## 🗂️ Architecture du projet

```text
├── index.html                        # Point d'entrée mobile-first avec écran de chargement #pk-boot-loader
├── vite.config.js                    # Configuration Vite 6 (proxy /ws & /api, manualChunks three/supabase)
├── vercel.json                       # Configuration de déploiement statique Vite + réécriture SPA Vercel
├── server/
│   └── index.js                      # Serveur Express + WebSocket (dev local / déploiement Node)
└── src/
    ├── main.js                       # Intégration V5, boucle 60 fps, qualité HDR, audio/haptique/manette
    ├── shared/
    │   ├── constants.js              # Pilotes, circuits, karts, styles de boost, coupes, CC & formats
    │   ├── trackData.js              # Circuits splines, variantes Miroir, arène, tremplins & signalisation
    │   ├── kartPhysics.js            # Simulation physique (course, GP, knockout, chrono, bataille ballons)
    │   ├── progression.js            # Niveaux, XP, pièces, garage, défis flash & records
    │   └── ghostCodec.js             # Encodage/décodage URL des défis fantômes (#challenge=)
    ├── net/
    │   ├── gameClient.js             # Client unifié Solo, WebSocket (/ws) & WebRTC P2P
    │   ├── p2pAdapter.js             # Adaptateur WebRTC PeerJS Host-Authoritative
    │   └── authAndSocialService.js   # Authentification, profil cloud & amis Supabase
    ├── gfx/
    │   ├── sceneManager.js           # Scène Three.js r170, RoomEnvironment, caméra look-ahead & événements
    │   ├── postProcessing.js         # Pipeline EffectComposer (UnrealBloomPass, SpeedFXShaderPass, OutputPass)
    │   ├── podiumAndPaddockStage.js  # Scène Paddock showroom & Cérémonie Podium 3D avec confettis
    │   ├── trackBuilder.js           # 6 biomes vivants + arène, météo 3D & textures enrichies
    │   ├── kartFactory.js            # Toy Karts, traces de pneus persistantes, fumée & ondes Mini-Turbo
    │   └── itemVisuals.js            # Boîtes ?, pièces, éclats de collecte & sillages de carapaces
    ├── ui/
    │   ├── styles.css                # Thème arcade V5, tachymètre, classement live, podium & badges
    │   ├── authSocialOverlay.css     # Styles harmonisés de la barre sociale & modales amis/compte
    │   ├── authSocialOverlay.js      # Interface compte, amis & classements Supabase
    │   ├── deviceMode.js             # Détection adaptative mobile / desktop
    │   ├── touchControls.js          # Contrôles tactiles, gyroscope & support complet manette/gamepad
    │   └── hudAndScreens.js          # Accueil, Garage comparatif, HUD télémétrie, Podium 3D & Story Card
    └── audio/
        └── soundEngine.js            # Synthétiseur Web Audio, musique Paddock, grooves polyphoniques & SFX
```
