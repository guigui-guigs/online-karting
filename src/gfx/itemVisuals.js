import * as THREE from 'three';
import { ITEMS } from '../shared/constants.js';
import { ITEM_BOX_SPOTS, getTrackMeta } from '../shared/trackData.js';

function createCrystalBoxTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0.0, 'rgba(0, 245, 212, 0.78)');
  grad.addColorStop(0.28, 'rgba(56, 189, 248, 0.72)');
  grad.addColorStop(0.54, 'rgba(255, 112, 166, 0.78)');
  grad.addColorStop(0.78, 'rgba(255, 214, 102, 0.78)');
  grad.addColorStop(1.0, 'rgba(131, 56, 236, 0.78)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
  ctx.beginPath();
  ctx.moveTo(0, 48);
  ctx.lineTo(48, 0);
  ctx.lineTo(256, 208);
  ctx.lineTo(208, 256);
  ctx.closePath();
  ctx.fill();

  ctx.lineWidth = 16;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.strokeRect(10, 10, 236, 236);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createQuestionMarkTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 256, 256);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 184px "Fredoka", "Nunito", "Arial Rounded MT Bold", sans-serif';

  ctx.shadowColor = 'rgba(255, 230, 0, 0.85)';
  ctx.shadowBlur = 18;
  ctx.lineWidth = 24;
  ctx.strokeStyle = '#1e1b4b';
  ctx.strokeText('?', 128, 138);

  ctx.shadowBlur = 0;
  const qGrad = ctx.createLinearGradient(0, 46, 0, 214);
  qGrad.addColorStop(0.0, '#ffffff');
  qGrad.addColorStop(0.45, '#fff066');
  qGrad.addColorStop(1.0, '#ff9e00');
  ctx.fillStyle = qGrad;
  ctx.fillText('?', 128, 138);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createGlowRingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.55)');
  grad.addColorStop(0.55, 'rgba(56, 240, 255, 0.42)');
  grad.addColorStop(0.85, 'rgba(255, 112, 166, 0.25)');
  grad.addColorStop(1.0, 'rgba(255, 112, 166, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  return new THREE.CanvasTexture(canvas);
}

function buildRainbowBoxGeometry() {
  const geo = new THREE.BoxGeometry(1.12, 1.12, 1.12);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const hue = ((Math.atan2(z, x) / (Math.PI * 2)) + (y > 0 ? 0.18 : 0.62) + 1) % 1;
    c.setHSL(hue, 0.95, 0.72);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function buildBananaBodyGeometry() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.1, -0.04),
    new THREE.Vector3(0.02, 0.42, 0.08),
    new THREE.Vector3(0.0, 0.74, 0.05),
    new THREE.Vector3(-0.04, 0.96, -0.08),
  ]);
  const geo = new THREE.TubeGeometry(curve, 10, 0.19, 9, false);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const py = pos.getY(i);
    const u = Math.max(0, Math.min(1, (py - 0.1) / 0.86));
    const spine = curve.getPoint(u);
    const profile = Math.sin(Math.pow(u, 0.75) * Math.PI * 0.92) * 0.92 + 0.25;
    pos.setXYZ(
      i,
      spine.x + (pos.getX(i) - spine.x) * profile,
      py,
      spine.z + (pos.getZ(i) - spine.z) * profile
    );
  }
  geo.computeVertexNormals();
  return geo;
}

function buildBananaPeelPetalGeometry() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.26, 0.12),
    new THREE.Vector3(0, 0.18, 0.34),
    new THREE.Vector3(0, 0.05, 0.54),
  ]);
  const geo = new THREE.TubeGeometry(curve, 6, 0.085, 6, false);
  geo.scale(1.45, 0.52, 1.0);
  geo.computeVertexNormals();
  return geo;
}

function buildWingGeometry() {
  // Stylized 3-feather arcade angel wing extending outward along +X
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.32, 0.38, 0.78, 0.42);
  shape.quadraticCurveTo(0.58, 0.18, 0.68, 0.12);
  shape.quadraticCurveTo(0.45, 0.0, 0.54, -0.06);
  shape.quadraticCurveTo(0.28, -0.16, 0, -0.08);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  geo.center();
  // Shift pivot to inner wing root (x = 0) so flapping around Z pivots cleanly at the shell!
  geo.translate(0.38, 0.08, 0);
  return geo;
}

/**
 * Manages Iridescent `?` Item Boxes, 3D Projectiles (Green/Red/Winged-Spiny-Blue Shells & Bananas),
 * and Blue-Shell Expanding Shockwave Explosions across all tracks.
 */
export class ItemVisualManager {
  constructor(scene, initialTrackId = 'coco') {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'ItemsAndProjectiles';
    scene.add(this.root);

    this.boxesGroup = new THREE.Group();
    this.root.add(this.boxesGroup);

    this.coinsGroup = new THREE.Group();
    this.root.add(this.coinsGroup);

    this.disposables = [];
    this.textures = [];

    // Shared 3D Collectible Gold Coin assets
    this.coinDiscGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.12, 16);
    this.coinDiscGeo.rotateX(Math.PI / 2);
    this.coinBarGeo = new THREE.BoxGeometry(0.12, 0.42, 0.16);
    this.coinMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xd97706,
      emissiveIntensity: 0.45,
      metalness: 0.8,
      roughness: 0.18,
    });
    this.disposables.push(this.coinDiscGeo, this.coinBarGeo, this.coinMat);

    // Shared Item Box assets
    const crystalTex = createCrystalBoxTexture();
    const qMarkTex = createQuestionMarkTexture();
    const glowTex = createGlowRingTexture();
    this.textures.push(crystalTex, qMarkTex, glowTex);

    this.boxGeo = buildRainbowBoxGeometry();
    this.innerDiamondGeo = new THREE.OctahedronGeometry(0.44, 0);
    this.groundDiscGeo = new THREE.PlaneGeometry(1.9, 1.9);
    this.groundDiscGeo.rotateX(-Math.PI / 2);

    this.boxMat = new THREE.MeshStandardMaterial({
      map: crystalTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      roughness: 0.12,
      metalness: 0.15,
      emissive: 0xffffff,
      emissiveMap: crystalTex,
      emissiveIntensity: 0.32,
      depthWrite: false,
    });

    this.innerDiamondMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
    });

    this.qSpriteMat = new THREE.SpriteMaterial({
      map: qMarkTex,
      transparent: true,
      depthWrite: false,
    });

    this.groundDiscMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    // Shared Projectile assets (Green, Red & Winged Spiny Blue Shells + Bananas)
    this.shellDomeGeo = new THREE.CylinderGeometry(0.3, 0.5, 0.34, 6);
    this.shellCapGeo = new THREE.CylinderGeometry(0.08, 0.3, 0.14, 6);
    this.shellRimGeo = new THREE.TorusGeometry(0.47, 0.105, 8, 16);
    this.shellRimGeo.rotateX(Math.PI / 2);
    this.shellBellyGeo = new THREE.CylinderGeometry(0.44, 0.32, 0.16, 12);
    this.shellGlowGeo = new THREE.RingGeometry(0.35, 0.68, 18);
    this.shellGlowGeo.rotateX(-Math.PI / 2);
    this.spikeGeo = new THREE.ConeGeometry(0.095, 0.28, 6);
    this.wingGeo = buildWingGeometry();

    this.greenShellMat = new THREE.MeshStandardMaterial({
      color: 0x10dc60,
      emissive: 0x059669,
      emissiveIntensity: 0.22,
      roughness: 0.22,
      metalness: 0.12,
      flatShading: true,
    });
    this.redShellMat = new THREE.MeshStandardMaterial({
      color: 0xff243c,
      emissive: 0xbe123c,
      emissiveIntensity: 0.28,
      roughness: 0.22,
      metalness: 0.12,
      flatShading: true,
    });
    this.blueShellMat = new THREE.MeshStandardMaterial({
      color: 0x0077ff,
      emissive: 0x00bbf9,
      emissiveIntensity: 0.48,
      roughness: 0.18,
      metalness: 0.25,
      flatShading: true,
    });
    this.shellWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xe0f2fe,
      emissiveIntensity: 0.18,
      roughness: 0.25,
    });
    this.shellBellyMat = new THREE.MeshStandardMaterial({
      color: 0xfde68a,
      roughness: 0.5,
    });
    this.greenGlowMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.redGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff2a54,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.blueGlowMat = new THREE.MeshBasicMaterial({
      color: 0x00f5d4,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    // Banana geometries & materials
    this.bananaBodyGeo = buildBananaBodyGeometry();
    this.bananaPeelGeo = buildBananaPeelPetalGeometry();
    this.bananaTipGeo = new THREE.CylinderGeometry(0.04, 0.065, 0.14, 7);

    this.bananaSkinMat = new THREE.MeshStandardMaterial({
      color: 0xffe600,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.15,
      roughness: 0.28,
    });
    this.bananaTipMat = new THREE.MeshStandardMaterial({
      color: 0x713f12,
      roughness: 0.8,
    });

    // Shockwave Explosion geometries
    this.shockSphereGeo = new THREE.SphereGeometry(1, 22, 16);
    this.shockRingGeo = new THREE.RingGeometry(0.76, 1.0, 28);
    this.shockRingGeo.rotateX(-Math.PI / 2);

    this.disposables.push(
      this.boxGeo,
      this.innerDiamondGeo,
      this.groundDiscGeo,
      this.boxMat,
      this.innerDiamondMat,
      this.qSpriteMat,
      this.groundDiscMat,
      this.shellDomeGeo,
      this.shellCapGeo,
      this.shellRimGeo,
      this.shellBellyGeo,
      this.shellGlowGeo,
      this.spikeGeo,
      this.wingGeo,
      this.greenShellMat,
      this.redShellMat,
      this.blueShellMat,
      this.shellWhiteMat,
      this.shellBellyMat,
      this.greenGlowMat,
      this.redGlowMat,
      this.blueGlowMat,
      this.bananaBodyGeo,
      this.bananaPeelGeo,
      this.bananaTipGeo,
      this.bananaSkinMat,
      this.bananaTipMat,
      this.shockSphereGeo,
      this.shockRingGeo
    );

    this.itemBoxes = [];
    this.coins = [];
    this.projectilesMap = new Map();
    this.explosionsMap = new Map();
    this.currentTrackId = null;

    // Pre-allocated scratch objects & reusable Sets (zero per-frame GC)
    this._dummy = new THREE.Object3D();
    this._tmpColor = new THREE.Color();
    this._zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    this._activeBoxSet = new Set();
    this._activeCoinSet = new Set();
    this._seenProjIds = new Set();
    this._seenExpIds = new Set();
    this._hasSyncedPickups = false;

    // Rainbow Crystal Shard Burst Pool (? Box pickup VFX)
    const SHARD_COUNT = 64;
    const shardGeo = new THREE.OctahedronGeometry(0.24, 0);
    const shardMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.crystalShardInst = new THREE.InstancedMesh(shardGeo, shardMat, SHARD_COUNT);
    this.crystalShardInst.frustumCulled = false;
    this.crystalShards = [];
    this._tmpColor.setHex(0xffffff);
    for (let i = 0; i < SHARD_COUNT; i++) {
      this.crystalShardInst.setMatrixAt(i, this._zeroMatrix);
      this.crystalShardInst.setColorAt(i, this._tmpColor);
      this.crystalShards.push({
        active: false,
        age: 0,
        life: 0.52,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        scale: 1,
      });
    }
    this.crystalShardInst.instanceMatrix.needsUpdate = true;
    if (this.crystalShardInst.instanceColor) this.crystalShardInst.instanceColor.needsUpdate = true;
    this.root.add(this.crystalShardInst);
    this.disposables.push(shardGeo, shardMat, this.crystalShardInst);

    // Jumping Gold Coin + Spark Pool (Coin pickup VFX)
    this.coinJumpPool = [];
    for (let i = 0; i < 6; i++) {
      const grp = new THREE.Group();
      const disc = new THREE.Mesh(this.coinDiscGeo, this.coinMat);
      const bar = new THREE.Mesh(this.coinBarGeo, this.coinMat);
      grp.add(disc, bar);
      grp.visible = false;
      this.root.add(grp);
      this.coinJumpPool.push({
        group: grp,
        active: false,
        age: 0,
        life: 0.46,
        x: 0,
        y: 0,
        z: 0,
        vy: 0,
      });
    }

    const COIN_SPARK_COUNT = 48;
    const coinSparkGeo = new THREE.OctahedronGeometry(0.14, 0);
    const coinSparkMat = new THREE.MeshBasicMaterial({
      color: 0xffec4f,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.coinSparkInst = new THREE.InstancedMesh(coinSparkGeo, coinSparkMat, COIN_SPARK_COUNT);
    this.coinSparkInst.frustumCulled = false;
    this.coinSparks = [];
    for (let i = 0; i < COIN_SPARK_COUNT; i++) {
      this.coinSparkInst.setMatrixAt(i, this._zeroMatrix);
      this.coinSparks.push({
        active: false,
        age: 0,
        life: 0.42,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
      });
    }
    this.coinSparkInst.instanceMatrix.needsUpdate = true;
    this.root.add(this.coinSparkInst);
    this.disposables.push(coinSparkGeo, coinSparkMat, this.coinSparkInst);

    // Luminous Shell Wake / Trail Pool (Green, Red & Blue Shells)
    const SHELL_TRAIL_COUNT = 150;
    const trailGeo = new THREE.SphereGeometry(0.28, 7, 6);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.shellTrailInst = new THREE.InstancedMesh(trailGeo, trailMat, SHELL_TRAIL_COUNT);
    this.shellTrailInst.frustumCulled = false;
    this.shellTrails = [];
    this._shellTrailCursor = 0;
    this._tmpColor.setHex(0x4ade80);
    for (let i = 0; i < SHELL_TRAIL_COUNT; i++) {
      this.shellTrailInst.setMatrixAt(i, this._zeroMatrix);
      this.shellTrailInst.setColorAt(i, this._tmpColor);
      this.shellTrails.push({
        active: false,
        age: 0,
        life: 0.32,
        x: 0,
        y: 0,
        z: 0,
        vy: 0,
        baseScale: 1,
      });
    }
    this.shellTrailInst.instanceMatrix.needsUpdate = true;
    if (this.shellTrailInst.instanceColor) this.shellTrailInst.instanceColor.needsUpdate = true;
    this.root.add(this.shellTrailInst);
    this.disposables.push(trailGeo, trailMat, this.shellTrailInst);

    this.rebuildForTrack(initialTrackId);
  }

  rebuildForTrack(trackId = 'coco') {
    if (this.currentTrackId === trackId && this.itemBoxes.length > 0) return;
    this.currentTrackId = trackId;

    // Clear old item box & coin instances
    while (this.boxesGroup.children.length > 0) {
      this.boxesGroup.remove(this.boxesGroup.children[0]);
    }
    while (this.coinsGroup.children.length > 0) {
      this.coinsGroup.remove(this.coinsGroup.children[0]);
    }
    this.clearTransientFX();

    const meta = typeof getTrackMeta === 'function' ? getTrackMeta(trackId) : null;
    const spots = meta?.itemBoxSpots || ITEM_BOX_SPOTS || [];

    this.itemBoxes = spots.map((spot, index) => {
      const container = new THREE.Group();
      container.position.set(spot.x, spot.y, spot.z);
      this.boxesGroup.add(container);

      const groundGlow = new THREE.Mesh(this.groundDiscGeo, this.groundDiscMat);
      groundGlow.position.y = 0.04;
      container.add(groundGlow);

      const floatRig = new THREE.Group();
      floatRig.position.y = 1.05;
      container.add(floatRig);

      const cubeSpin = new THREE.Group();
      cubeSpin.rotation.set(Math.PI * 0.22, index * 0.5, Math.PI * 0.22);
      const cubeMesh = new THREE.Mesh(this.boxGeo, this.boxMat);
      const innerMesh = new THREE.Mesh(this.innerDiamondGeo, this.innerDiamondMat);
      cubeSpin.add(cubeMesh, innerMesh);
      floatRig.add(cubeSpin);

      const qSprite = new THREE.Sprite(this.qSpriteMat);
      qSprite.scale.set(0.84, 0.84, 1);
      floatRig.add(qSprite);

      return {
        id: spot.id,
        index,
        container,
        groundGlow,
        floatRig,
        cubeSpin,
        active: true,
        scaleAnim: 1,
        popTimer: 0,
        phase: index * 0.85,
      };
    });

    const coinSpots = meta?.coinSpots || [];
    this.coins = coinSpots.map((spot) => {
      const container = new THREE.Group();
      const baseY = (spot.y || 0) + 0.72;
      container.position.set(spot.x, baseY, spot.z);
      const disc = new THREE.Mesh(this.coinDiscGeo, this.coinMat);
      const bar = new THREE.Mesh(this.coinBarGeo, this.coinMat);
      container.add(disc, bar);
      this.coinsGroup.add(container);
      return {
        id: spot.id,
        mesh: container,
        baseY,
        x: spot.x,
        z: spot.z,
        active: true,
      };
    });
    this._hasSyncedPickups = false;
  }

  clearTransientFX() {
    for (const vis of this.projectilesMap.values()) {
      this.root.remove(vis.group);
    }
    this.projectilesMap.clear();

    for (const exp of this.explosionsMap.values()) {
      this.root.remove(exp.group);
      exp.outerMat.dispose();
      exp.coreMat.dispose();
      exp.ringMat.dispose();
    }
    this.explosionsMap.clear();

    if (this.crystalShards) {
      for (let i = 0; i < this.crystalShards.length; i++) {
        this.crystalShards[i].active = false;
        this.crystalShardInst.setMatrixAt(i, this._zeroMatrix);
      }
      this.crystalShardInst.instanceMatrix.needsUpdate = true;
    }

    if (this.coinJumpPool) {
      for (let i = 0; i < this.coinJumpPool.length; i++) {
        this.coinJumpPool[i].active = false;
        this.coinJumpPool[i].group.visible = false;
      }
    }

    if (this.coinSparks) {
      for (let i = 0; i < this.coinSparks.length; i++) {
        this.coinSparks[i].active = false;
        this.coinSparkInst.setMatrixAt(i, this._zeroMatrix);
      }
      this.coinSparkInst.instanceMatrix.needsUpdate = true;
    }

    if (this.shellTrails) {
      for (let i = 0; i < this.shellTrails.length; i++) {
        this.shellTrails[i].active = false;
        this.shellTrailInst.setMatrixAt(i, this._zeroMatrix);
      }
      this.shellTrailInst.instanceMatrix.needsUpdate = true;
      this._shellTrailCursor = 0;
    }
  }

  _spawnBoxBurst(x, y, z) {
    const palette = [0xff4081, 0xffbe0b, 0x00f5d4, 0x38bdf8, 0xc084fc];
    let spawned = 0;
    let colorDirty = false;
    for (let i = 0; i < this.crystalShards.length && spawned < 10; i++) {
      const sh = this.crystalShards[i];
      if (sh.active) continue;
      const ang = (spawned / 10) * Math.PI * 2 + Math.random() * 0.45;
      const spd = 4.5 + Math.random() * 4.5;
      sh.active = true;
      sh.age = 0;
      sh.life = 0.46 + Math.random() * 0.16;
      sh.x = x;
      sh.y = y;
      sh.z = z;
      sh.vx = Math.cos(ang) * spd;
      sh.vy = 4.8 + Math.random() * 4.2;
      sh.vz = Math.sin(ang) * spd;
      sh.rx = Math.random() * Math.PI;
      sh.ry = Math.random() * Math.PI;
      sh.scale = 0.85 + Math.random() * 0.55;

      this._tmpColor.setHex(palette[(spawned + i) % palette.length]);
      this.crystalShardInst.setColorAt(i, this._tmpColor);
      colorDirty = true;
      spawned++;
    }
    if (colorDirty && this.crystalShardInst.instanceColor) {
      this.crystalShardInst.instanceColor.needsUpdate = true;
    }
  }

  _spawnCoinBurst(x, y, z) {
    for (let i = 0; i < this.coinJumpPool.length; i++) {
      const cj = this.coinJumpPool[i];
      if (!cj.active) {
        cj.active = true;
        cj.age = 0;
        cj.life = 0.44;
        cj.x = x;
        cj.y = y;
        cj.z = z;
        cj.vy = 7.6;
        cj.group.position.set(x, y, z);
        cj.group.scale.setScalar(1.0);
        cj.group.visible = true;
        break;
      }
    }

    let spawned = 0;
    for (let i = 0; i < this.coinSparks.length && spawned < 8; i++) {
      const sp = this.coinSparks[i];
      if (sp.active) continue;
      const ang = (spawned / 8) * Math.PI * 2 + Math.random() * 0.35;
      const spd = 3.2 + Math.random() * 3.0;
      sp.active = true;
      sp.age = 0;
      sp.life = 0.36 + Math.random() * 0.12;
      sp.x = x;
      sp.y = y + 0.1;
      sp.z = z;
      sp.vx = Math.cos(ang) * spd;
      sp.vy = 3.8 + Math.random() * 3.2;
      sp.vz = Math.sin(ang) * spd;
      spawned++;
    }
  }

  _spawnShellTrail(x, y, z, type) {
    const idx = this._shellTrailCursor;
    this._shellTrailCursor = (idx + 1) % this.shellTrails.length;
    const tr = this.shellTrails[idx];
    tr.active = true;
    tr.age = 0;
    tr.life = type === ITEMS.BLUE_SHELL || type === 'blue_shell' ? 0.38 : 0.28;
    tr.x = x;
    tr.y = y;
    tr.z = z;
    tr.vy = 0.45;
    tr.baseScale = type === ITEMS.BLUE_SHELL || type === 'blue_shell' ? 1.25 : 0.92;

    if (type === ITEMS.BLUE_SHELL || type === 'blue_shell') {
      this._tmpColor.setHex(0x00e5ff);
    } else if (type === ITEMS.RED_SHELL || type === 'red_shell') {
      this._tmpColor.setHex(0xff3b30);
    } else {
      this._tmpColor.setHex(0x4ade80);
    }
    this.shellTrailInst.setColorAt(idx, this._tmpColor);
    if (this.shellTrailInst.instanceColor) {
      this.shellTrailInst.instanceColor.needsUpdate = true;
    }
  }

  _createProjectileVisual(type) {
    const group = new THREE.Group();

    if (type === ITEMS.BANANA) {
      const rig = new THREE.Group();
      group.add(rig);

      const body = new THREE.Mesh(this.bananaBodyGeo, this.bananaSkinMat);
      body.castShadow = true;
      rig.add(body);

      const tip = new THREE.Mesh(this.bananaTipGeo, this.bananaTipMat);
      tip.position.set(-0.045, 1.0, -0.09);
      tip.rotation.x = -0.35;
      rig.add(tip);

      for (let i = 0; i < 3; i++) {
        const petal = new THREE.Mesh(this.bananaPeelGeo, this.bananaSkinMat);
        petal.rotation.y = (i / 3) * Math.PI * 2;
        petal.castShadow = true;
        rig.add(petal);
      }

      return { group, spinner: rig, type, phase: Math.random() * Math.PI * 2 };
    }

    if (type === ITEMS.BLUE_SHELL || type === 'blue_shell') {
      // 3D WINGED SPINY BLUE SHELL!
      const shellBody = new THREE.Group();
      shellBody.scale.setScalar(1.18);
      group.add(shellBody);

      const spinner = new THREE.Group();
      shellBody.add(spinner);

      const dome = new THREE.Mesh(this.shellDomeGeo, this.blueShellMat);
      dome.position.y = 0.1;
      dome.castShadow = true;
      const cap = new THREE.Mesh(this.shellCapGeo, this.blueShellMat);
      cap.position.y = 0.33;
      const rim = new THREE.Mesh(this.shellRimGeo, this.shellWhiteMat);
      rim.position.y = -0.04;
      const belly = new THREE.Mesh(this.shellBellyGeo, this.shellBellyMat);
      belly.position.y = -0.14;
      spinner.add(dome, cap, rim, belly);

      // 5 menacing white dorsal spikes!
      const spikeTop = new THREE.Mesh(this.spikeGeo, this.shellWhiteMat);
      spikeTop.position.set(0, 0.5, 0);
      spinner.add(spikeTop);
      for (let s = 0; s < 4; s++) {
        const ang = (s / 4) * Math.PI * 2 + Math.PI * 0.25;
        const sp = new THREE.Mesh(this.spikeGeo, this.shellWhiteMat);
        sp.position.set(Math.cos(ang) * 0.28, 0.34, Math.sin(ang) * 0.28);
        sp.rotation.z = -Math.cos(ang) * 0.55;
        sp.rotation.x = Math.sin(ang) * 0.55;
        spinner.add(sp);
      }

      // Flapping white angel wings on left (+X) & right (-X)
      const wingPivotL = new THREE.Group();
      wingPivotL.position.set(0.42, 0.16, 0);
      const wingMeshL = new THREE.Mesh(this.wingGeo, this.shellWhiteMat);
      wingPivotL.add(wingMeshL);

      const wingPivotR = new THREE.Group();
      wingPivotR.position.set(-0.42, 0.16, 0);
      const wingMeshR = new THREE.Mesh(this.wingGeo, this.shellWhiteMat);
      wingMeshR.scale.x = -1;
      wingPivotR.add(wingMeshR);

      shellBody.add(wingPivotL, wingPivotR);

      const sonicHalo = new THREE.Mesh(this.shellGlowGeo, this.blueGlowMat);
      sonicHalo.scale.setScalar(1.35);
      group.add(sonicHalo);

      return {
        group,
        spinner,
        wingPivotL,
        wingPivotR,
        groundGlow: sonicHalo,
        type,
        phase: Math.random() * Math.PI * 2,
      };
    }

    // Green Shell or Red Shell
    const isRed = type === ITEMS.RED_SHELL;
    const shellMat = isRed ? this.redShellMat : this.greenShellMat;
    const glowMat = isRed ? this.redGlowMat : this.greenGlowMat;

    const spinner = new THREE.Group();
    group.add(spinner);

    const dome = new THREE.Mesh(this.shellDomeGeo, shellMat);
    dome.position.y = 0.1;
    dome.castShadow = true;

    const cap = new THREE.Mesh(this.shellCapGeo, shellMat);
    cap.position.y = 0.33;
    cap.castShadow = true;

    const rim = new THREE.Mesh(this.shellRimGeo, this.shellWhiteMat);
    rim.position.y = -0.04;
    rim.castShadow = true;

    const belly = new THREE.Mesh(this.shellBellyGeo, this.shellBellyMat);
    belly.position.y = -0.14;

    spinner.add(dome, cap, rim, belly);

    const groundGlow = new THREE.Mesh(this.shellGlowGeo, glowMat);
    groundGlow.position.y = -0.3;
    group.add(groundGlow);

    return { group, spinner, groundGlow, type, phase: Math.random() * Math.PI * 2 };
  }

  _createExplosionVisual() {
    const group = new THREE.Group();

    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const outerSphere = new THREE.Mesh(this.shockSphereGeo, outerMat);
    const coreSphere = new THREE.Mesh(this.shockSphereGeo, coreMat);
    const groundRing = new THREE.Mesh(this.shockRingGeo, ringMat);
    groundRing.position.y = 0.08;

    group.add(outerSphere, coreSphere, groundRing);
    return { group, outerSphere, coreSphere, groundRing, outerMat, coreMat, ringMat };
  }

  update(raceState, dt, elapsed) {
    if (raceState?.trackId && raceState.trackId !== this.currentTrackId) {
      this.rebuildForTrack(raceState.trackId);
    }

    // 1. Update `?` Item Boxes
    let activeSet = null;
    if (raceState && Array.isArray(raceState.activeItemBoxes)) {
      activeSet = this._activeBoxSet;
      activeSet.clear();
      for (let i = 0; i < raceState.activeItemBoxes.length; i++) {
        activeSet.add(raceState.activeItemBoxes[i]);
      }
    }

    for (let i = 0; i < this.itemBoxes.length; i++) {
      const box = this.itemBoxes[i];
      const shouldBeActive = activeSet ? activeSet.has(box.id) : true;

      if (shouldBeActive && !box.active) {
        box.active = true;
        box.popTimer = 0.001;
        box.scaleAnim = 0.01;
        box.container.visible = true;
      } else if (!shouldBeActive && box.active) {
        box.active = false;
        box.popTimer = 0;
        if (this._hasSyncedPickups) {
          this._spawnBoxBurst(
            box.container.position.x,
            box.container.position.y + 1.05,
            box.container.position.z
          );
        }
      }

      if (box.active) {
        if (box.popTimer > 0) {
          box.popTimer += dt;
          const p = Math.min(1, box.popTimer / 0.36);
          const c1 = 1.70158;
          const c3 = c1 + 1;
          box.scaleAnim = 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
          if (p >= 1) {
            box.popTimer = 0;
            box.scaleAnim = 1;
          }
        } else {
          box.scaleAnim = 1;
        }
      } else if (box.scaleAnim > 0.01) {
        box.scaleAnim = Math.max(0, box.scaleAnim - dt * 7.5);
        if (box.scaleAnim <= 0.01) {
          box.container.visible = false;
        }
      }

      if (box.container.visible) {
        const bob = Math.sin(elapsed * 3.1 + box.phase) * 0.14;
        box.floatRig.position.y = 1.05 + bob;
        box.floatRig.scale.setScalar(Math.max(0.001, box.scaleAnim));
        box.cubeSpin.rotation.y += dt * 1.75;
        box.cubeSpin.rotation.x = Math.PI * 0.22 + Math.sin(elapsed * 2.1 + box.phase) * 0.12;
        box.groundGlow.scale.setScalar(0.88 + Math.sin(elapsed * 3.1 + box.phase) * 0.12);
      }
    }

    // 1b. Update 3D Collectible Gold Coins
    let activeCoinSet = null;
    if (raceState && Array.isArray(raceState.activeCoins)) {
      activeCoinSet = this._activeCoinSet;
      activeCoinSet.clear();
      for (let i = 0; i < raceState.activeCoins.length; i++) {
        activeCoinSet.add(raceState.activeCoins[i]);
      }
    }
    for (let i = 0; i < this.coins.length; i++) {
      const coin = this.coins[i];
      const visible = activeCoinSet ? activeCoinSet.has(coin.id) : true;
      if (!visible && coin.active && this._hasSyncedPickups) {
        this._spawnCoinBurst(coin.x, coin.baseY, coin.z);
      }
      coin.active = visible;
      coin.mesh.visible = visible;
      if (visible) {
        coin.mesh.rotation.y = elapsed * 3.4 + coin.id * 0.5;
        coin.mesh.position.y = coin.baseY + Math.sin(elapsed * 4.2 + coin.id) * 0.12;
      }
    }
    this._hasSyncedPickups = true;

    // 2. Sync 3D Projectiles
    const projectiles = raceState?.projectiles || [];
    const seenIds = this._seenProjIds;
    seenIds.clear();

    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      if (!p || p.id == null) continue;
      seenIds.add(p.id);

      let vis = this.projectilesMap.get(p.id);
      if (!vis) {
        vis = this._createProjectileVisual(p.type);
        vis.trailTimer = 0;
        this.root.add(vis.group);
        this.projectilesMap.set(p.id, vis);
      }

      vis.group.position.set(p.x || 0, p.y || 0, p.z || 0);

      if (p.type === ITEMS.BANANA) {
        vis.group.rotation.y = p.yaw || 0;
        vis.spinner.rotation.z = Math.sin(elapsed * 4.8 + vis.phase) * 0.08;
        const bounce = 1 + Math.sin(elapsed * 6.2 + vis.phase) * 0.04;
        vis.spinner.scale.set(1, bounce, 1);
      } else if (p.type === ITEMS.BLUE_SHELL || p.type === 'blue_shell') {
        vis.group.rotation.y = p.yaw || 0;
        vis.spinner.rotation.y += dt * 16.0;
        const flap = Math.sin(elapsed * 26 + vis.phase) * 0.52;
        if (vis.wingPivotL) vis.wingPivotL.rotation.z = flap;
        if (vis.wingPivotR) vis.wingPivotR.rotation.z = -flap;
        if (vis.groundGlow) {
          vis.groundGlow.scale.setScalar(1.25 + Math.sin(elapsed * 18) * 0.25);
        }
        vis.trailTimer += dt;
        if (vis.trailTimer >= 0.028) {
          vis.trailTimer = 0;
          this._spawnShellTrail(p.x || 0, (p.y || 0) + 0.45, p.z || 0, p.type);
        }
      } else {
        vis.spinner.rotation.y += dt * 21.0;
        vis.spinner.rotation.x = Math.sin(elapsed * 16 + vis.phase) * 0.07;
        if (vis.groundGlow) {
          vis.groundGlow.scale.setScalar(0.92 + Math.sin(elapsed * 14 + vis.phase) * 0.16);
        }
        if (
          p.type === ITEMS.GREEN_SHELL ||
          p.type === 'green_shell' ||
          p.type === ITEMS.RED_SHELL ||
          p.type === 'red_shell'
        ) {
          vis.trailTimer += dt;
          if (vis.trailTimer >= 0.028) {
            vis.trailTimer = 0;
            this._spawnShellTrail(p.x || 0, (p.y || 0) + 0.36, p.z || 0, p.type);
          }
        }
      }
    }

    for (const [id, vis] of this.projectilesMap.entries()) {
      if (!seenIds.has(id)) {
        this.root.remove(vis.group);
        this.projectilesMap.delete(id);
      }
    }

    // 3. Sync Expanding Blue-Shell Shockwave Explosions (`raceState.explosions`)
    const explosions = raceState?.explosions || [];
    const seenExpIds = this._seenExpIds;
    seenExpIds.clear();

    for (let i = 0; i < explosions.length; i++) {
      const exp = explosions[i];
      if (!exp || exp.id == null) continue;
      seenExpIds.add(exp.id);

      let ev = this.explosionsMap.get(exp.id);
      if (!ev) {
        ev = this._createExplosionVisual();
        this.root.add(ev.group);
        this.explosionsMap.set(exp.id, ev);
      }

      ev.group.position.set(exp.x || 0, exp.y || 0, exp.z || 0);
      const maxT = exp.maxTimer || 0.55;
      const progress = Math.max(0, Math.min(1, 1 - (exp.timer ?? 0) / maxT));
      const easeOut = 1 - Math.pow(1 - progress, 2.4);

      const radius = 0.8 + easeOut * 5.2; // matches 5.5u blast radius!
      ev.outerSphere.scale.setScalar(radius);
      ev.coreSphere.scale.setScalar(Math.max(0.1, (1 - progress) * 2.6));
      ev.groundRing.scale.setScalar(0.9 + easeOut * 6.4);

      ev.outerMat.opacity = (1 - progress) * 0.78;
      ev.coreMat.opacity = Math.max(0, (1 - progress * 1.35) * 0.95);
      ev.ringMat.opacity = (1 - progress) * 0.92;
    }

    for (const [id, ev] of this.explosionsMap.entries()) {
      if (!seenExpIds.has(id)) {
        this.root.remove(ev.group);
        ev.outerMat.dispose();
        ev.coreMat.dispose();
        ev.ringMat.dispose();
        this.explosionsMap.delete(id);
      }
    }

    // 4. Animate Pickup Bursts & Shell Trails (zero per-frame GC)
    let shardDirty = false;
    for (let i = 0; i < this.crystalShards.length; i++) {
      const sh = this.crystalShards[i];
      if (!sh.active) continue;
      shardDirty = true;
      sh.age += dt;
      if (sh.age >= sh.life) {
        sh.active = false;
        this.crystalShardInst.setMatrixAt(i, this._zeroMatrix);
        continue;
      }
      const prog = sh.age / sh.life;
      sh.vy -= 14.5 * dt;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.z += sh.vz * dt;
      sh.rx += dt * 11;
      sh.ry += dt * 14;
      this._dummy.position.set(sh.x, sh.y, sh.z);
      this._dummy.rotation.set(sh.rx, sh.ry, 0);
      this._dummy.scale.setScalar(Math.max(0.01, sh.scale * (1 - prog)));
      this._dummy.updateMatrix();
      this.crystalShardInst.setMatrixAt(i, this._dummy.matrix);
    }
    if (shardDirty) {
      this.crystalShardInst.instanceMatrix.needsUpdate = true;
    }

    for (let i = 0; i < this.coinJumpPool.length; i++) {
      const cj = this.coinJumpPool[i];
      if (!cj.active) continue;
      cj.age += dt;
      if (cj.age >= cj.life) {
        cj.active = false;
        cj.group.visible = false;
        continue;
      }
      const prog = cj.age / cj.life;
      cj.vy -= 18 * dt;
      cj.y += cj.vy * dt;
      cj.group.position.set(cj.x, cj.y, cj.z);
      cj.group.rotation.y += dt * 18;
      cj.group.scale.setScalar(Math.max(0.05, (1 - prog * 0.75) * 1.15));
    }

    let coinSparkDirty = false;
    for (let i = 0; i < this.coinSparks.length; i++) {
      const sp = this.coinSparks[i];
      if (!sp.active) continue;
      coinSparkDirty = true;
      sp.age += dt;
      if (sp.age >= sp.life) {
        sp.active = false;
        this.coinSparkInst.setMatrixAt(i, this._zeroMatrix);
        continue;
      }
      const prog = sp.age / sp.life;
      sp.vy -= 12 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.z += sp.vz * dt;
      this._dummy.position.set(sp.x, sp.y, sp.z);
      this._dummy.rotation.set(elapsed * 8 + i, elapsed * 10, 0);
      this._dummy.scale.setScalar(Math.max(0.01, 1 - prog));
      this._dummy.updateMatrix();
      this.coinSparkInst.setMatrixAt(i, this._dummy.matrix);
    }
    if (coinSparkDirty) {
      this.coinSparkInst.instanceMatrix.needsUpdate = true;
    }

    let trailDirty = false;
    for (let i = 0; i < this.shellTrails.length; i++) {
      const tr = this.shellTrails[i];
      if (!tr.active) continue;
      trailDirty = true;
      tr.age += dt;
      if (tr.age >= tr.life) {
        tr.active = false;
        this.shellTrailInst.setMatrixAt(i, this._zeroMatrix);
        continue;
      }
      const prog = tr.age / tr.life;
      tr.y += tr.vy * dt;
      this._dummy.position.set(tr.x, tr.y, tr.z);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.scale.setScalar(Math.max(0.02, tr.baseScale * (1 - prog)));
      this._dummy.updateMatrix();
      this.shellTrailInst.setMatrixAt(i, this._dummy.matrix);
    }
    if (trailDirty) {
      this.shellTrailInst.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.clearTransientFX();
    this.scene.remove(this.root);
    for (const d of this.disposables) {
      if (d && typeof d.dispose === 'function') d.dispose();
    }
    for (const t of this.textures) {
      if (t && typeof t.dispose === 'function') t.dispose();
    }
  }
}
