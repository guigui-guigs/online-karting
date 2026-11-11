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

    this.disposables = [];
    this.textures = [];

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
    this.projectilesMap = new Map();
    this.explosionsMap = new Map();
    this.currentTrackId = null;

    this.rebuildForTrack(initialTrackId);
  }

  rebuildForTrack(trackId = 'coco') {
    if (this.currentTrackId === trackId && this.itemBoxes.length > 0) return;
    this.currentTrackId = trackId;

    // Clear old item box instances
    while (this.boxesGroup.children.length > 0) {
      this.boxesGroup.remove(this.boxesGroup.children[0]);
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
      activeSet = new Set(raceState.activeItemBoxes);
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

    // 2. Sync 3D Projectiles
    const projectiles = raceState?.projectiles || [];
    const seenIds = new Set();

    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      if (!p || p.id == null) continue;
      seenIds.add(p.id);

      let vis = this.projectilesMap.get(p.id);
      if (!vis) {
        vis = this._createProjectileVisual(p.type);
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
      } else {
        vis.spinner.rotation.y += dt * 21.0;
        vis.spinner.rotation.x = Math.sin(elapsed * 16 + vis.phase) * 0.07;
        if (vis.groundGlow) {
          vis.groundGlow.scale.setScalar(0.92 + Math.sin(elapsed * 14 + vis.phase) * 0.16);
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
    const seenExpIds = new Set();

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
