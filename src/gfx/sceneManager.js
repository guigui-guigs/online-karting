import * as THREE from 'three';
import { RACERS } from '../shared/constants.js';
import { getTrackSample, getTrackMeta, projectOnTrack, TRACK_LENGTH } from '../shared/trackData.js';
import { buildTrackWorld } from './trackBuilder.js';
import {
  createKartVisual,
  updateKartVisual,
  setKartRacerTheme,
  disposeKartVisual,
  KartVisualManager,
} from './kartFactory.js';
import { ItemVisualManager } from './itemVisuals.js';

function wrap01(t) {
  const r = t % 1;
  return r < 0 ? r + 1 : r;
}

function angleDiff(current, target) {
  let diff = (target - current + Math.PI) % (Math.PI * 2);
  if (diff < 0) diff += Math.PI * 2;
  return diff - Math.PI;
}

function lerpAngle(current, target, alpha) {
  return current + angleDiff(current, target) * alpha;
}

export class SceneManager {
  constructor(containerEl) {
    this.container = containerEl;
    this.elapsed = 0;
    this.showcaseRacerId = RACERS[0]?.id || 'red';
    this.showcaseTrackId = 'coco';
    this.activeTrackId = null;

    const width = Math.max(1, containerEl?.clientWidth || window.innerWidth || 800);
    const height = Math.max(1, containerEl?.clientHeight || window.innerHeight || 600);

    // 1. Scene & Atmosphere
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x5ed2ff);
    this.scene.fog = new THREE.FogExp2(0x9be7ff, 0.0011);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(62, width / height, 0.35, 1300);
    this.currentFov = 62;

    // 3. Mobile-Optimized High-Perf WebGLRenderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    if (containerEl) {
      containerEl.appendChild(canvas);
    }

    // 4. Dynamic Multi-Track Lighting
    this.hemiLight = new THREE.HemisphereLight(0x8be9ff, 0xffe28a, 1.1);
    this.scene.add(this.hemiLight);

    this.sunOffset = new THREE.Vector3(44, 72, -38);
    this.sunLight = new THREE.DirectionalLight(0xfff5d6, 1.9);
    this.sunLight.position.copy(this.sunOffset);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 165;
    const frustum = 38;
    this.sunLight.shadow.camera.left = -frustum;
    this.sunLight.shadow.camera.right = frustum;
    this.sunLight.shadow.camera.top = frustum;
    this.sunLight.shadow.camera.bottom = -frustum;
    this.sunLight.shadow.bias = -0.0006;
    this.sunLight.shadow.normalBias = 0.035;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.rimLight = new THREE.DirectionalLight(0x56dcff, 0.42);
    this.rimLight.position.set(-50, 28, 45);
    this.scene.add(this.rimLight);

    // 5. Managers & Showcase / Ghost Karts
    this.trackWorld = null;
    this.itemManager = new ItemVisualManager(this.scene, 'coco');
    this.kartManager = new KartVisualManager(this.scene);

    this.showcaseKart = createKartVisual(this.showcaseRacerId, { showNameplate: false });
    this.scene.add(this.showcaseKart.root);

    this.ghostKart = null;
    this.ghostPose = null;

    this.heroSample = getTrackSample(0, 'coco');
    this._ensureTrackWorld('coco');

    // Spring Chase Camera + Screen Shake + Photo-Finish state
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.renderCamPos = new THREE.Vector3();
    this.camYaw = this.heroSample.yaw;
    this.driftPeek = 0;
    this.cornerBlend = 0;
    this.finishOrbitAngle = 0;
    this.finishElapsed = 0;
    this.photoAnchor = new THREE.Vector3();
    this.photoAnchorSet = false;
    this.camInitialized = false;
    this.lastPhase = null;

    // Trauma-based camera shake tracking
    this.shakeTrauma = 0;
    this._seenExplosionIds = new Set();
    this._prevSpinTimer = 0;
    this._prevShrinkTimer = 0;
    this._prevBoostTimer = 0;

    // Responsive Resize handling
    this._onResize = () => this._handleResize();
    window.addEventListener('resize', this._onResize);
    if (typeof ResizeObserver !== 'undefined' && containerEl) {
      this._resizeObserver = new ResizeObserver(() => this._handleResize());
      this._resizeObserver.observe(containerEl);
    }

    this.update(null, null, 1 / 60);
  }

  _handleResize() {
    if (!this.renderer) return;
    const width = Math.max(1, this.container?.clientWidth || window.innerWidth || 800);
    const height = Math.max(1, this.container?.clientHeight || window.innerHeight || 600);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
  }

  _applyTrackAtmosphere(trackId) {
    if (trackId === 'neon') {
      this.scene.background.setHex(0x060318);
      this.scene.fog.color.setHex(0x160836);
      this.scene.fog.density = 0.00125;
      this.hemiLight.color.setHex(0x8338ec);
      this.hemiLight.groundColor.setHex(0x00bbf9);
      this.hemiLight.intensity = 0.9;
      this.sunLight.color.setHex(0xe0f2fe);
      this.sunLight.intensity = 1.35;
      this.rimLight.color.setHex(0xf72585);
      this.rimLight.intensity = 0.72;
      this.renderer.toneMappingExposure = 1.18;
    } else if (trackId === 'rainbow') {
      this.scene.background.setHex(0x050216);
      this.scene.fog.color.setHex(0x1b0b42);
      this.scene.fog.density = 0.00075;
      this.hemiLight.color.setHex(0xa5f3fc);
      this.hemiLight.groundColor.setHex(0xf72585);
      this.hemiLight.intensity = 1.05;
      this.sunLight.color.setHex(0xfffbeb);
      this.sunLight.intensity = 1.65;
      this.rimLight.color.setHex(0x00f5d4);
      this.rimLight.intensity = 0.6;
      this.renderer.toneMappingExposure = 1.15;
    } else {
      // 'coco' Sunny tropical island
      this.scene.background.setHex(0x5ed2ff);
      this.scene.fog.color.setHex(0x9be7ff);
      this.scene.fog.density = 0.0011;
      this.hemiLight.color.setHex(0x8be9ff);
      this.hemiLight.groundColor.setHex(0xffe28a);
      this.hemiLight.intensity = 1.1;
      this.sunLight.color.setHex(0xfff5d6);
      this.sunLight.intensity = 1.9;
      this.rimLight.color.setHex(0x56dcff);
      this.rimLight.intensity = 0.42;
      this.renderer.toneMappingExposure = 1.1;
    }
  }

  _ensureTrackWorld(trackId = 'coco') {
    const validId = trackId || 'coco';
    if (this.activeTrackId === validId && this.trackWorld) return;

    if (this.trackWorld) {
      this.trackWorld.dispose();
      this.trackWorld = null;
    }

    this.activeTrackId = validId;
    this._applyTrackAtmosphere(validId);
    this.trackWorld = buildTrackWorld(this.scene, validId);
    this.itemManager.rebuildForTrack(validId);

    const meta = typeof getTrackMeta === 'function' ? getTrackMeta(validId) : null;
    const trackLen = meta?.length || TRACK_LENGTH || 600;
    const heroT = 1 - 5.2 / trackLen;
    this.heroSample = getTrackSample(heroT, validId);

    if (this.showcaseKart) {
      this.showcaseKart.root.position.set(
        this.heroSample.x,
        this.heroSample.y,
        this.heroSample.z
      );
      this.showcaseKart.root.rotation.y = this.heroSample.yaw;
    }

    this.camInitialized = false;
  }

  setShowcaseRacer(racerId) {
    if (!racerId) return;
    this.showcaseRacerId = racerId;
    if (this.showcaseKart) {
      setKartRacerTheme(this.showcaseKart, racerId);
      this.showcaseKart.squashAmp = 0.16;
      this.showcaseKart.squashPhase = 0;
    }
  }

  setShowcaseTrack(trackId) {
    if (!trackId) return;
    this.showcaseTrackId = trackId;
    if (!this.lastPhase || this.lastPhase === 'home' || this.lastPhase === 'lobby') {
      this._ensureTrackWorld(trackId);
    }
  }

  setGhostState(ghostPoseOrNull) {
    this.ghostPose = ghostPoseOrNull || null;
    if (!this.ghostPose) {
      if (this.ghostKart) {
        this.ghostKart.root.visible = false;
      }
      return;
    }

    if (!this.ghostKart) {
      const rawName = this.ghostPose.name || 'Fantôme';
      const label = rawName.startsWith('👻') ? rawName : `👻 ${rawName}`;
      this.ghostKart = createKartVisual(this.ghostPose.racerId || 'aqua', {
        isGhost: true,
        showNameplate: true,
        name: label,
      });
      this.scene.add(this.ghostKart.root);
    }
    this.ghostKart.root.visible = true;
  }

  triggerShake(intensity = 0.5) {
    this.shakeTrauma = Math.min(1.0, this.shakeTrauma + Math.max(0, intensity));
  }

  _updateShadowCenter(focusX, focusY, focusZ) {
    const sx = Math.round(focusX * 0.5) * 2;
    const sy = Math.round(focusY * 0.5) * 2;
    const sz = Math.round(focusZ * 0.5) * 2;
    this.sunLight.target.position.set(sx, sy, sz);
    this.sunLight.position.set(
      sx + this.sunOffset.x,
      sy + this.sunOffset.y,
      sz + this.sunOffset.z
    );
  }

  _setSmoothFov(targetFov, dt) {
    this.currentFov = THREE.MathUtils.lerp(
      this.currentFov,
      targetFov,
      1 - Math.exp(-8.5 * dt)
    );
    if (Math.abs(this.camera.fov - this.currentFov) > 0.02) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }
  }

  _detectCameraShakeEvents(raceState, focusKart) {
    if (!raceState || !focusKart) return;

    // 1. Nearby Blue-Shell explosions
    const explosions = raceState.explosions || [];
    const currentExpIds = new Set();
    for (let i = 0; i < explosions.length; i++) {
      const exp = explosions[i];
      if (!exp || exp.id == null) continue;
      currentExpIds.add(exp.id);
      if (!this._seenExplosionIds.has(exp.id)) {
        const dist = Math.hypot((exp.x || 0) - focusKart.x, (exp.z || 0) - focusKart.z);
        if (dist < 45) {
          this.triggerShake(Math.max(0.28, (1 - dist / 45) * 0.95));
        }
      }
    }
    this._seenExplosionIds = currentExpIds;

    // 2. Hit / Spinout impact
    const spin = focusKart.spinoutTimer || 0;
    if (spin > this._prevSpinTimer + 0.15) {
      this.triggerShake(0.68);
    }
    this._prevSpinTimer = spin;

    // 3. Lightning strike
    const shrink = focusKart.shrinkTimer || 0;
    if (shrink > this._prevShrinkTimer + 0.5) {
      this.triggerShake(0.55);
    }
    this._prevShrinkTimer = shrink;

    // 4. Rocket Start / Boost burst
    const boost = focusKart.boostTimer || 0;
    if (boost > this._prevBoostTimer + 0.25) {
      this.triggerShake(0.28);
    }
    this._prevBoostTimer = boost;
  }

  update(raceState, localId, dt = 1 / 60) {
    if (!this.renderer) return;

    const safeDt = Math.min(Math.max(Number(dt) || 1 / 60, 0.0005), 0.1);
    this.elapsed += safeDt;

    const desiredTrackId = raceState?.trackId || this.showcaseTrackId || 'coco';
    this._ensureTrackWorld(desiredTrackId);

    const effectiveLocalId = localId ?? raceState?.localId ?? null;
    const phase = raceState?.phase || 'home';

    // 1. Animate active 3D track world & items/explosions
    this.trackWorld.update(safeDt, this.elapsed);
    this.itemManager.update(raceState, safeDt, this.elapsed);

    // 2. Update Holographic Ghost Kart if active
    if (this.ghostPose && this.ghostKart && (phase === 'countdown' || phase === 'racing' || phase === 'finished')) {
      const rawName = this.ghostPose.name || 'Fantôme';
      const label = rawName.startsWith('👻') ? rawName : `👻 ${rawName}`;
      this.ghostKart.root.visible = true;
      updateKartVisual(
        this.ghostKart,
        {
          x: this.ghostPose.x,
          y: this.ghostPose.y,
          z: this.ghostPose.z,
          yaw: this.ghostPose.yaw,
          racerId: this.ghostPose.racerId,
          name: label,
          speed: 38,
        },
        safeDt,
        this.elapsed,
        false,
        desiredTrackId
      );
    } else if (this.ghostKart) {
      this.ghostKart.root.visible = false;
    }

    // 3. Home & Lobby Showcase Camera
    if (!raceState || phase === 'lobby') {
      this._setSmoothFov(58, safeDt);
      this.shakeTrauma = 0;
      this.finishElapsed = 0;
      this.photoAnchorSet = false;

      if (!raceState) {
        this.kartManager.setVisible(false);
        this.showcaseKart.root.visible = true;

        updateKartVisual(
          this.showcaseKart,
          {
            racerId: this.showcaseRacerId,
            x: this.heroSample.x,
            y: this.heroSample.y,
            z: this.heroSample.z,
            yaw: this.heroSample.yaw,
            speed: 0,
            steer: Math.sin(this.elapsed * 1.4) * 0.45,
          },
          safeDt,
          this.elapsed,
          true,
          desiredTrackId
        );

        const orbitAngle =
          this.heroSample.yaw + Math.PI + Math.sin(this.elapsed * 0.38) * 1.05 + 0.38;
        const radius = this.camera.aspect < 0.85 ? 6.6 : 5.3;
        this.camPos.set(
          this.heroSample.x + Math.sin(orbitAngle) * radius,
          this.heroSample.y + 2.05 + Math.sin(this.elapsed * 0.55) * 0.28,
          this.heroSample.z + Math.cos(orbitAngle) * radius
        );
        this.camLook.set(
          this.heroSample.x,
          this.heroSample.y + 1.15,
          this.heroSample.z + Math.cos(this.heroSample.yaw) * 1.4
        );

        this.camera.position.copy(this.camPos);
        this.camera.lookAt(this.camLook);
        this._updateShadowCenter(this.heroSample.x, this.heroSample.y, this.heroSample.z);
      } else {
        this.showcaseKart.root.visible = false;
        this.kartManager.sync(
          raceState.karts,
          effectiveLocalId,
          safeDt,
          this.elapsed,
          desiredTrackId
        );

        const meta = typeof getTrackMeta === 'function' ? getTrackMeta(desiredTrackId) : null;
        const trackLen = meta?.length || TRACK_LENGTH || 600;
        const gridT = 1 - 11.5 / trackLen;
        const gridSample = getTrackSample(gridT, desiredTrackId);
        const orbitAngle = gridSample.yaw + Math.PI + Math.sin(this.elapsed * 0.32) * 0.78;
        const radius = this.camera.aspect < 0.85 ? 13.5 : 10.8;
        const targetPos = new THREE.Vector3(
          gridSample.x + Math.sin(orbitAngle) * radius,
          gridSample.y + 4.4,
          gridSample.z + Math.cos(orbitAngle) * radius
        );
        const targetLook = new THREE.Vector3(
          this.heroSample.x,
          this.heroSample.y + 1.4,
          this.heroSample.z
        );

        const smooth = 1 - Math.exp(-5 * safeDt);
        this.camPos.lerp(targetPos, smooth);
        this.camLook.lerp(targetLook, smooth);
        this.camera.position.copy(this.camPos);
        this.camera.lookAt(this.camLook);
        this._updateShadowCenter(gridSample.x, gridSample.y, gridSample.z);
      }

      this.camInitialized = false;
      this.lastPhase = phase;
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // 4. Race Phases ('countdown' | 'racing' | 'finished')
    this.showcaseKart.root.visible = false;
    this.kartManager.sync(
      raceState.karts,
      effectiveLocalId,
      safeDt,
      this.elapsed,
      desiredTrackId
    );

    const karts = raceState.karts || [];
    const focusKart = karts.find((k) => k.id === effectiveLocalId) || karts[0];

    if (focusKart) {
      const kx = focusKart.x || 0;
      const ky = focusKart.y || 0;
      const kz = focusKart.z || 0;
      const kyaw = focusKart.yaw || 0;

      if (!this.camInitialized || (this.lastPhase === 'lobby' && phase === 'countdown')) {
        this.camYaw = kyaw;
        this.driftPeek = 0;
        this.cornerBlend = 0;
        this.finishElapsed = 0;
        this.photoAnchorSet = false;
        this._prevSpinTimer = 0;
        this._prevShrinkTimer = 0;
        this._prevBoostTimer = 0;
        const initBack = 6.5;
        this.camPos.set(
          kx - Math.sin(kyaw) * initBack,
          ky + 2.9,
          kz - Math.cos(kyaw) * initBack
        );
        this.camLook.set(kx + Math.sin(kyaw) * 3.5, ky + 1.05, kz + Math.cos(kyaw) * 3.5);
        this.camInitialized = true;
      }

      this._detectCameraShakeEvents(raceState, focusKart);
      this.shakeTrauma = Math.max(0, this.shakeTrauma - safeDt * 2.2);

      const kartFinished = Boolean(focusKart.finished) || phase === 'finished';

      if (kartFinished) {
        this.finishElapsed += safeDt;

        if (!this.photoAnchorSet) {
          this.photoAnchorSet = true;
          const fx = Math.sin(kyaw);
          const fz = Math.cos(kyaw);
          const rx = -fz;
          const rz = fx;
          // Dramatic low-angle trackside Photo-Finish camera just ahead & right of finish line!
          this.photoAnchor.set(
            kx + fx * 6.2 + rx * 3.8,
            ky + 1.25,
            kz + fz * 6.2 + rz * 3.8
          );
          this.finishOrbitAngle = kyaw + 0.55;
        }

        if (this.finishElapsed < 1.55) {
          // PHOTO-FINISH HERO SHOT watching the kart blast across the line!
          this._setSmoothFov(54, safeDt);
          const alpha = 1 - Math.exp(-9.0 * safeDt);
          this.camPos.lerp(this.photoAnchor, alpha);
          this.camLook.lerp(new THREE.Vector3(kx, ky + 0.85, kz), 1 - Math.exp(-16 * safeDt));
        } else {
          // Smoothly transition into sweeping 360° Podium Orbit!
          this._setSmoothFov(58, safeDt);
          this.finishOrbitAngle += safeDt * 0.78;
          const orbitDist = this.camera.aspect < 0.85 ? 6.6 : 5.4;
          const desiredPos = new THREE.Vector3(
            kx + Math.sin(this.finishOrbitAngle) * orbitDist,
            ky + 2.25 + Math.sin(this.elapsed * 1.2) * 0.2,
            kz + Math.cos(this.finishOrbitAngle) * orbitDist
          );
          const desiredLook = new THREE.Vector3(kx, ky + 0.95, kz);

          const alpha = 1 - Math.exp(-5.5 * safeDt);
          this.camPos.lerp(desiredPos, alpha);
          this.camLook.lerp(desiredLook, alpha);
        }
      } else {
        this.finishElapsed = 0;
        this.photoAnchorSet = false;

        // MARIO-KART SPRING CHASE CAMERA WITH V3 CORNER LOOK-AHEAD ('countdown' & 'racing')
        const isBoosting = (focusKart.boostTimer || 0) > 0 || (focusKart.starTimer || 0) > 0;
        this._setSmoothFov(isBoosting ? 74 : 62, safeDt);

        const proj =
          typeof projectOnTrack === 'function'
            ? projectOnTrack(kx, kz, desiredTrackId)
            : null;
        const lookAheadSample = proj
          ? getTrackSample(wrap01(proj.t + 0.036), desiredTrackId)
          : null;

        const headingOk =
          phase === 'racing' &&
          !focusKart.wrongWay &&
          proj &&
          Math.abs(angleDiff(kyaw, proj.sample.yaw)) < 1.75;
        this.cornerBlend = THREE.MathUtils.lerp(
          this.cornerBlend,
          headingOk ? 1.0 : 0.0,
          1 - Math.exp(-6.0 * safeDt)
        );

        const targetCamYaw =
          lookAheadSample && this.cornerBlend > 0.001
            ? lerpAngle(kyaw, lookAheadSample.yaw, 0.16 * this.cornerBlend)
            : kyaw;

        const yawStiffness = phase === 'countdown' ? 6.5 : 10.5;
        this.camYaw = lerpAngle(this.camYaw, targetCamYaw, 1 - Math.exp(-yawStiffness * safeDt));

        const targetPeek = focusKart.drifting ? (focusKart.driftDir || 0) * 1.15 : 0;
        this.driftPeek = THREE.MathUtils.lerp(
          this.driftPeek,
          targetPeek,
          1 - Math.exp(-6.5 * safeDt)
        );

        const fx = Math.sin(this.camYaw);
        const fz = Math.cos(this.camYaw);
        const rx = -fz;
        const rz = fx;

        const isPortrait = this.camera.aspect < 0.85;
        let chaseDist = isPortrait ? 7.35 : 6.15;
        let chaseHeight = isPortrait ? 3.2 : 2.72;

        let countdownSideOffset = 0;
        if (phase === 'countdown') {
          const cd = Math.max(0, Math.min(3, raceState.countdown || 0));
          const sweep = Math.max(0, (cd - 1) / 2);
          countdownSideOffset = sweep * 2.4;
          chaseHeight += sweep * 0.75;
          chaseDist += sweep * 0.9;
        }

        const desiredCamX =
          kx - fx * chaseDist + rx * (-this.driftPeek * 0.35 + countdownSideOffset);
        const desiredCamY = ky + chaseHeight;
        const desiredCamZ =
          kz - fz * chaseDist + rz * (-this.driftPeek * 0.35 + countdownSideOffset);

        // Blend ~28% of (lookAhead.x, lookAhead.z) direction into camLook so upcoming turns open naturally!
        let lookDirX = fx;
        let lookDirZ = fz;
        let elevPeek = 0;
        if (lookAheadSample && this.cornerBlend > 0.001) {
          const dx = lookAheadSample.x - kx;
          const dz = lookAheadSample.z - kz;
          const dLen = Math.hypot(dx, dz) || 1;
          const lax = dx / dLen;
          const laz = dz / dLen;
          const w = 0.28 * this.cornerBlend;
          lookDirX = fx * (1 - w) + lax * w;
          lookDirZ = fz * (1 - w) + laz * w;
          const norm = Math.hypot(lookDirX, lookDirZ) || 1;
          lookDirX /= norm;
          lookDirZ /= norm;
          elevPeek = THREE.MathUtils.clamp((lookAheadSample.y - ky) * 0.22, -0.6, 0.8) * this.cornerBlend;
        }

        const lookAhead = 4.1;
        const desiredLookX = kx + lookDirX * lookAhead + rx * (this.driftPeek * 0.95);
        const desiredLookY = ky + 1.05 + (focusKart.hopOffset || 0) * 0.35 + elevPeek;
        const desiredLookZ = kz + lookDirZ * lookAhead + rz * (this.driftPeek * 0.95);

        const posAlpha = 1 - Math.exp(-15.0 * safeDt);
        const yAlpha = 1 - Math.exp(-10.0 * safeDt);
        this.camPos.x = THREE.MathUtils.lerp(this.camPos.x, desiredCamX, posAlpha);
        this.camPos.y = THREE.MathUtils.lerp(this.camPos.y, desiredCamY, yAlpha);
        this.camPos.z = THREE.MathUtils.lerp(this.camPos.z, desiredCamZ, posAlpha);

        this.camLook.x = THREE.MathUtils.lerp(this.camLook.x, desiredLookX, posAlpha);
        this.camLook.y = THREE.MathUtils.lerp(this.camLook.y, desiredLookY, yAlpha);
        this.camLook.z = THREE.MathUtils.lerp(this.camLook.z, desiredLookZ, posAlpha);
      }

      // Apply organic camera screen shake
      this.renderCamPos.copy(this.camPos);
      if (this.shakeTrauma > 0.005) {
        const mag = this.shakeTrauma * this.shakeTrauma * 0.45;
        this.renderCamPos.x += Math.sin(this.elapsed * 67.3) * mag;
        this.renderCamPos.y += Math.cos(this.elapsed * 79.1) * mag * 0.8;
        this.renderCamPos.z += Math.sin(this.elapsed * 53.7 + 1.4) * mag;
      }

      this.camera.position.copy(this.renderCamPos);
      this.camera.lookAt(this.camLook);
      this._updateShadowCenter(kx, ky, kz);
    }

    this.lastPhase = phase;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    if (this.showcaseKart) {
      this.scene.remove(this.showcaseKart.root);
      disposeKartVisual(this.showcaseKart);
      this.showcaseKart = null;
    }

    if (this.ghostKart) {
      this.scene.remove(this.ghostKart.root);
      disposeKartVisual(this.ghostKart);
      this.ghostKart = null;
    }

    if (this.kartManager) {
      this.kartManager.dispose();
      this.kartManager = null;
    }

    if (this.itemManager) {
      this.itemManager.dispose();
      this.itemManager = null;
    }

    if (this.trackWorld) {
      this.trackWorld.dispose();
      this.trackWorld = null;
    }

    if (this.renderer) {
      const dom = this.renderer.domElement;
      if (dom && dom.parentNode) {
        dom.parentNode.removeChild(dom);
      }
      this.renderer.dispose();
      this.renderer = null;
    }
  }
}
