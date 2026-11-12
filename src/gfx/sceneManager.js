import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RACERS } from '../shared/constants.js';
import {
  getTrackSample,
  getTrackMeta,
  projectOnTrack,
  TRACK_LENGTH,
  getBaseTrackId,
  isArenaTrack,
  ARENA_DATA,
} from '../shared/trackData.js';
import { buildTrackWorld } from './trackBuilder.js';
import {
  createKartVisual,
  updateKartVisual,
  setKartRacerTheme,
  disposeKartVisual,
  KartVisualManager,
} from './kartFactory.js';
import { ItemVisualManager } from './itemVisuals.js';
import { PostProcessingPipeline } from './postProcessing.js';
import { PodiumAndPaddockStage } from './podiumAndPaddockStage.js';

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
    this.showcaseKartId = 'classic';
    this.showcaseBoostColorId = 'flame';
    this.showcaseTrackId = 'coco';
    this.activeTrackId = null;

    const width = Math.max(1, containerEl?.clientWidth || window.innerWidth || 800);
    const height = Math.max(1, containerEl?.clientHeight || window.innerHeight || 600);
    const initialPr = Math.min(window.devicePixelRatio || 1, 2);
    this._isMobile =
      typeof window !== 'undefined' &&
      (Boolean(window.matchMedia?.('(pointer: coarse)')?.matches) ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') ||
        Math.min(window.innerWidth || 1280, window.innerHeight || 720) < 768);
    this._shadowFrameToggle = false;

    // 1. Scene & Atmosphere
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x5ed2ff);
    this.scene.fog = new THREE.FogExp2(0x9be7ff, 0.0011);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(62, width / height, 0.35, 1300);
    this.currentFov = 62;

    // 3. Mobile-Optimized High-Perf WebGLRenderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this._isMobile,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(initialPr);
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this._isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    if (containerEl) {
      containerEl.appendChild(canvas);
    }

    // 3b. Studio PBR RoomEnvironment via PMREMGenerator
    this._pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this._pmremGenerator.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    this._envRenderTarget = this._pmremGenerator.fromScene(roomEnv, 0.04);
    this.scene.environment = this._envRenderTarget.texture;
    if (typeof this.scene.environmentIntensity === 'number') {
      this.scene.environmentIntensity = 0.55;
    }
    roomEnv.dispose();
    this._pmremGenerator.dispose();
    this._pmremGenerator = null;

    // 3c. Post-Processing Pipeline (HalfFloat MSAA + Bloom + SpeedFX + OutputPass)
    this.postProcessing = new PostProcessingPipeline(this.renderer, {
      width,
      height,
      pixelRatio: initialPr,
      initialTier: 'auto',
      onTierChange: (resolvedTier) => this._applyShadowQuality(resolvedTier),
    });

    // 4. Dynamic Multi-Track Lighting
    this.hemiLight = new THREE.HemisphereLight(0x8be9ff, 0xffe28a, 1.1);
    this.scene.add(this.hemiLight);

    this.sunOffset = new THREE.Vector3(44, 72, -38);
    this.sunLight = new THREE.DirectionalLight(0xfff5d6, 1.9);
    this.sunLight.position.copy(this.sunOffset);
    this.sunLight.castShadow = true;
    const initialShadowSize = this._isMobile ? 512 : 1024;
    this.sunLight.shadow.mapSize.set(initialShadowSize, initialShadowSize);
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
    this._applyShadowQuality(this.postProcessing.getResolvedTier());

    this.rimLight = new THREE.DirectionalLight(0x56dcff, 0.42);
    this.rimLight.position.set(-50, 28, 45);
    this.scene.add(this.rimLight);

    // 5. Managers, Paddock/Podium Stage & Showcase / Ghost Karts
    this.trackWorld = null;
    this.itemManager = new ItemVisualManager(this.scene, 'coco');
    this.kartManager = new KartVisualManager(this.scene);
    this.stage = new PodiumAndPaddockStage(this.scene);

    this.showcaseKart = createKartVisual(this.showcaseRacerId, {
      showNameplate: false,
      kartId: this.showcaseKartId,
      boostColorId: this.showcaseBoostColorId,
    });
    this.scene.add(this.showcaseKart.root);

    this.ghostKart = null;
    this.ghostPose = null;

    this.heroSample = getTrackSample(0, 'coco');
    this._ensureTrackWorld('coco');

    // Spring Chase Camera + Screen Shake + Photo-Finish state + Pre-allocated scratch vectors
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.renderCamPos = new THREE.Vector3();
    this._tmpTargetPos = new THREE.Vector3();
    this._tmpTargetLook = new THREE.Vector3();
    this._fxParams = {
      dt: 1 / 60,
      elapsed: 0,
      speedRatio: 0,
      boosting: false,
      starActive: false,
      shrinking: false,
      vignetteBase: 0,
      trackId: 'coco',
    };
    this.camYaw = this.heroSample.yaw;
    this.driftPeek = 0;
    this.cornerBlend = 0;
    this.finishOrbitAngle = 0;
    this.finishElapsed = 0;
    this.photoAnchor = new THREE.Vector3();
    this.photoAnchorSet = false;
    this._inFinishOrbit = false;
    this.camInitialized = false;
    this.lastPhase = null;
    this.menuViewMode = 'paddock'; // 'paddock' | 'track_preview'
    this.userOrbitOffset = 0;
    this.lastOrbitInteractAt = 0;
    this.previewProgress = 0.08;
    this.lastPreviewScrubAt = 0;
    this._menuCamInitialized = false;

    // Trauma-based camera shake & event impulse tracking
    this.shakeTrauma = 0;
    this._seenExplosionIds = new Set();
    this._nextExplosionIds = new Set();
    this._prevSpinTimer = 0;
    this._prevShrinkTimer = 0;
    this._prevBoostTimer = 0;
    this._lastEventFxAt = {
      boost: -99,
      hit: -99,
      explosion: -99,
      lightning: -99,
    };

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
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.postProcessing) {
      this.postProcessing.setSize(width, height, pr);
    } else {
      this.renderer.setPixelRatio(pr);
      this.renderer.setSize(width, height);
    }
  }

  _applyShadowQuality(resolvedTier = 'balanced') {
    if (!this.renderer || !this.sunLight) return;

    if (resolvedTier === 'low') {
      this.renderer.shadowMap.enabled = false;
      this.renderer.shadowMap.autoUpdate = false;
      this.sunLight.castShadow = false;
      this.renderer.shadowMap.needsUpdate = true;
      return;
    }

    const isMobileBalanced = this._isMobile && resolvedTier === 'balanced';
    const targetShadowType = isMobileBalanced ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    const targetSize = isMobileBalanced ? 512 : 1024;

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = targetShadowType;
    this.renderer.shadowMap.autoUpdate = !isMobileBalanced;
    this.sunLight.castShadow = true;

    if (this.sunLight.shadow.mapSize.x !== targetSize || this.sunLight.shadow.mapSize.y !== targetSize) {
      this.sunLight.shadow.mapSize.set(targetSize, targetSize);
      if (this.sunLight.shadow.map) {
        this.sunLight.shadow.map.dispose();
        this.sunLight.shadow.map = null;
      }
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  _applyTrackAtmosphere(trackId) {
    const baseId = getBaseTrackId(trackId);
    if (baseId === 'neon') {
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
    } else if (baseId === 'polar') {
      this.scene.background.setHex(0x0c3559);
      this.scene.fog.color.setHex(0x38bdf8);
      this.scene.fog.density = 0.0011;
      this.hemiLight.color.setHex(0xbae6fd);
      this.hemiLight.groundColor.setHex(0xe0f2fe);
      this.hemiLight.intensity = 1.15;
      this.sunLight.color.setHex(0xf0f9ff);
      this.sunLight.intensity = 1.7;
      this.rimLight.color.setHex(0x22d3ee);
      this.rimLight.intensity = 0.55;
      this.renderer.toneMappingExposure = 1.12;
    } else if (baseId === 'pinball') {
      this.scene.background.setHex(0x120329);
      this.scene.fog.color.setHex(0x2d0c59);
      this.scene.fog.density = 0.001;
      this.hemiLight.color.setHex(0xc084fc);
      this.hemiLight.groundColor.setHex(0xfacc15);
      this.hemiLight.intensity = 1.05;
      this.sunLight.color.setHex(0xfef08a);
      this.sunLight.intensity = 1.65;
      this.rimLight.color.setHex(0xf43f5e);
      this.rimLight.intensity = 0.75;
      this.renderer.toneMappingExposure = 1.16;
    } else if (baseId === 'volcano') {
      this.scene.background.setHex(0x1a0605);
      this.scene.fog.color.setHex(0x7c2d12);
      this.scene.fog.density = 0.0012;
      this.hemiLight.color.setHex(0xfb923c);
      this.hemiLight.groundColor.setHex(0xef4444);
      this.hemiLight.intensity = 0.95;
      this.sunLight.color.setHex(0xffedd5);
      this.sunLight.intensity = 1.55;
      this.rimLight.color.setHex(0xf97316);
      this.rimLight.intensity = 0.85;
      this.renderer.toneMappingExposure = 1.14;
    } else if (baseId === 'arena') {
      this.scene.background.setHex(0x09051c);
      this.scene.fog.color.setHex(0x1e1b4b);
      this.scene.fog.density = 0.0009;
      this.hemiLight.color.setHex(0x93c5fd);
      this.hemiLight.groundColor.setHex(0xf43f5e);
      this.hemiLight.intensity = 1.15;
      this.sunLight.color.setHex(0xffffff);
      this.sunLight.intensity = 1.75;
      this.rimLight.color.setHex(0x00f5d4);
      this.rimLight.intensity = 0.65;
      this.renderer.toneMappingExposure = 1.16;
    } else if (baseId === 'rainbow') {
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

    if (isArenaTrack(validId)) {
      this.heroSample = { x: 0, y: ARENA_DATA.floorY ?? 0.6, z: 14, yaw: 0 };
    } else {
      const meta = typeof getTrackMeta === 'function' ? getTrackMeta(validId) : null;
      const trackLen = meta?.length || TRACK_LENGTH || 600;
      const heroT = 1 - 5.2 / trackLen;
      this.heroSample = getTrackSample(heroT, validId);
    }

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

  setShowcaseRacer(racerId, kartId = undefined, boostColorId = undefined) {
    if (racerId) this.showcaseRacerId = racerId;
    if (kartId) this.showcaseKartId = kartId;
    if (boostColorId) this.showcaseBoostColorId = boostColorId;
    if (this.showcaseKart) {
      setKartRacerTheme(
        this.showcaseKart,
        this.showcaseRacerId,
        this.showcaseKartId,
        this.showcaseBoostColorId
      );
      this.showcaseKart.squashAmp = 0.16;
      this.showcaseKart.squashPhase = 0;
    }
  }

  setShowcaseTrack(trackId) {
    if (!trackId) return;
    const changed = this.showcaseTrackId !== trackId;
    this.showcaseTrackId = trackId;
    if (changed && this.menuViewMode === 'track_preview') {
      this.previewProgress = 0.08;
      this.lastPreviewScrubAt = 0;
    }
    if (!this.lastPhase || this.lastPhase === 'home' || this.lastPhase === 'lobby') {
      this._ensureTrackWorld(trackId);
    }
  }

  setMenuViewMode(mode) {
    const nextMode = mode === 'track_preview' ? 'track_preview' : 'paddock';
    if (this.menuViewMode === nextMode) return;
    this.menuViewMode = nextMode;
    if (nextMode === 'track_preview') {
      this.previewProgress = 0.08;
      this.lastPreviewScrubAt = 0;
    }
  }

  addShowcaseOrbitDelta(deltaRad) {
    if (!Number.isFinite(deltaRad)) return;
    this.userOrbitOffset = Math.max(-2.6, Math.min(2.6, this.userOrbitOffset + deltaRad));
    this.lastOrbitInteractAt = performance.now();
  }

  addPreviewScrub(deltaT) {
    if (!Number.isFinite(deltaT)) return;
    this.previewProgress = (((this.previewProgress + deltaT) % 1) + 1) % 1;
    this.lastPreviewScrubAt = performance.now();
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

  setQualityTier(tier) {
    if (!this.postProcessing) return 'auto';
    return this.postProcessing.setQualityTier(tier);
  }

  getQualityTier() {
    if (!this.postProcessing) return 'auto';
    return this.postProcessing.getQualityTier();
  }

  handleEvent(ev, raceState = null, localId = null) {
    if (!ev) return;
    const rawType =
      typeof ev === 'string'
        ? ev
        : ev.type || ev.kind || ev.name || ev.event || '';
    const type = String(rawType).toLowerCase();
    if (!type) return;

    const effectiveLocalId = localId ?? raceState?.localId ?? null;
    const actorId = ev.targetId ?? ev.kartId ?? ev.playerId ?? ev.ownerId ?? ev.id ?? null;
    const isLocal = !actorId || !effectiveLocalId || actorId === effectiveLocalId;

    switch (type) {
      case 'rocket_start':
        if (isLocal) {
          this.postProcessing?.triggerFlash('rocket_start', 1.15);
          this.triggerShake(0.42);
          this._lastEventFxAt.boost = this.elapsed;
        }
        break;

      case 'rocket_fail':
        if (isLocal) {
          this.postProcessing?.triggerFlash('hit', 0.45);
          this.triggerShake(0.35);
          this._lastEventFxAt.hit = this.elapsed;
        }
        break;

      case 'boost':
      case 'turbo':
        if (isLocal) {
          const isDraft = ev.source === 'draft';
          this.postProcessing?.triggerFlash('boost', isDraft ? 0.55 : 0.9);
          this.triggerShake(isDraft ? 0.14 : 0.28);
          this._lastEventFxAt.boost = this.elapsed;
        }
        break;

      case 'star':
        if (isLocal) {
          this.postProcessing?.triggerFlash('star', 1.0);
          this.triggerShake(0.24);
          this._lastEventFxAt.boost = this.elapsed;
        }
        break;

      case 'stunt':
        if (isLocal) {
          this.postProcessing?.triggerFlash('stunt', 0.85);
          this.triggerShake(0.22);
        }
        break;

      case 'shield_block':
        if (isLocal) {
          this.postProcessing?.triggerFlash('shield_block', 0.75);
          this.triggerShake(0.26);
        }
        break;

      case 'hit':
        if (isLocal || (ev.targetId && ev.targetId === effectiveLocalId)) {
          this.postProcessing?.triggerFlash('hit', 1.0);
          this.triggerShake(0.68);
          this._lastEventFxAt.hit = this.elapsed;
        }
        break;

      case 'fall':
        if (isLocal) {
          this.postProcessing?.triggerFlash('hit', 0.5);
          this.triggerShake(0.38);
        }
        break;

      case 'lightning':
        this.postProcessing?.triggerFlash('lightning', 1.1);
        this.triggerShake(0.55);
        this._lastEventFxAt.lightning = this.elapsed;
        break;

      case 'explosion': {
        let intensity = isLocal ? 0.95 : 0.55;
        if (ev.x != null && ev.z != null && Array.isArray(raceState?.karts)) {
          const focusKart =
            raceState.karts.find((k) => k.id === effectiveLocalId) || raceState.karts[0];
          if (focusKart) {
            const dist = Math.hypot((ev.x || 0) - focusKart.x, (ev.z || 0) - focusKart.z);
            if (dist >= 45) break;
            intensity = Math.max(0.28, (1 - dist / 45) * 1.05);
          }
        }
        this.postProcessing?.triggerFlash('explosion', intensity);
        this.triggerShake(intensity * 0.9);
        this._lastEventFxAt.explosion = this.elapsed;
        break;
      }

      default:
        break;
    }
  }

  _updateShadowCenter(focusX, focusY, focusZ) {
    if (!this.renderer?.shadowMap?.enabled || !this.sunLight?.castShadow) return;
    if (!this.renderer.shadowMap.autoUpdate) {
      this._shadowFrameToggle = !this._shadowFrameToggle;
      if (!this._shadowFrameToggle) return;
      this.renderer.shadowMap.needsUpdate = true;
    }
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

    // 1. Nearby Blue-Shell explosions (zero-allocation Set swap)
    const explosions = raceState.explosions || [];
    this._nextExplosionIds.clear();
    for (let i = 0; i < explosions.length; i++) {
      const exp = explosions[i];
      if (!exp || exp.id == null) continue;
      this._nextExplosionIds.add(exp.id);
      if (!this._seenExplosionIds.has(exp.id)) {
        const dist = Math.hypot((exp.x || 0) - focusKart.x, (exp.z || 0) - focusKart.z);
        if (dist < 45 && this.elapsed - this._lastEventFxAt.explosion > 0.25) {
          const intensity = Math.max(0.28, (1 - dist / 45) * 0.95);
          this.triggerShake(intensity);
          this.postProcessing?.triggerFlash('explosion', intensity);
        }
      }
    }
    const prevSet = this._seenExplosionIds;
    this._seenExplosionIds = this._nextExplosionIds;
    this._nextExplosionIds = prevSet;

    // 2. Hit / Spinout impact
    const spin = focusKart.spinoutTimer || 0;
    if (spin > this._prevSpinTimer + 0.15 && this.elapsed - this._lastEventFxAt.hit > 0.25) {
      this.triggerShake(0.68);
      this.postProcessing?.triggerFlash('hit', 0.9);
    }
    this._prevSpinTimer = spin;

    // 3. Lightning strike
    const shrink = focusKart.shrinkTimer || 0;
    if (shrink > this._prevShrinkTimer + 0.5 && this.elapsed - this._lastEventFxAt.lightning > 0.25) {
      this.triggerShake(0.55);
      this.postProcessing?.triggerFlash('lightning', 0.95);
    }
    this._prevShrinkTimer = shrink;

    // 4. Rocket Start / Boost burst
    const boost = focusKart.boostTimer || 0;
    if (boost > this._prevBoostTimer + 0.25 && this.elapsed - this._lastEventFxAt.boost > 0.25) {
      this.triggerShake(0.28);
      this.postProcessing?.triggerFlash('boost', 0.75);
    }
    this._prevBoostTimer = boost;
  }

  _renderFrame(dt, trackId, focusKart, isPaddock) {
    const fx = this._fxParams;
    fx.dt = dt;
    fx.elapsed = this.elapsed;
    fx.trackId = trackId;

    if (focusKart && !isPaddock) {
      fx.speedRatio = Math.min(1.4, Math.abs(focusKart.speed || 0) / 42);
      fx.boosting = (focusKart.boostTimer || 0) > 0;
      fx.starActive = (focusKart.starTimer || 0) > 0;
      fx.shrinking = (focusKart.shrinkTimer || 0) > 0;
      fx.vignetteBase = fx.boosting ? 0.22 : 0.0;
    } else {
      fx.speedRatio = 0;
      fx.boosting = false;
      fx.starActive = false;
      fx.shrinking = false;
      fx.vignetteBase = isPaddock ? 0.08 : 0.0;
    }

    if (this.postProcessing) {
      this.postProcessing.render(this.scene, this.camera, fx);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
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

    // 2. Update Holographic Ghost Kart if active (not in Arena)
    if (
      !isArenaTrack(desiredTrackId) &&
      this.ghostPose &&
      this.ghostKart &&
      (phase === 'countdown' || phase === 'racing')
    ) {
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
      this._inFinishOrbit = false;

      if (!raceState) {
        this.kartManager.setVisible(false);

        if (this.menuViewMode === 'track_preview') {
          if (typeof this.scene.environmentIntensity === 'number') {
            this.scene.environmentIntensity = 0.48;
          }
          this.stage.update({
            mode: 'hidden',
            trackId: desiredTrackId,
            heroSample: this.heroSample,
            dt: safeDt,
            elapsed: this.elapsed,
          });
          this.showcaseKart.root.visible = false;

          const now = performance.now();
          const targetPos = this._tmpTargetPos;
          const targetLook = this._tmpTargetLook;

          if (isArenaTrack(desiredTrackId)) {
            if (now - this.lastPreviewScrubAt > 1800) {
              this.previewProgress = (this.previewProgress + safeDt * 0.028) % 1;
            }
            const angle = this.previewProgress * Math.PI * 2;
            const radius = this.camera.aspect < 0.85 ? 46 : 38;
            targetPos.set(
              Math.sin(angle) * radius,
              20 + Math.sin(this.elapsed * 0.5) * 1.5,
              Math.cos(angle) * radius
            );
            targetLook.set(Math.sin(angle + 0.5) * 8, 1.5, Math.cos(angle + 0.5) * 8);
            this._updateShadowCenter(0, 0, 0);
          } else {
            if (now - this.lastPreviewScrubAt > 1800) {
              this.previewProgress = (this.previewProgress + safeDt * 0.022) % 1;
            }
            const flySample = getTrackSample(this.previewProgress, desiredTrackId);
            const lookAheadSample = getTrackSample(
              (this.previewProgress + 0.055) % 1,
              desiredTrackId
            );
            const sideAngle = flySample.yaw + Math.PI * 0.5;
            const sway = Math.sin(this.elapsed * 0.45) * 4.2;
            const backDist = this.camera.aspect < 0.85 ? 19 : 16;
            const height = this.camera.aspect < 0.85 ? 12.5 : 10.5;
            targetPos.set(
              flySample.x - Math.sin(flySample.yaw) * backDist + Math.sin(sideAngle) * sway,
              flySample.y + height,
              flySample.z - Math.cos(flySample.yaw) * backDist + Math.cos(sideAngle) * sway
            );
            targetLook.set(lookAheadSample.x, lookAheadSample.y + 1.8, lookAheadSample.z);
            this._updateShadowCenter(lookAheadSample.x, lookAheadSample.y, lookAheadSample.z);
          }

          if (!this._menuCamInitialized) {
            this.camPos.copy(targetPos);
            this.camLook.copy(targetLook);
            this._menuCamInitialized = true;
          } else {
            const smooth = 1 - Math.exp(-4.2 * safeDt);
            this.camPos.lerp(targetPos, smooth);
            this.camLook.lerp(targetLook, smooth);
          }
          this.camera.position.copy(this.camPos);
          this.camera.lookAt(this.camLook);
        } else {
          // Paddock / Showroom stage
          if (typeof this.scene.environmentIntensity === 'number') {
            this.scene.environmentIntensity = 0.78;
          }
          this.stage.update({
            mode: 'paddock',
            trackId: desiredTrackId,
            heroSample: this.heroSample,
            dt: safeDt,
            elapsed: this.elapsed,
          });
          this.showcaseKart.root.visible = true;

          updateKartVisual(
            this.showcaseKart,
            {
              racerId: this.showcaseRacerId,
              kartId: this.showcaseKartId,
              boostColorId: this.showcaseBoostColorId,
              x: this.heroSample.x,
              y: this.heroSample.y + this.stage.getPaddockKartYOffset(),
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

          const now = performance.now();
          if (now - this.lastOrbitInteractAt > 2400) {
            this.userOrbitOffset *= Math.exp(-1.5 * safeDt);
          }
          const autoOrbit = Math.sin(this.elapsed * 0.34) * 0.65 + 0.42;
          const orbitAngle = this.heroSample.yaw + Math.PI + autoOrbit + this.userOrbitOffset;
          const isPortraitCam = this.camera.aspect < 0.85;
          const radius = isPortraitCam ? 6.2 : 5.1;
          const camHeight = isPortraitCam ? 2.35 : 2.05;
          const lookY = isPortraitCam ? 0.48 : 0.98;
          const targetPos = this._tmpTargetPos.set(
            this.heroSample.x + Math.sin(orbitAngle) * radius,
            this.heroSample.y + camHeight + Math.sin(this.elapsed * 0.55) * 0.22,
            this.heroSample.z + Math.cos(orbitAngle) * radius
          );
          const targetLook = this._tmpTargetLook.set(
            this.heroSample.x,
            this.heroSample.y + lookY,
            this.heroSample.z + Math.cos(this.heroSample.yaw) * 1.15
          );

          if (!this._menuCamInitialized) {
            this.camPos.copy(targetPos);
            this.camLook.copy(targetLook);
            this._menuCamInitialized = true;
          } else {
            const smooth = 1 - Math.exp(-5.0 * safeDt);
            this.camPos.lerp(targetPos, smooth);
            this.camLook.lerp(targetLook, smooth);
          }

          this.camera.position.copy(this.camPos);
          this.camera.lookAt(this.camLook);
          this._updateShadowCenter(this.heroSample.x, this.heroSample.y, this.heroSample.z);
        }
      } else {
        if (typeof this.scene.environmentIntensity === 'number') {
          this.scene.environmentIntensity = 0.52;
        }
        this.stage.update({
          mode: 'hidden',
          trackId: desiredTrackId,
          heroSample: this.heroSample,
          dt: safeDt,
          elapsed: this.elapsed,
        });
        this.showcaseKart.root.visible = false;
        this.kartManager.sync(
          raceState.karts,
          effectiveLocalId,
          safeDt,
          this.elapsed,
          desiredTrackId
        );

        let gridSample = this.heroSample;
        if (!isArenaTrack(desiredTrackId)) {
          const meta = typeof getTrackMeta === 'function' ? getTrackMeta(desiredTrackId) : null;
          const trackLen = meta?.length || TRACK_LENGTH || 600;
          const gridT = 1 - 11.5 / trackLen;
          gridSample = getTrackSample(gridT, desiredTrackId);
        }
        const orbitAngle = gridSample.yaw + Math.PI + Math.sin(this.elapsed * 0.32) * 0.78;
        const radius = this.camera.aspect < 0.85 ? 13.5 : 10.8;
        const targetPos = this._tmpTargetPos.set(
          gridSample.x + Math.sin(orbitAngle) * radius,
          gridSample.y + 4.4,
          gridSample.z + Math.cos(orbitAngle) * radius
        );
        const targetLook = this._tmpTargetLook.set(
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
      this._renderFrame(safeDt, desiredTrackId, null, !raceState && this.menuViewMode !== 'track_preview');
      return;
    }

    // 4. Race Phases ('countdown' | 'racing' | 'finished')
    if (typeof this.scene.environmentIntensity === 'number') {
      this.scene.environmentIntensity = phase === 'finished' ? 0.68 : 0.48;
    }
    this._menuCamInitialized = false;
    this.showcaseKart.root.visible = false;

    if (phase === 'finished') {
      const stagedKarts = this.stage.update({
        mode: 'podium',
        trackId: desiredTrackId,
        heroSample: this.heroSample,
        karts: raceState.karts,
        dt: safeDt,
        elapsed: this.elapsed,
      });
      this.kartManager.sync(
        stagedKarts || raceState.karts,
        effectiveLocalId,
        safeDt,
        this.elapsed,
        desiredTrackId
      );

      this.shakeTrauma = Math.max(0, this.shakeTrauma - safeDt * 2.5);
      this._setSmoothFov(52, safeDt);
      this.stage.getPodiumCameraTarget(
        this.camera.aspect,
        this.elapsed,
        this._tmpTargetPos,
        this._tmpTargetLook
      );

      if (!this.camInitialized) {
        this.camPos.copy(this._tmpTargetPos);
        this.camLook.copy(this._tmpTargetLook);
        this.camInitialized = true;
      } else {
        const alpha = 1 - Math.exp(-4.5 * safeDt);
        this.camPos.lerp(this._tmpTargetPos, alpha);
        this.camLook.lerp(this._tmpTargetLook, alpha);
      }

      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      this._updateShadowCenter(this.heroSample.x, this.heroSample.y, this.heroSample.z);

      this.lastPhase = phase;
      this._renderFrame(safeDt, desiredTrackId, null, false);
      return;
    }

    // Countdown & Racing: ensure Podium is hidden
    this.stage.update({
      mode: 'hidden',
      trackId: desiredTrackId,
      heroSample: this.heroSample,
      dt: safeDt,
      elapsed: this.elapsed,
    });
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
      const kx = Number.isFinite(focusKart.x) ? focusKart.x : 0;
      const ky = Number.isFinite(focusKart.y) ? focusKart.y : 0;
      const kz = Number.isFinite(focusKart.z) ? focusKart.z : 0;
      const kyaw = Number.isFinite(focusKart.yaw) ? focusKart.yaw : 0;

      if (!this.camInitialized || (this.lastPhase === 'lobby' && phase === 'countdown')) {
        this.camYaw = kyaw;
        this.driftPeek = 0;
        this.cornerBlend = 0;
        this.finishElapsed = 0;
        this.photoAnchorSet = false;
        this._inFinishOrbit = false;
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

      const kartFinished = Boolean(focusKart.finished);

      if (kartFinished) {
        this.finishElapsed += safeDt;

        if (!this.photoAnchorSet) {
          this.photoAnchorSet = true;
          this._inFinishOrbit = false;
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

        const usePhotoHeroShot =
          Math.abs(focusKart.speed || 0) > 1.0 &&
          this.finishElapsed < 1.15;

        if (usePhotoHeroShot) {
          // PHOTO-FINISH HERO SHOT watching the kart blast across the line!
          this._inFinishOrbit = false;
          this._setSmoothFov(54, safeDt);
          const alpha = 1 - Math.exp(-9.0 * safeDt);
          this.camPos.lerp(this.photoAnchor, alpha);
          this._tmpTargetLook.set(kx, ky + 0.85, kz);
          this.camLook.lerp(this._tmpTargetLook, 1 - Math.exp(-16 * safeDt));
        } else {
          // Smoothly transition into sweeping 360° Finish Orbit without any camera snap!
          if (!this._inFinishOrbit) {
            this._inFinishOrbit = true;
            const dxCam = this.camPos.x - kx;
            const dzCam = this.camPos.z - kz;
            if (Math.hypot(dxCam, dzCam) > 0.25) {
              this.finishOrbitAngle = Math.atan2(dxCam, dzCam);
            }
          }
          this._setSmoothFov(58, safeDt);
          this.finishOrbitAngle += safeDt * 0.78;
          const orbitDist = this.camera.aspect < 0.85 ? 6.6 : 5.4;
          this._tmpTargetPos.set(
            kx + Math.sin(this.finishOrbitAngle) * orbitDist,
            ky + 2.25 + Math.sin(this.elapsed * 1.2) * 0.2,
            kz + Math.cos(this.finishOrbitAngle) * orbitDist
          );
          this._tmpTargetLook.set(kx, ky + 0.95, kz);

          const alpha = 1 - Math.exp(-5.5 * safeDt);
          this.camPos.lerp(this._tmpTargetPos, alpha);
          this.camLook.lerp(this._tmpTargetLook, alpha);
        }
      } else {
        this.finishElapsed = 0;
        this.photoAnchorSet = false;
        this._inFinishOrbit = false;

        // MARIO-KART SPRING CHASE CAMERA WITH V3 CORNER LOOK-AHEAD ('countdown' & 'racing')
        const isBoosting = (focusKart.boostTimer || 0) > 0 || (focusKart.starTimer || 0) > 0;
        this._setSmoothFov(isBoosting ? 74 : 62, safeDt);

        const arenaMode = isArenaTrack(desiredTrackId);
        const proj =
          !arenaMode && typeof projectOnTrack === 'function'
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

        const fallTimer = focusKart.fallTimer || 0;
        let countdownSideOffset = 0;
        if (phase === 'countdown') {
          const cd = Math.max(0, Math.min(3, raceState.countdown || 0));
          const sweep = Math.max(0, (cd - 1) / 2);
          countdownSideOffset = sweep * 2.4;
          chaseHeight += sweep * 0.75;
          chaseDist += sweep * 0.9;
        } else if (fallTimer > 0.75) {
          // Watch kart plunge into ditch from safely above the road edge
          chaseDist += 2.4;
          chaseHeight += 3.2;
        } else if (fallTimer > 0) {
          // Frame both kart and Cloud Fisherman during hoist
          chaseDist += 1.7;
          chaseHeight += 2.25;
        }

        const desiredCamX =
          kx - fx * chaseDist + rx * (-this.driftPeek * 0.35 + countdownSideOffset);
        const rawCamY = ky + chaseHeight;
        const desiredCamY =
          fallTimer > 0.75 ? Math.max(rawCamY, this.camPos.y - 1.2 * safeDt) : rawCamY;
        const desiredCamZ =
          kz - fz * chaseDist + rz * (-this.driftPeek * 0.35 + countdownSideOffset);

        // Blend ~28% of (lookAhead.x, lookAhead.z) direction into camLook so upcoming turns open naturally!
        let lookDirX = fx;
        let lookDirZ = fz;
        let elevPeek = 0;
        if (lookAheadSample && this.cornerBlend > 0.001 && fallTimer <= 0) {
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

        const lookAhead = fallTimer > 0 ? 1.2 : 4.1;
        const desiredLookX = kx + lookDirX * lookAhead + rx * (this.driftPeek * 0.95);
        const desiredLookY =
          fallTimer > 0
            ? ky + (fallTimer <= 0.75 ? 1.85 : 0.75)
            : ky + 1.05 + (focusKart.hopOffset || 0) * 0.35 + elevPeek;
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

      // Guard against non-finite camera vectors poisoning Three.js matrices
      if (!Number.isFinite(this.camPos.x) || !Number.isFinite(this.camPos.y) || !Number.isFinite(this.camPos.z)) {
        this.camPos.set(kx - Math.sin(kyaw) * 6.2, ky + 2.8, kz - Math.cos(kyaw) * 6.2);
      }
      if (!Number.isFinite(this.camLook.x) || !Number.isFinite(this.camLook.y) || !Number.isFinite(this.camLook.z)) {
        this.camLook.set(kx, ky + 1.0, kz);
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
    this._renderFrame(safeDt, desiredTrackId, focusKart, false);
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

    if (this.stage) {
      this.stage.dispose();
      this.stage = null;
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

    if (this.postProcessing) {
      this.postProcessing.dispose();
      this.postProcessing = null;
    }

    if (this.scene) {
      this.scene.environment = null;
    }
    if (this._envRenderTarget) {
      this._envRenderTarget.dispose();
      this._envRenderTarget = null;
    }
    if (this._pmremGenerator) {
      this._pmremGenerator.dispose();
      this._pmremGenerator = null;
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
