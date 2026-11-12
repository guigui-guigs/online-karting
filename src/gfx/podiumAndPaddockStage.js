import * as THREE from 'three';

const CONFETTI_COUNT = 220;
const CONFETTI_COLORS = [
  0xffbe0b, // Gold
  0x38bdf8, // Cyan
  0xf72585, // Magenta
  0x38b000, // Lime
  0xff5400, // Tangerine
  0xffffff, // Crisp white
];

const PODIUM_SLOTS = [
  { lx: 0.0, ly: 1.48, lz: 0.0, yawOffset: 0.0, width: 3.2, depth: 3.1, color: 0xfbbf24, label: '1', badgeBg: '#f59e0b', badgeFg: '#1e1b4b' },
  { lx: -3.35, ly: 0.96, lz: 0.28, yawOffset: 0.18, width: 2.95, depth: 2.95, color: 0xe2e8f0, label: '2', badgeBg: '#94a3b8', badgeFg: '#0f172a' },
  { lx: 3.35, ly: 0.58, lz: 0.28, yawOffset: -0.18, width: 2.95, depth: 2.95, color: 0xd97706, label: '3', badgeBg: '#b45309', badgeFg: '#fff7ed' },
];

function createRankPlaqueTexture(label, bgHex, fgHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 256, 128);

  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, bgHex);
  grad.addColorStop(1, '#1e293b');
  ctx.fillStyle = grad;
  ctx.fillRect(8, 8, 240, 112);

  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 236, 108);

  ctx.fillStyle = fgHex;
  ctx.font = '900 76px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTurntableTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const cx = 256;
  const cy = 256;

  const rad = ctx.createRadialGradient(cx, cy, 24, cx, cy, 252);
  rad.addColorStop(0.0, '#1e293b');
  rad.addColorStop(0.55, '#0f172a');
  rad.addColorStop(0.92, '#1e293b');
  rad.addColorStop(1.0, '#090d16');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle radial studio sheen rings
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 145, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.38)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, 228, 0, Math.PI * 2);
  ctx.stroke();

  // Checkered subtle center emblem
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  for (let i = 0; i < 16; i++) {
    if (i % 2 === 0) {
      const a0 = (i / 16) * Math.PI * 2;
      const a1 = ((i + 1) / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, 118, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class PodiumAndPaddockStage {
  constructor(scene) {
    this.scene = scene;
    this._disposables = { geos: [], mats: [], texs: [] };

    // Paddock / Showroom stage
    this.paddockGroup = new THREE.Group();
    this.paddockGroup.name = 'PaddockShowroomStage';
    this.paddockGroup.visible = false;
    this.scene.add(this.paddockGroup);
    this._paddockSpinner = null;
    this._paddockNeonMat = null;
    this._buildPaddockStage();

    // Podium 3D Ceremony stage
    this.podiumGroup = new THREE.Group();
    this.podiumGroup.name = 'PodiumCeremonyStage';
    this.podiumGroup.visible = false;
    this.scene.add(this.podiumGroup);
    this._podiumRingMat = null;
    this._podiumElapsed = 0;
    this._lastAnchor = { x: 0, y: 0, z: 0, yaw: 0 };
    this._buildPodiumStage();

    // Pre-allocated Confetti InstancedMesh (0 GC allocations per frame)
    this._confettiMesh = null;
    this._confettiDummy = new THREE.Object3D();
    this._confettiX = new Float32Array(CONFETTI_COUNT);
    this._confettiY = new Float32Array(CONFETTI_COUNT);
    this._confettiZ = new Float32Array(CONFETTI_COUNT);
    this._confettiVy = new Float32Array(CONFETTI_COUNT);
    this._confettiPhase = new Float32Array(CONFETTI_COUNT);
    this._confettiRotX = new Float32Array(CONFETTI_COUNT);
    this._confettiRotY = new Float32Array(CONFETTI_COUNT);
    this._confettiRotZ = new Float32Array(CONFETTI_COUNT);
    this._confettiSpeedX = new Float32Array(CONFETTI_COUNT);
    this._confettiSpeedY = new Float32Array(CONFETTI_COUNT);
    this._confettiActive = false;
    this._buildConfetti();

    // Reusable scratch sorting array for stagedKarts
    this._sortScratch = [];
  }

  _trackGeo(geo) {
    this._disposables.geos.push(geo);
    return geo;
  }

  _trackMat(mat) {
    this._disposables.mats.push(mat);
    return mat;
  }

  _trackTex(tex) {
    this._disposables.texs.push(tex);
    return tex;
  }

  _buildPaddockStage() {
    const topTex = this._trackTex(createTurntableTexture());

    // Low-profile metallic turntable deck (top at local y = 0.065)
    const deckGeo = this._trackGeo(new THREE.CylinderGeometry(2.35, 2.52, 0.09, 48));
    const deckMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        map: topTex,
        metalness: 0.78,
        roughness: 0.16,
      })
    );
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.position.y = 0.02;
    deckMesh.receiveShadow = true;
    this.paddockGroup.add(deckMesh);

    // Brushed chrome bevel rim
    const rimGeo = this._trackGeo(new THREE.TorusGeometry(2.37, 0.045, 10, 48));
    rimGeo.rotateX(Math.PI / 2);
    const rimMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.9,
        roughness: 0.18,
      })
    );
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.position.y = 0.062;
    this.paddockGroup.add(rimMesh);

    // Discreet rotating racing-tick ring around turntable
    this._paddockSpinner = new THREE.Group();
    this._paddockSpinner.position.y = 0.068;
    this.paddockGroup.add(this._paddockSpinner);

    const glowRingGeo = this._trackGeo(new THREE.RingGeometry(2.14, 2.22, 48));
    glowRingGeo.rotateX(-Math.PI / 2);
    this._paddockNeonMat = this._trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
      })
    );
    const glowRing = new THREE.Mesh(glowRingGeo, this._paddockNeonMat);
    this._paddockSpinner.add(glowRing);

    const tickGeo = this._trackGeo(new THREE.BoxGeometry(0.08, 0.014, 0.24));
    const tickMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.6,
        metalness: 0.3,
        roughness: 0.3,
      })
    );
    const tickCount = 12;
    for (let i = 0; i < tickCount; i++) {
      const a = (i / tickCount) * Math.PI * 2;
      const tick = new THREE.Mesh(tickGeo, tickMat);
      tick.position.set(Math.sin(a) * 2.02, 0.004, Math.cos(a) * 2.02);
      tick.rotation.y = a;
      this._paddockSpinner.add(tick);
    }

    // Coherent studio fill & rim lights scoped strictly to Paddock mode
    const keyFill = new THREE.PointLight(0xfff7ed, 5.5, 11, 2);
    keyFill.position.set(2.4, 3.1, 3.0);
    this.paddockGroup.add(keyFill);

    const coolRim = new THREE.PointLight(0x38bdf8, 4.0, 10, 2);
    coolRim.position.set(-2.8, 2.2, -2.5);
    this.paddockGroup.add(coolRim);
  }

  _buildPodiumStage() {
    // Sleek carpet base under all 3 podium blocks
    const carpetGeo = this._trackGeo(new THREE.BoxGeometry(10.6, 0.08, 4.4));
    const carpetMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e1b4b,
        metalness: 0.35,
        roughness: 0.32,
      })
    );
    const carpet = new THREE.Mesh(carpetGeo, carpetMat);
    carpet.position.set(0, 0.04, 0.14);
    carpet.receiveShadow = true;
    this.podiumGroup.add(carpet);

    // Glowing gold trim border on base
    const trimGeo = this._trackGeo(new THREE.BoxGeometry(10.8, 0.05, 4.6));
    this._podiumRingMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.75,
        metalness: 0.75,
        roughness: 0.2,
      })
    );
    const trim = new THREE.Mesh(trimGeo, this._podiumRingMat);
    trim.position.set(0, 0.025, 0.14);
    this.podiumGroup.add(trim);

    // 3 Podium steps (1st center, 2nd left, 3rd right)
    const bodyMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        metalness: 0.25,
        roughness: 0.24,
      })
    );

    for (let i = 0; i < PODIUM_SLOTS.length; i++) {
      const slot = PODIUM_SLOTS[i];
      const stepH = slot.ly;

      // Main step column
      const stepGeo = this._trackGeo(new THREE.BoxGeometry(slot.width, stepH, slot.depth));
      const stepMesh = new THREE.Mesh(stepGeo, bodyMat);
      stepMesh.position.set(slot.lx, stepH * 0.5, slot.lz);
      stepMesh.castShadow = true;
      stepMesh.receiveShadow = true;
      this.podiumGroup.add(stepMesh);

      // Metallic top cap
      const capGeo = this._trackGeo(new THREE.BoxGeometry(slot.width + 0.14, 0.12, slot.depth + 0.14));
      const capMat = this._trackMat(
        new THREE.MeshStandardMaterial({
          color: slot.color,
          emissive: slot.color,
          emissiveIntensity: i === 0 ? 0.28 : 0.14,
          metalness: 0.8,
          roughness: 0.18,
        })
      );
      const capMesh = new THREE.Mesh(capGeo, capMat);
      capMesh.position.set(slot.lx, stepH - 0.06, slot.lz);
      capMesh.receiveShadow = true;
      this.podiumGroup.add(capMesh);

      // Front rank plaque ('1', '2', '3') facing +Z (camera)
      const plaqueTex = this._trackTex(createRankPlaqueTexture(slot.label, slot.badgeBg, slot.badgeFg));
      const plaqueGeo = this._trackGeo(new THREE.PlaneGeometry(1.15, 0.56));
      const plaqueMat = this._trackMat(
        new THREE.MeshStandardMaterial({
          map: plaqueTex,
          roughness: 0.25,
          metalness: 0.2,
          emissive: 0xffffff,
          emissiveMap: plaqueTex,
          emissiveIntensity: 0.28,
        })
      );
      const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
      plaque.position.set(slot.lx, Math.max(0.32, stepH * 0.52), slot.lz + slot.depth * 0.5 + 0.02);
      this.podiumGroup.add(plaque);
    }

    // Flanking victory pylons
    const pylonGeo = this._trackGeo(new THREE.CylinderGeometry(0.14, 0.22, 3.1, 12));
    const orbGeo = this._trackGeo(new THREE.OctahedronGeometry(0.34, 0));
    const pylonMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.82,
        roughness: 0.2,
      })
    );
    const orbMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfde047,
        emissive: 0xfbbf24,
        emissiveIntensity: 1.15,
        metalness: 0.5,
        roughness: 0.15,
      })
    );

    this._victoryOrbs = [];
    for (const side of [-1, 1]) {
      const px = side * 5.25;
      const pz = -1.25;
      const pylon = new THREE.Mesh(pylonGeo, pylonMat);
      pylon.position.set(px, 1.55, pz);
      pylon.castShadow = true;
      this.podiumGroup.add(pylon);

      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.set(px, 3.45, pz);
      this.podiumGroup.add(orb);
      this._victoryOrbs.push(orb);
    }

    // Warm ceremony spotlight
    const podiumLight = new THREE.PointLight(0xfffbeb, 10, 18, 1.6);
    podiumLight.position.set(0, 6.2, 4.5);
    this.podiumGroup.add(podiumLight);
  }

  _buildConfetti() {
    const geo = this._trackGeo(new THREE.PlaneGeometry(0.19, 0.10));
    const mat = this._trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
      })
    );
    this._confettiMesh = new THREE.InstancedMesh(geo, mat, CONFETTI_COUNT);
    this._confettiMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._confettiMesh.frustumCulled = false;

    const c = new THREE.Color();
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      c.setHex(CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
      this._confettiMesh.setColorAt(i, c);
    }
    if (this._confettiMesh.instanceColor) {
      this._confettiMesh.instanceColor.needsUpdate = true;
    }

    this.podiumGroup.add(this._confettiMesh);
    this._resetConfetti();
  }

  _resetConfetti() {
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      // Deterministic pseudo-random spread around podium
      const s1 = Math.sin(i * 12.9898 + 1.23) * 43758.5453;
      const r1 = s1 - Math.floor(s1);
      const s2 = Math.sin(i * 78.233 + 4.56) * 43758.5453;
      const r2 = s2 - Math.floor(s2);
      const s3 = Math.sin(i * 39.425 + 7.89) * 43758.5453;
      const r3 = s3 - Math.floor(s3);

      this._confettiX[i] = (r1 - 0.5) * 12.5;
      this._confettiY[i] = 1.5 + r2 * 8.5;
      this._confettiZ[i] = (r3 - 0.5) * 6.5 + 0.6;
      this._confettiVy[i] = 1.45 + (i % 7) * 0.28;
      this._confettiPhase[i] = r1 * Math.PI * 2;
      this._confettiRotX[i] = r2 * Math.PI * 2;
      this._confettiRotY[i] = r3 * Math.PI * 2;
      this._confettiRotZ[i] = (r1 + r2) * Math.PI;
      this._confettiSpeedX[i] = 3.2 + (i % 5) * 1.1;
      this._confettiSpeedY[i] = 2.4 + (i % 6) * 0.95;
    }
  }

  _updateConfetti(dt, elapsed) {
    if (!this._confettiMesh) return;
    const dummy = this._confettiDummy;

    for (let i = 0; i < CONFETTI_COUNT; i++) {
      this._confettiY[i] -= this._confettiVy[i] * dt;
      if (this._confettiY[i] < 0.12) {
        this._confettiY[i] = 8.4 + (i % 5) * 0.45;
      }

      const flutterX = Math.sin(elapsed * 2.4 + this._confettiPhase[i]) * 0.65;
      const flutterZ = Math.cos(elapsed * 1.9 + this._confettiPhase[i] * 1.3) * 0.45;

      this._confettiRotX[i] += this._confettiSpeedX[i] * dt;
      this._confettiRotY[i] += this._confettiSpeedY[i] * dt;

      dummy.position.set(
        this._confettiX[i] + flutterX * 0.25,
        this._confettiY[i],
        this._confettiZ[i] + flutterZ * 0.25
      );
      dummy.rotation.set(this._confettiRotX[i], this._confettiRotY[i], this._confettiRotZ[i]);
      dummy.scale.setScalar(1.0);
      dummy.updateMatrix();
      this._confettiMesh.setMatrixAt(i, dummy.matrix);
    }

    this._confettiMesh.instanceMatrix.needsUpdate = true;
  }

  getPaddockKartYOffset() {
    return 0.065;
  }

  /**
   * Returns a shallow copy array `stagedKarts` placing Top 3 facing the camera on the
   * 3-step podium and moving ranks 4-6 off-camera (without mutating `raceState.karts`).
   */
  buildStagedKarts(karts, anchorSample) {
    if (!Array.isArray(karts) || karts.length === 0) return [];

    const ax = Number(anchorSample?.x) || 0;
    const ay = Number(anchorSample?.y) || 0;
    const az = Number(anchorSample?.z) || 0;
    const ayaw = Number(anchorSample?.yaw) || 0;
    const cosY = Math.cos(ayaw);
    const sinY = Math.sin(ayaw);

    // Sort references without mutating original array
    this._sortScratch.length = 0;
    for (let i = 0; i < karts.length; i++) {
      if (karts[i]) this._sortScratch.push(karts[i]);
    }
    this._sortScratch.sort((a, b) => {
      const ra = Number.isFinite(a.rank) ? a.rank : 99;
      const rb = Number.isFinite(b.rank) ? b.rank : 99;
      if (ra !== rb) return ra - rb;
      const fa = a.finished ? 0 : 1;
      const fb = b.finished ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return (a.finishTimeMs || 1e9) - (b.finishTimeMs || 1e9);
    });

    const stagedKarts = new Array(this._sortScratch.length);
    for (let i = 0; i < this._sortScratch.length; i++) {
      const src = this._sortScratch[i];

      if (i < 3) {
        const slot = PODIUM_SLOTS[i];
        const wx = ax + slot.lx * cosY + slot.lz * sinY;
        const wy = ay + slot.ly;
        const wz = az - slot.lx * sinY + slot.lz * cosY;

        stagedKarts[i] = {
          ...src,
          x: wx,
          y: wy,
          z: wz,
          yaw: ayaw + slot.yawOffset,
          speed: 0,
          steer: 0,
          drifting: false,
          driftDir: 0,
          driftCharge: 0,
          hopOffset: 0,
          boostTimer: 0,
          starTimer: 0,
          spinoutTimer: 0,
          stuntTimer: 0,
          shrinkTimer: 0,
          fallTimer: 0,
          invulnTimer: 0,
          rocketCharge: 0,
          airborne: false,
          drafting: false,
          shieldItem: null,
          eliminated: false,
          finished: true,
          rank: i + 1,
          progress: 0,
          vy: 0,
        };
      } else {
        // Ranks 4-6 (and any extra): strictly off-camera behind & below stage + hidden
        stagedKarts[i] = {
          ...src,
          x: ax - sinY * 150,
          y: ay - 90,
          z: az - cosY * 150,
          yaw: ayaw,
          speed: 0,
          eliminated: true,
          shieldItem: null,
        };
      }
    }

    return stagedKarts;
  }

  /**
   * Computes smooth cinematic camera target facing the 3D podium.
   * Writes directly into `outPos` and `outLook` (0 allocations).
   */
  getPodiumCameraTarget(aspect, elapsed, outPos, outLook) {
    const ax = this._lastAnchor.x;
    const ay = this._lastAnchor.y;
    const az = this._lastAnchor.z;
    const ayaw = this._lastAnchor.yaw;
    const cosY = Math.cos(ayaw);
    const sinY = Math.sin(ayaw);

    const isPortrait = aspect < 0.85;
    const baseDist = isPortrait ? 14.2 : 11.4;
    const sweepAngle = Math.sin(this._podiumElapsed * 0.42) * 0.28;
    const lx = Math.sin(sweepAngle) * baseDist;
    const lz = Math.cos(sweepAngle) * baseDist;
    const ly = (isPortrait ? 4.35 : 3.45) + Math.sin(elapsed * 0.7) * 0.16;

    outPos.set(
      ax + lx * cosY + lz * sinY,
      ay + ly,
      az - lx * sinY + lz * cosY
    );
    outLook.set(ax, ay + 1.85, az);
  }

  update({ mode = 'hidden', trackId = 'coco', heroSample = null, karts = null, dt = 1 / 60, elapsed = 0 } = {}) {
    const ax = Number(heroSample?.x) || 0;
    const ay = Number(heroSample?.y) || 0;
    const az = Number(heroSample?.z) || 0;
    const ayaw = Number(heroSample?.yaw) || 0;

    this._lastAnchor.x = ax;
    this._lastAnchor.y = ay;
    this._lastAnchor.z = az;
    this._lastAnchor.yaw = ayaw;

    if (mode === 'paddock') {
      this.paddockGroup.visible = true;
      this.paddockGroup.position.set(ax, ay, az);
      this.paddockGroup.rotation.y = ayaw;
      if (this._paddockSpinner) {
        this._paddockSpinner.rotation.y += dt * 0.28;
      }
      if (this._paddockNeonMat) {
        this._paddockNeonMat.opacity = 0.65 + Math.sin(elapsed * 2.2) * 0.15;
      }

      this.podiumGroup.visible = false;
      this._confettiActive = false;
      this._podiumElapsed = 0;
      return null;
    }

    this.paddockGroup.visible = false;

    if (mode === 'podium') {
      if (!this._confettiActive) {
        this._confettiActive = true;
        this._podiumElapsed = 0;
        this._resetConfetti();
      }
      this._podiumElapsed += dt;

      this.podiumGroup.visible = true;
      this.podiumGroup.position.set(ax, ay, az);
      this.podiumGroup.rotation.y = ayaw;

      if (this._victoryOrbs) {
        for (let i = 0; i < this._victoryOrbs.length; i++) {
          const orb = this._victoryOrbs[i];
          orb.rotation.y = elapsed * 2.1 + i * 1.4;
          orb.position.y = 3.45 + Math.sin(elapsed * 3.0 + i * Math.PI) * 0.12;
        }
      }
      if (this._podiumRingMat) {
        this._podiumRingMat.emissiveIntensity = 0.65 + Math.sin(elapsed * 4.0) * 0.2;
      }

      this._updateConfetti(dt, elapsed);
      return this.buildStagedKarts(karts, this._lastAnchor);
    }

    // Hidden during 'track_preview', 'lobby', 'countdown', 'racing'
    this.podiumGroup.visible = false;
    this._confettiActive = false;
    this._podiumElapsed = 0;
    return null;
  }

  dispose() {
    if (this.paddockGroup) {
      this.scene.remove(this.paddockGroup);
    }
    if (this.podiumGroup) {
      this.scene.remove(this.podiumGroup);
    }
    if (this._confettiMesh && typeof this._confettiMesh.dispose === 'function') {
      this._confettiMesh.dispose();
    }
    for (const tex of this._disposables.texs) tex.dispose();
    for (const mat of this._disposables.mats) mat.dispose();
    for (const geo of this._disposables.geos) geo.dispose();

    this._disposables.texs.length = 0;
    this._disposables.mats.length = 0;
    this._disposables.geos.length = 0;
    this._sortScratch.length = 0;
  }
}
