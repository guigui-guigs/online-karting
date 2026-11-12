import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { getBaseTrackId } from '../shared/trackData.js';

export const QUALITY_TIERS = ['auto', 'ultra', 'balanced', 'low'];

export function normalizeQualityTier(tier) {
  if (typeof tier !== 'string') return 'auto';
  const clean = tier.trim().toLowerCase();
  if (clean === 'ultra' || clean === 'high') return 'ultra';
  if (clean === 'balanced' || clean === 'medium' || clean === 'med') return 'balanced';
  if (clean === 'low') return 'low';
  return 'auto';
}

export const SpeedFXShader = {
  name: 'SpeedFXShader',
  uniforms: {
    tDiffuse: { value: null },
    uSpeedIntensity: { value: 0.0 },
    uRadialBlur: { value: 0.0 },
    uChromatic: { value: 0.0 },
    uVignette: { value: 0.0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uFlashAmount: { value: 0.0 },
    uFlashEdgeOnly: { value: 0.5 },
    uTime: { value: 0.0 },
    uAspect: { value: 1.0 },
    uMobileFast: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSpeedIntensity;
    uniform float uRadialBlur;
    uniform float uChromatic;
    uniform float uVignette;
    uniform vec3 uFlashColor;
    uniform float uFlashAmount;
    uniform float uFlashEdgeOnly;
    uniform float uTime;
    uniform float uAspect;
    uniform float uMobileFast;

    varying vec2 vUv;

    void main() {
      vec4 baseSample = texture2D(tDiffuse, vUv);

      float fxEnergy = uSpeedIntensity + uRadialBlur + uChromatic + uVignette + uFlashAmount;
      if (fxEnergy < 0.0015) {
        gl_FragColor = baseSample;
        return;
      }

      vec2 centered = vUv - 0.5;
      vec2 aspectVec = vec2(centered.x * min(uAspect, 1.75), centered.y);
      float dist = length(aspectVec);
      float edge = smoothstep(0.18, 0.72, dist);
      vec2 radialDir = dist > 0.0001 ? normalize(centered) : vec2(0.0);

      vec3 col = baseSample.rgb;

      // 1. Peripheral radial zoom blur during boosts / stunts / impacts (keeps center crisp)
      if (uRadialBlur > 0.002) {
        float blurAmt = uRadialBlur * edge * 0.032;
        if (uMobileFast > 0.5) {
          vec3 accum = col * 0.52;
          accum += texture2D(tDiffuse, clamp(vUv - radialDir * blurAmt * 0.42, 0.001, 0.999)).rgb * 0.30;
          accum += texture2D(tDiffuse, clamp(vUv - radialDir * blurAmt * 0.92, 0.001, 0.999)).rgb * 0.18;
          col = accum;
        } else {
          vec3 accum = col * 0.34;
          accum += texture2D(tDiffuse, clamp(vUv - radialDir * blurAmt * 0.28, 0.001, 0.999)).rgb * 0.24;
          accum += texture2D(tDiffuse, clamp(vUv - radialDir * blurAmt * 0.58, 0.001, 0.999)).rgb * 0.20;
          accum += texture2D(tDiffuse, clamp(vUv - radialDir * blurAmt * 0.92, 0.001, 0.999)).rgb * 0.14;
          accum += texture2D(tDiffuse, clamp(vUv - radialDir * blurAmt * 1.25, 0.001, 0.999)).rgb * 0.08;
          col = accum;
        }
      }

      // 2. Subtle chromatic aberration on outer frame during high speed / hits / explosions (skipped in mobile fast mode)
      float caStrength = (uChromatic * 0.0052 + uRadialBlur * 0.0022) * edge;
      if (uMobileFast < 0.5 && caStrength > 0.00015) {
        vec2 caOffset = radialDir * caStrength;
        float rSample = texture2D(tDiffuse, clamp(vUv + caOffset, 0.001, 0.999)).r;
        float bSample = texture2D(tDiffuse, clamp(vUv - caOffset, 0.001, 0.999)).b;
        col.r = mix(col.r, rSample, 0.85);
        col.b = mix(col.b, bSample, 0.85);
      }

      // 3. Subtle peripheral arcade speed shimmer when boosting
      if (uSpeedIntensity > 0.12) {
        float angle = atan(centered.y, centered.x);
        float streak = pow(max(0.0, sin(angle * 32.0 + uTime * 22.0) * 0.5 + 0.5), 6.0);
        float streakMask = smoothstep(0.32, 0.72, dist) * (uSpeedIntensity - 0.12);
        col += vec3(0.45, 0.82, 1.0) * streak * streakMask * 0.11;
      }

      // 4. Dynamic vignette (subtle speed tunnel + impact pulse)
      float vigStrength = clamp(uVignette * 0.34 + uSpeedIntensity * 0.18, 0.0, 0.52);
      col *= 1.0 - edge * vigStrength;

      // 5. Event flash impulse (boost cyan-gold, hit crimson, lightning white-cyan, explosion amber)
      if (uFlashAmount > 0.001) {
        float mask = mix(1.0, edge, uFlashEdgeOnly);
        col += uFlashColor * (uFlashAmount * mask);
      }

      gl_FragColor = vec4(max(col, vec3(0.0)), baseSample.a);
    }
  `,
};

const FLASH_PRESETS = {
  boost: { color: 0x38bdf8, amount: 0.24, radial: 0.72, chromatic: 0.42, vignette: 0.18, edgeOnly: 0.72, decay: 4.8 },
  rocket_start: { color: 0xffbe0b, amount: 0.36, radial: 0.92, chromatic: 0.55, vignette: 0.22, edgeOnly: 0.65, decay: 3.6 },
  stunt: { color: 0xfde047, amount: 0.22, radial: 0.55, chromatic: 0.30, vignette: 0.12, edgeOnly: 0.78, decay: 4.5 },
  star: { color: 0x00f5d4, amount: 0.28, radial: 0.68, chromatic: 0.48, vignette: 0.15, edgeOnly: 0.68, decay: 4.0 },
  hit: { color: 0xef4444, amount: 0.42, radial: 0.35, chromatic: 0.95, vignette: 0.85, edgeOnly: 0.75, decay: 3.8 },
  explosion: { color: 0xfb923c, amount: 0.62, radial: 0.68, chromatic: 1.0, vignette: 0.72, edgeOnly: 0.35, decay: 3.2 },
  lightning: { color: 0xdbeafe, amount: 0.78, radial: 0.25, chromatic: 0.88, vignette: 0.35, edgeOnly: 0.12, decay: 5.5 },
  shield_block: { color: 0x34d399, amount: 0.26, radial: 0.30, chromatic: 0.35, vignette: 0.20, edgeOnly: 0.70, decay: 4.8 },
};

export class PostProcessingPipeline {
  constructor(
    renderer,
    { width = 800, height = 600, pixelRatio = 1, initialTier = 'auto', onTierChange = null } = {}
  ) {
    this.renderer = renderer;
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.rawPixelRatio = Math.max(1, Number(pixelRatio) || 1);
    this.onTierChange = typeof onTierChange === 'function' ? onTierChange : null;

    this._isMobileLike = this._detectMobileLike();
    this.qualityTier = normalizeQualityTier(initialTier);
    this.resolvedTier = this._resolveInitialTier(this.qualityTier);

    // Auto FPS adaptation state
    this._emaDt = 1 / 60;
    this._warmupFrames = 24;
    this._badPerfTime = 0;
    this._goodPerfTime = 0;
    this._autoCooldown = 3.0;

    // Smooth FX channels (zero per-frame allocations)
    this._smoothSpeed = 0;
    this._smoothRadial = 0;
    this._smoothChromatic = 0;
    this._smoothVignette = 0;
    this._smoothBloom = 0.24;

    // Flash impulse state
    this._flashAmount = 0;
    this._flashRadial = 0;
    this._flashChromatic = 0;
    this._flashVignette = 0;
    this._flashEdgeOnly = 0.6;
    this._flashDecay = 4.2;
    this._flashColor = new THREE.Color(1, 1, 1);
    this._tmpColor = new THREE.Color();

    this.composer = null;
    this.renderPass = null;
    this.bloomPass = null;
    this.speedFxPass = null;
    this.outputPass = null;
    this._currentSamples = -1;

    this._initComposer();
    this._syncRendererPixelRatio(this.resolvedTier);
    if (this.onTierChange) {
      this.onTierChange(this.resolvedTier);
    }
  }

  _detectMobileLike() {
    if (typeof window === 'undefined') return false;
    const coarse = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
    const mobileUA =
      typeof navigator !== 'undefined' &&
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    const smallViewport = Math.min(window.innerWidth || 1280, window.innerHeight || 720) < 768;
    const lowCores = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 8) <= 4;
    return coarse || mobileUA || smallViewport || lowCores;
  }

  _resolveInitialTier(tier) {
    if (tier !== 'auto') return tier;
    return this._isMobileLike ? 'balanced' : 'ultra';
  }

  _getTargetSamples(resolvedTier) {
    const maxSamples = Math.max(0, Number(this.renderer?.capabilities?.maxSamples) || 4);
    if (resolvedTier === 'ultra') return Math.min(4, maxSamples);
    if (resolvedTier === 'balanced') return this._isMobileLike ? 0 : Math.min(2, maxSamples);
    return 0;
  }

  _getEffectivePixelRatio(resolvedTier) {
    if (resolvedTier === 'ultra') return Math.min(this.rawPixelRatio, 2);
    if (resolvedTier === 'balanced') {
      return Math.min(this.rawPixelRatio, this._isMobileLike ? 1.25 : 1.5);
    }
    return 1.0;
  }

  _syncRendererPixelRatio(resolvedTier) {
    if (!this.renderer) return;
    const effectivePr = this._getEffectivePixelRatio(resolvedTier);
    if (this.renderer.getPixelRatio() !== effectivePr) {
      this.renderer.setPixelRatio(effectivePr);
      this.renderer.setSize(this.width, this.height);
    }
  }

  _initComposer() {
    if (!this.renderer) return;

    const initialTierForRt = this.resolvedTier === 'low' ? 'balanced' : this.resolvedTier;
    const samples = this._getTargetSamples(initialTierForRt);
    const pr = this._getEffectivePixelRatio(initialTierForRt);

    const rt = new THREE.WebGLRenderTarget(this.width, this.height, {
      type: THREE.HalfFloatType,
      samples,
    });
    rt.texture.name = 'PocketKart.HDR';
    this._currentSamples = samples;

    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    const bloomScale = this._isMobileLike ? 0.5 : 1.0;
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(
        Math.max(1, Math.round(this.width * bloomScale)),
        Math.max(1, Math.round(this.height * bloomScale))
      ),
      0.24,
      0.38,
      0.92
    );
    this.speedFxPass = new ShaderPass(SpeedFXShader);
    this.outputPass = new OutputPass();

    // Mandatory order: RenderPass -> UnrealBloomPass -> SpeedFXShaderPass -> OutputPass (ACES Filmic + sRGB once)
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.speedFxPass);
    this.composer.addPass(this.outputPass);

    this.composer.setSize(this.width, this.height);
    this.composer.setPixelRatio(pr);
  }

  _applyResolvedTier(nextResolved) {
    const changed = this.resolvedTier !== nextResolved;
    this.resolvedTier = nextResolved;
    this._warmupFrames = 18;
    this._badPerfTime = 0;
    this._goodPerfTime = 0;

    this._syncRendererPixelRatio(nextResolved);
    if (changed && this.onTierChange) {
      this.onTierChange(nextResolved);
    }

    if (!this.composer || nextResolved === 'low') return;

    const targetSamples = this._getTargetSamples(nextResolved);
    const pr = this._getEffectivePixelRatio(nextResolved);

    if (targetSamples !== this._currentSamples) {
      const rt = new THREE.WebGLRenderTarget(
        Math.max(1, Math.round(this.width * pr)),
        Math.max(1, Math.round(this.height * pr)),
        {
          type: THREE.HalfFloatType,
          samples: targetSamples,
        }
      );
      rt.texture.name = 'PocketKart.HDR';
      this.composer.reset(rt);
      this._currentSamples = targetSamples;
    }

    this.composer.setSize(this.width, this.height);
    this.composer.setPixelRatio(pr);
    if (this.bloomPass) {
      const bloomScale = this._isMobileLike && nextResolved !== 'ultra' ? 0.5 : 1.0;
      this.bloomPass.setSize(
        Math.max(1, Math.round(this.width * bloomScale)),
        Math.max(1, Math.round(this.height * bloomScale))
      );
    }
  }

  setQualityTier(tier) {
    const normalized = normalizeQualityTier(tier);
    this.qualityTier = normalized;
    this._autoCooldown = 4.0;
    const nextResolved = this._resolveInitialTier(normalized);
    this._applyResolvedTier(nextResolved);
    return this.qualityTier;
  }

  getQualityTier() {
    return this.qualityTier;
  }

  getResolvedTier() {
    return this.resolvedTier;
  }

  setSize(w, h, pr = this.rawPixelRatio) {
    this.width = Math.max(1, Math.round(Number(w) || 1));
    this.height = Math.max(1, Math.round(Number(h) || 1));
    this.rawPixelRatio = Math.max(1, Number(pr) || 1);
    this._warmupFrames = Math.max(this._warmupFrames, 10);

    const effectivePr = this._getEffectivePixelRatio(this.resolvedTier);
    if (this.renderer) {
      this.renderer.setPixelRatio(effectivePr);
      this.renderer.setSize(this.width, this.height);
    }

    if (this.composer && this.resolvedTier !== 'low') {
      this.composer.setSize(this.width, this.height);
      this.composer.setPixelRatio(effectivePr);
      if (this.bloomPass) {
        const bloomScale = this._isMobileLike && this.resolvedTier !== 'ultra' ? 0.5 : 1.0;
        this.bloomPass.setSize(
          Math.max(1, Math.round(this.width * bloomScale)),
          Math.max(1, Math.round(this.height * bloomScale))
        );
      }
    }
  }

  triggerFlash(kind, intensity = 1.0) {
    const key = String(kind || '').toLowerCase();
    const preset = FLASH_PRESETS[key];
    if (!preset) return;

    const scale = Math.max(0.1, Math.min(1.8, Number(intensity) || 1.0));
    this._tmpColor.setHex(preset.color);

    const nextAmount = Math.min(0.95, preset.amount * scale);
    if (nextAmount >= this._flashAmount) {
      this._flashColor.copy(this._tmpColor);
      this._flashEdgeOnly = preset.edgeOnly;
      this._flashDecay = preset.decay;
    } else {
      this._flashColor.lerp(this._tmpColor, 0.35);
    }

    this._flashAmount = Math.max(this._flashAmount, nextAmount);
    this._flashRadial = Math.max(this._flashRadial, Math.min(1.0, preset.radial * scale));
    this._flashChromatic = Math.max(this._flashChromatic, Math.min(1.0, preset.chromatic * scale));
    this._flashVignette = Math.max(this._flashVignette, Math.min(1.0, preset.vignette * scale));
  }

  _updateAutoTier(dt) {
    if (this.qualityTier !== 'auto') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (this._warmupFrames > 0) {
      this._warmupFrames -= 1;
      return;
    }

    const clampedDt = Math.min(Math.max(dt, 0.004), 0.12);
    this._emaDt = this._emaDt * 0.93 + clampedDt * 0.07;
    if (this._autoCooldown > 0) {
      this._autoCooldown = Math.max(0, this._autoCooldown - dt);
      return;
    }

    if (this.resolvedTier === 'ultra') {
      if (this._emaDt > 1 / 42) {
        this._badPerfTime += dt;
        if (this._badPerfTime > 2.2) {
          this._autoCooldown = 6.0;
          this._applyResolvedTier('balanced');
        }
      } else {
        this._badPerfTime = Math.max(0, this._badPerfTime - dt * 0.5);
      }
    } else if (this.resolvedTier === 'balanced') {
      const balancedFloorDt = this._isMobileLike ? 1 / 45 : 1 / 30;
      if (this._emaDt > balancedFloorDt) {
        this._badPerfTime += dt;
        this._goodPerfTime = 0;
        if (this._badPerfTime > 2.2) {
          this._autoCooldown = 7.0;
          this._applyResolvedTier('low');
        }
      } else if (!this._isMobileLike && this._emaDt < 1 / 56) {
        this._goodPerfTime += dt;
        this._badPerfTime = 0;
        if (this._goodPerfTime > 7.5) {
          this._autoCooldown = 8.0;
          this._applyResolvedTier('ultra');
        }
      } else {
        this._badPerfTime = Math.max(0, this._badPerfTime - dt * 0.5);
        this._goodPerfTime = Math.max(0, this._goodPerfTime - dt * 0.5);
      }
    } else if (this.resolvedTier === 'low') {
      const upgradeDt = this._isMobileLike ? 1 / 57 : 1 / 55;
      if (this._emaDt < upgradeDt) {
        this._goodPerfTime += dt;
        if (this._goodPerfTime > (this._isMobileLike ? 12.0 : 8.5)) {
          this._autoCooldown = 8.0;
          this._applyResolvedTier('balanced');
        }
      } else {
        this._goodPerfTime = Math.max(0, this._goodPerfTime - dt * 0.5);
      }
    }
  }

  _getTrackBloomBase(trackId, tier) {
    const baseId = getBaseTrackId(trackId || 'coco');
    const mult = tier === 'balanced' ? (this._isMobileLike ? 0.58 : 0.78) : 1.0;
    if (baseId === 'neon' || baseId === 'pinball') return { strength: 0.36 * mult, threshold: 0.88, radius: 0.44 };
    if (baseId === 'rainbow' || baseId === 'volcano') return { strength: 0.31 * mult, threshold: 0.90, radius: 0.42 };
    if (baseId === 'arena') return { strength: 0.30 * mult, threshold: 0.90, radius: 0.40 };
    if (baseId === 'polar') return { strength: 0.21 * mult, threshold: 0.95, radius: 0.34 };
    return { strength: 0.22 * mult, threshold: 0.94, radius: 0.35 };
  }

  render(scene, camera, fxParams = {}) {
    if (!this.renderer || !scene || !camera) return;

    const dt = Math.min(Math.max(Number(fxParams.dt) || 1 / 60, 0.0005), 0.1);
    const elapsed = Number(fxParams.elapsed) || 0;

    this._updateAutoTier(dt);

    // Always decay flash impulses smoothly
    const flashDecayFactor = Math.exp(-this._flashDecay * dt);
    this._flashAmount *= flashDecayFactor;
    this._flashRadial *= Math.exp(-4.5 * dt);
    this._flashChromatic *= Math.exp(-4.8 * dt);
    this._flashVignette *= Math.exp(-4.2 * dt);
    if (this._flashAmount < 0.002) this._flashAmount = 0;

    if (this.resolvedTier === 'low' || !this.composer) {
      this.renderer.render(scene, camera);
      return;
    }

    this.renderPass.scene = scene;
    this.renderPass.camera = camera;

    const speedRatio = Math.max(0, Math.min(1.5, Number(fxParams.speedRatio) || 0));
    const boosting = Boolean(fxParams.boosting);
    const starActive = Boolean(fxParams.starActive);
    const shrinking = Boolean(fxParams.shrinking);
    const baseVignette = Math.max(0, Math.min(1, Number(fxParams.vignetteBase) || 0));

    const targetSpeed = boosting || starActive
      ? Math.min(1.0, 0.68 + speedRatio * 0.32)
      : Math.max(0, (speedRatio - 0.78) * 0.65);
    const targetRadial = boosting || starActive
      ? Math.max(0.45, this._flashRadial)
      : this._flashRadial;
    const targetChromatic = Math.max(
      this._flashChromatic,
      boosting || starActive ? 0.24 : shrinking ? 0.38 : 0.0
    );
    const targetVignette = Math.max(
      this._flashVignette,
      baseVignette,
      boosting ? 0.26 : 0.0
    );

    const smoothAlpha = 1 - Math.exp(-10 * dt);
    this._smoothSpeed += (targetSpeed - this._smoothSpeed) * smoothAlpha;
    this._smoothRadial += (targetRadial - this._smoothRadial) * smoothAlpha;
    this._smoothChromatic += (targetChromatic - this._smoothChromatic) * smoothAlpha;
    this._smoothVignette += (targetVignette - this._smoothVignette) * smoothAlpha;

    const bloomCfg = this._getTrackBloomBase(fxParams.trackId, this.resolvedTier);
    const targetBloom = bloomCfg.strength + (boosting || starActive ? 0.08 : 0) + this._flashAmount * 0.12;
    this._smoothBloom += (targetBloom - this._smoothBloom) * smoothAlpha;

    this.bloomPass.strength = this._smoothBloom;
    this.bloomPass.threshold = bloomCfg.threshold;
    this.bloomPass.radius = bloomCfg.radius;

    const u = this.speedFxPass.uniforms;
    u.uSpeedIntensity.value = this._smoothSpeed;
    u.uRadialBlur.value = this._smoothRadial;
    u.uChromatic.value = this._smoothChromatic;
    u.uVignette.value = this._smoothVignette;
    u.uFlashColor.value.copy(this._flashColor);
    u.uFlashAmount.value = this._flashAmount;
    u.uFlashEdgeOnly.value = this._flashEdgeOnly;
    u.uTime.value = elapsed;
    u.uAspect.value = this.width / Math.max(1, this.height);
    u.uMobileFast.value = this._isMobileLike && this.resolvedTier !== 'ultra' ? 1.0 : 0.0;

    this.composer.render(dt);
  }

  dispose() {
    if (this.composer) {
      for (const pass of this.composer.passes) {
        if (typeof pass.dispose === 'function') {
          pass.dispose();
        }
      }
      this.composer.dispose();
      this.composer = null;
    }
    this.renderPass = null;
    this.bloomPass = null;
    this.speedFxPass = null;
    this.outputPass = null;
    this.renderer = null;
  }
}
