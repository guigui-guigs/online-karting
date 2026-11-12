import * as THREE from 'three';
import { RACERS, EMOTES, RACE_CONFIG, BOOST_STYLES } from '../shared/constants.js';
import { getTrackSample, getBaseTrackId, isArenaTrack } from '../shared/trackData.js';

let sharedAssets = null;

function createBlobShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(64, 64, 10, 64, 64, 60);
  grad.addColorStop(0.0, 'rgba(10, 14, 28, 0.58)');
  grad.addColorStop(0.6, 'rgba(10, 14, 28, 0.28)');
  grad.addColorStop(1.0, 'rgba(10, 14, 28, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  return new THREE.CanvasTexture(canvas);
}

function getSharedKartAssets() {
  if (sharedAssets) return sharedAssets;

  const shadowGeo = new THREE.PlaneGeometry(2.3, 3.1);
  shadowGeo.rotateX(-Math.PI / 2);

  const underglowGeo = new THREE.RingGeometry(0.45, 1.38, 24);
  underglowGeo.rotateX(-Math.PI / 2);
  const balloonGeo = new THREE.SphereGeometry(0.24, 14, 12);
  balloonGeo.scale(0.95, 1.15, 0.95);
  const balloonCordGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6);
  const rollBarGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.15, 8);
  const hoverPodGeo = new THREE.CylinderGeometry(0.32, 0.24, 0.16, 14);
  const f1NoseGeo = new THREE.ConeGeometry(0.24, 1.15, 12);
  f1NoseGeo.rotateX(Math.PI * 0.5);
  const cyberFinGeo = new THREE.BoxGeometry(0.1, 0.34, 1.75);
  const motoTireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.22, 16);
  motoTireGeo.rotateZ(Math.PI / 2);

  const floorPanGeo = new THREE.BoxGeometry(1.22, 0.14, 2.05);
  const mainBodyGeo = new THREE.BoxGeometry(1.02, 0.34, 1.48);

  const noseGeo = new THREE.CylinderGeometry(0.28, 0.48, 0.85, 14);
  noseGeo.rotateX(Math.PI / 2);
  noseGeo.scale(1.05, 0.68, 1.0);

  const bumperGeo = new THREE.CapsuleGeometry(0.11, 1.06, 6, 12);
  bumperGeo.rotateZ(Math.PI / 2);

  const badgeGeo = new THREE.CircleGeometry(0.21, 16);
  badgeGeo.rotateX(-Math.PI * 0.36);

  const sidePodGeo = new THREE.CapsuleGeometry(0.19, 0.78, 6, 12);
  sidePodGeo.rotateX(Math.PI / 2);
  const sideStripeGeo = new THREE.BoxGeometry(0.06, 0.1, 0.86);

  const engineDeckGeo = new THREE.BoxGeometry(0.84, 0.32, 0.56);
  const strutGeo = new THREE.BoxGeometry(0.08, 0.42, 0.16);
  const spoilerWingGeo = new THREE.BoxGeometry(1.38, 0.08, 0.36);
  const spoilerTipGeo = new THREE.BoxGeometry(0.07, 0.24, 0.42);

  const exhaustGeo = new THREE.CylinderGeometry(0.11, 0.075, 0.52, 10);
  const exhaustBoreGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.06, 10);

  const frontTireGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.26, 16);
  frontTireGeo.rotateZ(Math.PI / 2);
  const frontRimGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.275, 12);
  frontRimGeo.rotateZ(Math.PI / 2);
  const lugBarGeo = new THREE.BoxGeometry(0.29, 0.06, 0.26);

  const rearTireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.34, 16);
  rearTireGeo.rotateZ(Math.PI / 2);
  const rearRimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.355, 12);
  rearRimGeo.rotateZ(Math.PI / 2);

  const steerColGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.42, 8);
  const steerWheelGeo = new THREE.TorusGeometry(0.16, 0.032, 8, 14);

  const torsoGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.44, 12);
  const gloveGeo = new THREE.SphereGeometry(0.085, 8, 8);
  const headGeo = new THREE.SphereGeometry(0.31, 16, 14);
  const helmetGeo = new THREE.SphereGeometry(0.355, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.68);
  const helmetStripeGeo = new THREE.BoxGeometry(0.09, 0.12, 0.62);
  const visorGeo = new THREE.CylinderGeometry(0.335, 0.335, 0.19, 14, 1, false, -0.95, 1.9);

  // Expressive Mario-Kart character & Cloud Fisherman shared geometries
  const eyeWhiteGeo = new THREE.SphereGeometry(0.068, 10, 8);
  const eyePupilGeo = new THREE.SphereGeometry(0.042, 8, 8);
  const browGeo = new THREE.BoxGeometry(0.11, 0.036, 0.05);
  const noseRoundGeo = new THREE.SphereGeometry(0.115, 12, 10);
  const capDomeGeo = new THREE.SphereGeometry(0.35, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const capBrimGeo = new THREE.CylinderGeometry(0.32, 0.34, 0.045, 14, 1, false, -Math.PI * 0.42, Math.PI * 0.84);
  const capEmblemGeo = new THREE.CircleGeometry(0.085, 12);
  const stachePartGeo = new THREE.CapsuleGeometry(0.04, 0.1, 4, 8);
  const stacheZigGeo = new THREE.BoxGeometry(0.12, 0.045, 0.055);
  const pointyEarGeo = new THREE.ConeGeometry(0.065, 0.16, 6);
  const mushCapGeo = new THREE.SphereGeometry(0.45, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.68);
  const mushSpotGeo = new THREE.SphereGeometry(0.115, 10, 8);
  const cheekGeo = new THREE.SphereGeometry(0.055, 8, 6);
  const hairTopGeo = new THREE.SphereGeometry(0.34, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const ponytailGeo = new THREE.ConeGeometry(0.16, 0.38, 10);
  const tiaraBandGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.075, 10);
  const tiaraSpikeGeo = new THREE.ConeGeometry(0.04, 0.11, 4);
  const dinoSnoutGeo = new THREE.SphereGeometry(0.22, 12, 10);
  const dinoSpikeGeo = new THREE.ConeGeometry(0.065, 0.16, 6);
  const backShellGeo = new THREE.SphereGeometry(0.27, 12, 10);
  const hornGeo = new THREE.ConeGeometry(0.068, 0.24, 8);
  const hornBaseGeo = new THREE.CylinderGeometry(0.072, 0.08, 0.04, 8);
  const fangGeo = new THREE.ConeGeometry(0.028, 0.075, 5);
  const goggleRimGeo = new THREE.TorusGeometry(0.085, 0.022, 6, 12);
  const goggleLensGeo = new THREE.CircleGeometry(0.07, 10);
  const cloudPuffGeo = new THREE.IcosahedronGeometry(0.38, 1);
  const rodShaftGeo = new THREE.CylinderGeometry(0.024, 0.042, 1.55, 8);
  const fishingLineGeo = new THREE.CylinderGeometry(0.015, 0.015, 2.55, 6);
  const fishingHookGeo = new THREE.TorusGeometry(0.14, 0.028, 6, 12, Math.PI * 1.4);

  // V2 Golden Champion Crown geometries
  const crownBandGeo = new THREE.CylinderGeometry(0.21, 0.18, 0.12, 12);
  const crownSpikeGeo = new THREE.ConeGeometry(0.055, 0.15, 5);
  const crownGemGeo = new THREE.SphereGeometry(0.035, 6, 6);

  // FX Geometries (Turbo flames, drift sparks, star aura, lightning zaps, rescue halo)
  const flameOuterGeo = new THREE.ConeGeometry(0.18, 0.95, 10);
  flameOuterGeo.translate(0, 0.475, 0);
  flameOuterGeo.rotateX(-Math.PI / 2);

  const flameInnerGeo = new THREE.ConeGeometry(0.1, 0.62, 8);
  flameInnerGeo.translate(0, 0.31, 0);
  flameInnerGeo.rotateX(-Math.PI / 2);

  const sparkGeo = new THREE.OctahedronGeometry(0.11, 0);
  const smokeGeo = new THREE.IcosahedronGeometry(0.24, 1);
  const turboWaveGeo = new THREE.RingGeometry(0.55, 1.05, 28);
  turboWaveGeo.rotateX(-Math.PI / 2);
  const starRingGeo = new THREE.TorusGeometry(1.28, 0.055, 8, 24);
  starRingGeo.rotateX(Math.PI / 2);

  // Jagged electric zap ring for Lightning Shrink
  const zapRingGeo = new THREE.TorusGeometry(0.95, 0.04, 4, 7);
  // Subtle rescue glow ring under hook
  const rescueBeamGeo = new THREE.RingGeometry(0.55, 0.85, 20);
  rescueBeamGeo.rotateX(-Math.PI / 2);
  const ufoDiscGeo = new THREE.CylinderGeometry(0.65, 1.1, 0.24, 16);

  // V3 Trailing Shield (mini Koopa Shell & Peeled Banana) + Slipstream Wind Streaks
  const shieldDomeGeo = new THREE.CylinderGeometry(0.24, 0.4, 0.26, 6);
  const shieldCapGeo = new THREE.CylinderGeometry(0.07, 0.24, 0.11, 6);
  const shieldRimGeo = new THREE.TorusGeometry(0.38, 0.085, 8, 14);
  shieldRimGeo.rotateX(Math.PI / 2);
  const shieldRingGeo = new THREE.RingGeometry(0.42, 0.6, 20);
  shieldRingGeo.rotateX(-Math.PI / 2);

  const bananaCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.08, -0.03),
    new THREE.Vector3(0.02, 0.34, 0.07),
    new THREE.Vector3(-0.03, 0.72, -0.05),
  ]);
  const shieldBananaGeo = new THREE.TubeGeometry(bananaCurve, 8, 0.13, 8, false);
  const shieldPeelGeo = new THREE.ConeGeometry(0.28, 0.12, 3);
  shieldPeelGeo.rotateX(Math.PI);

  const windStreakGeo = new THREE.BoxGeometry(0.038, 0.038, 1.35);

  const shieldGreenMat = new THREE.MeshStandardMaterial({
    color: 0x10dc60,
    emissive: 0x059669,
    emissiveIntensity: 0.25,
    roughness: 0.22,
    flatShading: true,
  });
  const shieldRedMat = new THREE.MeshStandardMaterial({
    color: 0xff243c,
    emissive: 0xbe123c,
    emissiveIntensity: 0.3,
    roughness: 0.22,
    flatShading: true,
  });
  const shieldBananaMat = new THREE.MeshStandardMaterial({
    color: 0xffe600,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.2,
    roughness: 0.28,
  });
  const shieldTetherMat = new THREE.MeshBasicMaterial({
    color: 0x00f5d4,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const windStreakMat = new THREE.MeshBasicMaterial({
    color: 0xe0f7ff,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  // Shared non-mutating materials
  const shadowTex = createBlobShadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
  });
  const darkChassisMat = new THREE.MeshStandardMaterial({
    color: 0x1e2235,
    roughness: 0.72,
    metalness: 0.15,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x181a24,
    roughness: 0.85,
    metalness: 0.05,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.18,
    metalness: 0.82,
  });
  const darkBoreMat = new THREE.MeshBasicMaterial({ color: 0x090b10 });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xffd6b0,
    roughness: 0.55,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.08,
    metalness: 0.65,
  });
  const whiteBadgeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.3,
  });
  const cartoonStacheMat = new THREE.MeshStandardMaterial({
    color: 0x2a1810,
    roughness: 0.72,
  });
  const blondeHairMat = new THREE.MeshStandardMaterial({
    color: 0xfde047,
    emissive: 0xca8a04,
    emissiveIntensity: 0.14,
    roughness: 0.35,
  });
  const fieryHairMat = new THREE.MeshStandardMaterial({
    color: 0xff5400,
    emissive: 0xe63946,
    emissiveIntensity: 0.22,
    roughness: 0.38,
  });
  const rosyMat = new THREE.MeshStandardMaterial({
    color: 0xff70a6,
    roughness: 0.45,
  });
  const plumPurpleMat = new THREE.MeshStandardMaterial({
    color: 0x7209b7,
    roughness: 0.32,
  });
  const koopaShellMat = new THREE.MeshStandardMaterial({
    color: 0x16a34a,
    roughness: 0.35,
  });
  const redSpotMat = new THREE.MeshStandardMaterial({
    color: 0xff243c,
    roughness: 0.28,
  });
  const cloudWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xbae6fd,
    emissiveIntensity: 0.28,
    roughness: 0.8,
  });
  const rodWoodMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.42,
  });
  const fishingLineMat = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
  });
  const goldCrownMat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xd97706,
    emissiveIntensity: 0.42,
    roughness: 0.18,
    metalness: 0.78,
  });
  const rubyGemMat = new THREE.MeshBasicMaterial({ color: 0xff2a54 });
  const zapYellowMat = new THREE.MeshBasicMaterial({
    color: 0xfff033,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const rescueBeamMat = new THREE.MeshBasicMaterial({
    color: 0x00f5d4,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ghostHoloMat = new THREE.MeshStandardMaterial({
    color: 0x00f5d4,
    emissive: 0x00bbf9,
    emissiveIntensity: 0.75,
    roughness: 0.15,
    metalness: 0.2,
    transparent: true,
    opacity: 0.44,
    depthWrite: false,
  });

  sharedAssets = {
    shadowGeo,
    shadowMat,
    underglowGeo,
    balloonGeo,
    balloonCordGeo,
    rollBarGeo,
    hoverPodGeo,
    f1NoseGeo,
    cyberFinGeo,
    motoTireGeo,
    floorPanGeo,
    mainBodyGeo,
    noseGeo,
    bumperGeo,
    badgeGeo,
    sidePodGeo,
    sideStripeGeo,
    engineDeckGeo,
    strutGeo,
    spoilerWingGeo,
    spoilerTipGeo,
    exhaustGeo,
    exhaustBoreGeo,
    frontTireGeo,
    frontRimGeo,
    lugBarGeo,
    rearTireGeo,
    rearRimGeo,
    steerColGeo,
    steerWheelGeo,
    torsoGeo,
    gloveGeo,
    headGeo,
    helmetGeo,
    helmetStripeGeo,
    visorGeo,
    eyeWhiteGeo,
    eyePupilGeo,
    browGeo,
    noseRoundGeo,
    capDomeGeo,
    capBrimGeo,
    capEmblemGeo,
    stachePartGeo,
    stacheZigGeo,
    pointyEarGeo,
    mushCapGeo,
    mushSpotGeo,
    cheekGeo,
    hairTopGeo,
    ponytailGeo,
    tiaraBandGeo,
    tiaraSpikeGeo,
    dinoSnoutGeo,
    dinoSpikeGeo,
    backShellGeo,
    hornGeo,
    hornBaseGeo,
    fangGeo,
    goggleRimGeo,
    goggleLensGeo,
    cloudPuffGeo,
    rodShaftGeo,
    fishingLineGeo,
    fishingHookGeo,
    crownBandGeo,
    crownSpikeGeo,
    crownGemGeo,
    flameOuterGeo,
    flameInnerGeo,
    sparkGeo,
    smokeGeo,
    turboWaveGeo,
    starRingGeo,
    zapRingGeo,
    rescueBeamGeo,
    ufoDiscGeo,
    shieldDomeGeo,
    shieldCapGeo,
    shieldRimGeo,
    shieldRingGeo,
    shieldBananaGeo,
    shieldPeelGeo,
    windStreakGeo,
    darkChassisMat,
    tireMat,
    chromeMat,
    darkBoreMat,
    skinMat,
    visorMat,
    whiteBadgeMat,
    cartoonStacheMat,
    blondeHairMat,
    fieryHairMat,
    rosyMat,
    plumPurpleMat,
    koopaShellMat,
    redSpotMat,
    cloudWhiteMat,
    rodWoodMat,
    fishingLineMat,
    goldCrownMat,
    rubyGemMat,
    zapYellowMat,
    rescueBeamMat,
    shieldGreenMat,
    shieldRedMat,
    shieldBananaMat,
    shieldTetherMat,
    windStreakMat,
    ghostHoloMat,
  };

  return sharedAssets;
}

function getRacerSpec(racerId) {
  return RACERS.find((r) => r.id === racerId) || RACERS[0];
}

function getBoostStyle(boostColorId) {
  return BOOST_STYLES.find((b) => b.id === boostColorId) || BOOST_STYLES[0];
}

function drawNameplateCanvas(canvas, name, accentHex, isGhost = false) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const label = String(name || 'Pilote').slice(0, 18);
  ctx.font = '800 28px "Fredoka", "Nunito", sans-serif';
  const textW = Math.min(250, ctx.measureText(label).width);
  const pillW = Math.max(120, textW + 46);
  const pillH = 46;
  const px = (canvas.width - pillW) * 0.5;
  const py = (canvas.height - pillH) * 0.5;

  ctx.fillStyle = isGhost ? 'rgba(6, 40, 62, 0.85)' : 'rgba(15, 23, 42, 0.82)';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(px, py, pillW, pillH, 23);
  } else {
    ctx.rect(px, py, pillW, pillH);
  }
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = isGhost ? '#00f5d4' : accentHex || '#ffffff';
  ctx.stroke();

  ctx.fillStyle = isGhost ? '#a5f3fc' : '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width * 0.5, canvas.height * 0.5 + 1);
}

function drawEmoteBubbleCanvas(canvas, iconStr) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Glossy cartoon speech bubble
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.strokeStyle = '#ffbe0b';
  ctx.lineWidth = 8;

  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(20, 14, 88, 78, 28);
  } else {
    ctx.rect(20, 14, 88, 78);
  }
  ctx.fill();
  ctx.stroke();

  // Speech pointer tail at bottom center
  ctx.beginPath();
  ctx.moveTo(52, 88);
  ctx.lineTo(64, 114);
  ctx.lineTo(76, 88);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.font = '52px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(iconStr || '🔥', 64, 55);
}

const DRIFT_SPARK_COLORS = [
  0xf8fafc, // 0: crisp white slide dust
  0x00e5ff, // 1: electric cyan/blue
  0xff7b00, // 2: blazing orange
  0xff2bf2, // 3: ultra-turbo neon magenta/purple
];

/**
 * Creates a complete Toy-Arcade 3D Kart + Racer + V2 FX rig (or translucent Holographic Ghost Kart).
 */
export function createKartVisual(
  racerId = 'red',
  { showNameplate = false, name = '', isGhost = false, kartId = 'classic', boostColorId = 'flame' } = {}
) {
  const A = getSharedKartAssets();
  const spec = getRacerSpec(racerId);

  const root = new THREE.Group();
  root.rotation.order = 'YXZ';

  const primaryMat = isGhost
    ? A.ghostHoloMat
    : new THREE.MeshStandardMaterial({
        color: spec.color,
        roughness: 0.24,
        metalness: 0.12,
      });
  const accentMat = isGhost
    ? A.ghostHoloMat
    : new THREE.MeshStandardMaterial({
        color: spec.accent,
        roughness: 0.28,
        metalness: 0.15,
      });
  const helmetMat = isGhost
    ? A.ghostHoloMat
    : new THREE.MeshStandardMaterial({
        color: spec.helmetColor,
        roughness: 0.18,
        metalness: 0.1,
      });

  const subDarkMat = isGhost ? A.ghostHoloMat : A.darkChassisMat;
  const subTireMat = isGhost ? A.ghostHoloMat : A.tireMat;
  const subChromeMat = isGhost ? A.ghostHoloMat : A.chromeMat;
  const subSkinMat = isGhost
    ? A.ghostHoloMat
    : new THREE.MeshStandardMaterial({
        color: 0xffd6b0,
        roughness: 0.52,
      });
  const subVisorMat = isGhost ? A.ghostHoloMat : A.visorMat;
  const subBadgeMat = isGhost ? A.ghostHoloMat : A.whiteBadgeMat;

  // Contact blob shadow (or cyan hologram ring for Ghost Kart!)
  let blobShadow;
  if (isGhost) {
    blobShadow = new THREE.Mesh(A.starRingGeo, A.rescueBeamMat);
    blobShadow.scale.setScalar(0.82);
    blobShadow.position.y = 0.05;
  } else {
    blobShadow = new THREE.Mesh(A.shadowGeo, A.shadowMat);
    blobShadow.position.y = 0.025;
  }
  root.add(blobShadow);

  // Neon Underglow Disc (`boostColorId`)
  const underglowMat = new THREE.MeshBasicMaterial({
    color: 0xff6b00,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const underglowMesh = new THREE.Mesh(A.underglowGeo, underglowMat);
  underglowMesh.position.y = 0.06;
  underglowMesh.visible = false;

  // Spin / drift-slip yaw container
  const spinRig = new THREE.Group();
  root.add(spinRig);

  // Hop & squash-stretch + shrink rig
  const squashRig = new THREE.Group();
  spinRig.add(squashRig);
  if (!isGhost) squashRig.add(underglowMesh);

  // Stunt 360° flip rig pivoted around kart center of mass (y = 0.5)
  const stuntPivot = new THREE.Group();
  stuntPivot.position.y = 0.5;
  squashRig.add(stuntPivot);

  const stuntContent = new THREE.Group();
  stuntContent.position.y = -0.5;
  stuntPivot.add(stuntContent);

  const chassis = new THREE.Group();
  stuntContent.add(chassis);

  const castShadowFlag = !isGhost;

  // Shared floorpan + 6 selectable Kart Chassis Bodies
  const floorPan = new THREE.Mesh(A.floorPanGeo, subDarkMat);
  floorPan.position.set(0, 0.2, 0.02);
  floorPan.castShadow = castShadowFlag;
  chassis.add(floorPan);

  const kartBodies = {};

  // 1. Classic Kart
  const classicBody = new THREE.Group();
  chassis.add(classicBody);
  kartBodies.classic = classicBody;

  const mainBody = new THREE.Mesh(A.mainBodyGeo, primaryMat);
  mainBody.position.set(0, 0.36, -0.05);
  mainBody.castShadow = castShadowFlag;
  mainBody.receiveShadow = castShadowFlag;
  classicBody.add(mainBody);

  const nose = new THREE.Mesh(A.noseGeo, primaryMat);
  nose.position.set(0, 0.33, 0.78);
  nose.castShadow = castShadowFlag;
  classicBody.add(nose);

  const frontBumper = new THREE.Mesh(A.bumperGeo, accentMat);
  frontBumper.position.set(0, 0.22, 1.15);
  frontBumper.castShadow = castShadowFlag;
  classicBody.add(frontBumper);

  const badge = new THREE.Mesh(A.badgeGeo, subBadgeMat);
  badge.position.set(0, 0.47, 0.86);
  classicBody.add(badge);

  for (const sx of [-1, 1]) {
    const pod = new THREE.Mesh(A.sidePodGeo, primaryMat);
    pod.position.set(sx * 0.58, 0.3, -0.02);
    pod.castShadow = castShadowFlag;
    classicBody.add(pod);

    const stripe = new THREE.Mesh(A.sideStripeGeo, accentMat);
    stripe.position.set(sx * 0.75, 0.32, -0.02);
    classicBody.add(stripe);
  }

  const engineDeck = new THREE.Mesh(A.engineDeckGeo, accentMat);
  engineDeck.position.set(0, 0.52, -0.74);
  engineDeck.castShadow = castShadowFlag;
  classicBody.add(engineDeck);

  for (const sx of [-1, 1]) {
    const strut = new THREE.Mesh(A.strutGeo, subDarkMat);
    strut.position.set(sx * 0.36, 0.74, -0.92);
    strut.rotation.x = 0.22;
    classicBody.add(strut);

    const endplate = new THREE.Mesh(A.spoilerTipGeo, primaryMat);
    endplate.position.set(sx * 0.7, 0.94, -0.98);
    classicBody.add(endplate);
  }

  const spoilerWing = new THREE.Mesh(A.spoilerWingGeo, accentMat);
  spoilerWing.position.set(0, 0.94, -0.98);
  spoilerWing.rotation.x = 0.16;
  spoilerWing.castShadow = castShadowFlag;
  classicBody.add(spoilerWing);

  // 2. Buggy Turbo (tubular roll cage + dune nose + high spoiler)
  const buggyBody = new THREE.Group();
  buggyBody.visible = false;
  chassis.add(buggyBody);
  kartBodies.buggy = buggyBody;

  const bgTub = new THREE.Mesh(A.mainBodyGeo, primaryMat);
  bgTub.position.set(0, 0.38, -0.04);
  bgTub.scale.set(0.92, 0.95, 1.04);
  bgTub.castShadow = castShadowFlag;
  const bgNose = new THREE.Mesh(A.noseGeo, accentMat);
  bgNose.position.set(0, 0.38, 0.82);
  bgNose.scale.set(0.85, 0.78, 1.0);
  const bgCageTop = new THREE.Mesh(A.bumperGeo, subChromeMat);
  bgCageTop.position.set(0, 1.08, -0.35);
  const bgWing = new THREE.Mesh(A.spoilerWingGeo, primaryMat);
  bgWing.position.set(0, 1.08, -0.95);
  bgWing.rotation.x = 0.28;
  buggyBody.add(bgTub, bgNose, bgCageTop, bgWing);
  for (const sx of [-1, 1]) {
    const bar = new THREE.Mesh(A.rollBarGeo, subChromeMat);
    bar.position.set(sx * 0.44, 0.74, -0.35);
    bar.rotation.z = sx * -0.14;
    bar.rotation.x = 0.35;
    buggyBody.add(bar);
  }

  // 3. Cyber Moto (sleek narrow chassis + twin neon side fins)
  const cyberbikeBody = new THREE.Group();
  cyberbikeBody.visible = false;
  chassis.add(cyberbikeBody);
  kartBodies.cyberbike = cyberbikeBody;

  const cbCore = new THREE.Mesh(A.mainBodyGeo, primaryMat);
  cbCore.position.set(0, 0.42, 0.02);
  cbCore.scale.set(0.46, 1.15, 1.28);
  cbCore.castShadow = castShadowFlag;
  const cbNose = new THREE.Mesh(A.f1NoseGeo, accentMat);
  cbNose.position.set(0, 0.42, 0.96);
  cbNose.scale.set(0.82, 0.95, 0.85);
  cyberbikeBody.add(cbCore, cbNose);
  for (const sx of [-1, 1]) {
    const fin = new THREE.Mesh(A.cyberFinGeo, accentMat);
    fin.position.set(sx * 0.28, 0.44, -0.05);
    cyberbikeBody.add(fin);
  }

  // 4. Tank Blindé (armored wide hull + twin ram bumpers + heavy rear turret block)
  const tankBody = new THREE.Group();
  tankBody.visible = false;
  chassis.add(tankBody);
  kartBodies.tank = tankBody;

  const tkHull = new THREE.Mesh(A.mainBodyGeo, primaryMat);
  tkHull.position.set(0, 0.44, 0);
  tkHull.scale.set(1.24, 1.25, 1.16);
  tkHull.castShadow = castShadowFlag;
  const tkRam = new THREE.Mesh(A.bumperGeo, subChromeMat);
  tkRam.position.set(0, 0.28, 1.18);
  tkRam.scale.set(1.22, 1.35, 1.25);
  const tkDeck = new THREE.Mesh(A.engineDeckGeo, accentMat);
  tkDeck.position.set(0, 0.68, -0.68);
  tkDeck.scale.set(1.25, 1.35, 1.2);
  tankBody.add(tkHull, tkRam, tkDeck);
  for (const sx of [-1, 1]) {
    const skirt = new THREE.Mesh(A.cyberFinGeo, subDarkMat);
    skirt.position.set(sx * 0.72, 0.34, 0);
    skirt.scale.set(1.3, 1.1, 1.15);
    tankBody.add(skirt);
  }

  // 5. Aéro-Glisseur (sci-fi saucer hull + stabilizer fins)
  const hoverBody = new THREE.Group();
  hoverBody.visible = false;
  chassis.add(hoverBody);
  kartBodies.hover = hoverBody;

  const hvHull = new THREE.Mesh(A.mainBodyGeo, primaryMat);
  hvHull.position.set(0, 0.4, 0.04);
  hvHull.scale.set(1.08, 0.78, 1.22);
  hvHull.castShadow = castShadowFlag;
  const hvDisc = new THREE.Mesh(A.noseGeo, accentMat);
  hvDisc.position.set(0, 0.38, 0.78);
  hvDisc.scale.set(1.4, 0.65, 0.95);
  const hvWing = new THREE.Mesh(A.spoilerWingGeo, accentMat);
  hvWing.position.set(0, 0.78, -0.92);
  hoverBody.add(hvHull, hvDisc, hvWing);

  // 6. F1 Étoile d'Or (low monoposto nose cone + wide F1 front/rear wings)
  const f1goldBody = new THREE.Group();
  f1goldBody.visible = false;
  chassis.add(f1goldBody);
  kartBodies.f1gold = f1goldBody;

  const f1Mono = new THREE.Mesh(A.mainBodyGeo, primaryMat);
  f1Mono.position.set(0, 0.3, -0.05);
  f1Mono.scale.set(0.68, 0.85, 1.32);
  f1Mono.castShadow = castShadowFlag;
  const f1Cone = new THREE.Mesh(A.f1NoseGeo, primaryMat);
  f1Cone.position.set(0, 0.3, 1.1);
  const f1FrontWing = new THREE.Mesh(A.spoilerWingGeo, accentMat);
  f1FrontWing.position.set(0, 0.17, 1.44);
  f1FrontWing.scale.set(1.06, 0.75, 0.92);
  const f1RearWing = new THREE.Mesh(A.spoilerWingGeo, accentMat);
  f1RearWing.position.set(0, 0.96, -1.04);
  f1RearWing.scale.set(1.16, 1.1, 1.15);
  f1goldBody.add(f1Mono, f1Cone, f1FrontWing, f1RearWing);
  for (const sx of [-1, 1]) {
    const f1Pod = new THREE.Mesh(A.sidePodGeo, accentMat);
    f1Pod.position.set(sx * 0.5, 0.28, -0.08);
    f1Pod.scale.set(0.9, 0.85, 1.15);
    f1goldBody.add(f1Pod);
  }

  // Twin chrome exhaust pipes + turbo flame cones
  const flameRigs = [];
  const flameOuterMat = new THREE.MeshBasicMaterial({
    color: 0xff6b00,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flameInnerMat = new THREE.MeshBasicMaterial({
    color: 0xfff7ae,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  for (const sx of [-1, 1]) {
    const pipeGroup = new THREE.Group();
    pipeGroup.position.set(sx * 0.3, 0.44, -0.98);
    pipeGroup.rotation.x = -Math.PI * 0.5 + 0.32;
    pipeGroup.rotation.z = sx * -0.08;

    const pipe = new THREE.Mesh(A.exhaustGeo, subChromeMat);
    pipe.position.y = 0.22;
    pipe.castShadow = castShadowFlag;
    const bore = new THREE.Mesh(A.exhaustBoreGeo, A.darkBoreMat);
    bore.position.y = 0.46;
    pipeGroup.add(pipe, bore);
    chassis.add(pipeGroup);

    const flameGroup = new THREE.Group();
    flameGroup.position.set(sx * 0.32, 0.55, -1.36);
    flameGroup.rotation.x = -0.22;
    flameGroup.visible = false;
    flameGroup.add(
      new THREE.Mesh(A.flameOuterGeo, flameOuterMat),
      new THREE.Mesh(A.flameInnerGeo, flameInnerMat)
    );
    chassis.add(flameGroup);
    flameRigs.push(flameGroup);
  }

  // Wheels & Hover Pods (swapped dynamically by kartId)
  const fourWheelsGroup = new THREE.Group();
  stuntContent.add(fourWheelsGroup);

  const steerPivots = [];
  const wheelSpinners = [];

  for (const sx of [-1, 1]) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(sx * 0.78, 0.28, 0.75);
    fourWheelsGroup.add(steerPivot);
    steerPivots.push(steerPivot);

    const spinF = new THREE.Group();
    const tireF = new THREE.Mesh(A.frontTireGeo, subTireMat);
    tireF.castShadow = castShadowFlag;
    spinF.add(tireF, new THREE.Mesh(A.frontRimGeo, accentMat), new THREE.Mesh(A.lugBarGeo, subChromeMat));
    steerPivot.add(spinF);
    wheelSpinners.push({ group: spinF, radius: 0.28 });

    const spinR = new THREE.Group();
    spinR.position.set(sx * 0.85, 0.34, -0.72);
    const tireR = new THREE.Mesh(A.rearTireGeo, subTireMat);
    tireR.castShadow = castShadowFlag;
    const lugR = new THREE.Mesh(A.lugBarGeo, subChromeMat);
    lugR.scale.set(1.22, 1.1, 1.15);
    spinR.add(tireR, new THREE.Mesh(A.rearRimGeo, accentMat), lugR);
    fourWheelsGroup.add(spinR);
    wheelSpinners.push({ group: spinR, radius: 0.34 });
  }

  // Cyber Moto center wheels
  const motoWheelsGroup = new THREE.Group();
  motoWheelsGroup.visible = false;
  stuntContent.add(motoWheelsGroup);
  const motoFrontSteer = new THREE.Group();
  motoFrontSteer.position.set(0, 0.36, 0.96);
  motoWheelsGroup.add(motoFrontSteer);
  steerPivots.push(motoFrontSteer);
  const motoSpinF = new THREE.Group();
  motoSpinF.add(new THREE.Mesh(A.motoTireGeo, subTireMat), new THREE.Mesh(A.frontRimGeo, accentMat));
  motoFrontSteer.add(motoSpinF);
  wheelSpinners.push({ group: motoSpinF, radius: 0.36 });

  const motoSpinR = new THREE.Group();
  motoSpinR.position.set(0, 0.36, -0.82);
  motoSpinR.add(new THREE.Mesh(A.motoTireGeo, subTireMat), new THREE.Mesh(A.rearRimGeo, accentMat));
  motoWheelsGroup.add(motoSpinR);
  wheelSpinners.push({ group: motoSpinR, radius: 0.36 });

  // Anti-grav Hover Turbine Pods
  const hoverPodsGroup = new THREE.Group();
  hoverPodsGroup.visible = false;
  stuntContent.add(hoverPodsGroup);
  const hoverMat = isGhost
    ? A.ghostHoloMat
    : new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        emissive: 0x00f5d4,
        emissiveIntensity: 0.9,
        roughness: 0.2,
      });
  for (const [hx, hz] of [
    [-0.78, 0.72],
    [0.78, 0.72],
    [-0.84, -0.7],
    [0.84, -0.7],
  ]) {
    const pod = new THREE.Mesh(A.hoverPodGeo, hoverMat);
    pod.position.set(hx, 0.2, hz);
    hoverPodsGroup.add(pod);
  }

  // Steering column + wheel
  const steerCol = new THREE.Mesh(A.steerColGeo, subDarkMat);
  steerCol.position.set(0, 0.56, 0.38);
  steerCol.rotation.x = -0.55;
  chassis.add(steerCol);

  const steerWheel = new THREE.Mesh(A.steerWheelGeo, subDarkMat);
  steerWheel.position.set(0, 0.7, 0.26);
  steerWheel.rotation.x = -0.55;
  chassis.add(steerWheel);

  // Cute Big-Headed Racer Character + V2 Golden Champion Crown!
  const driverGroup = new THREE.Group();
  driverGroup.position.set(0, 0.5, -0.14);
  chassis.add(driverGroup);

  const torso = new THREE.Mesh(A.torsoGeo, accentMat);
  torso.position.y = 0.16;
  torso.castShadow = castShadowFlag;
  driverGroup.add(torso);

  const gloves = [];
  for (const sx of [-1, 1]) {
    const glove = new THREE.Mesh(A.gloveGeo, subBadgeMat);
    glove.position.set(sx * 0.16, 0.22, 0.35);
    driverGroup.add(glove);
    gloves.push({ mesh: glove, sx });
  }

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.54, 0.02);
  driverGroup.add(headPivot);

  const head = new THREE.Mesh(A.headGeo, subSkinMat);
  head.castShadow = castShadowFlag;
  headPivot.add(head);

  // Expressive Cartoon Eyes (shared across characters!)
  const eyes = [];
  for (const sx of [-1, 1]) {
    const eyeW = new THREE.Mesh(A.eyeWhiteGeo, subBadgeMat);
    eyeW.position.set(sx * 0.115, 0.04, 0.265);
    eyeW.scale.set(0.82, 1.18, 0.7);
    const pupil = new THREE.Mesh(A.eyePupilGeo, subVisorMat);
    pupil.position.set(sx * 0.115, 0.04, 0.295);
    pupil.scale.set(0.85, 1.15, 0.75);
    headPivot.add(eyeW, pupil);
    eyes.push({ eyeW, pupil });
  }

  // Subtle helmet base fallback + character-specific Mario-Kart hats/faces
  const helmet = new THREE.Mesh(A.helmetGeo, helmetMat);
  helmet.position.y = 0.04;
  helmet.rotation.x = -0.18;
  helmet.castShadow = castShadowFlag;
  helmet.visible = false;
  headPivot.add(helmet);

  const charProps = {};
  if (!isGhost) {
    // 1. RED — Super Mariole (plumber cap + round nose + handlebar mustache)
    const gRed = new THREE.Group();
    const mCap = new THREE.Mesh(A.capDomeGeo, helmetMat);
    mCap.position.set(0, 0.04, -0.02);
    mCap.scale.set(1.04, 0.92, 1.06);
    const mBrim = new THREE.Mesh(A.capBrimGeo, helmetMat);
    mBrim.position.set(0, 0.13, 0.18);
    mBrim.rotation.x = -0.12;
    const mBadge = new THREE.Mesh(A.capEmblemGeo, A.whiteBadgeMat);
    mBadge.position.set(0, 0.26, 0.31);
    mBadge.rotation.x = -0.35;
    const mNose = new THREE.Mesh(A.noseRoundGeo, subSkinMat);
    mNose.position.set(0, -0.02, 0.34);
    mNose.scale.set(1.05, 0.9, 1.05);
    gRed.add(mCap, mBrim, mBadge, mNose);
    for (const sx of [-1, 1]) {
      const mStache = new THREE.Mesh(A.stachePartGeo, A.cartoonStacheMat);
      mStache.position.set(sx * 0.1, -0.1, 0.32);
      mStache.rotation.z = sx * 1.15;
      mStache.rotation.y = sx * 0.25;
      gRed.add(mStache);
    }
    headPivot.add(gRed);
    charProps.red = gRed;

    // 2. SUNNY — Wario-Bling (bulky cap + pointy ears + big pink nose + zigzag stache)
    const gSunny = new THREE.Group();
    const wCap = new THREE.Mesh(A.capDomeGeo, helmetMat);
    wCap.position.set(0, 0.05, -0.02);
    wCap.scale.set(1.08, 0.96, 1.08);
    const wBrim = new THREE.Mesh(A.capBrimGeo, A.plumPurpleMat);
    wBrim.position.set(0, 0.13, 0.18);
    wBrim.rotation.x = -0.12;
    const wNose = new THREE.Mesh(A.noseRoundGeo, A.rosyMat);
    wNose.position.set(0, -0.02, 0.35);
    wNose.scale.set(1.28, 1.02, 1.18);
    gSunny.add(wCap, wBrim, wNose);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(A.pointyEarGeo, subSkinMat);
      ear.position.set(sx * 0.34, 0.02, 0.0);
      ear.rotation.z = -sx * 1.1;
      const z1 = new THREE.Mesh(A.stacheZigGeo, A.cartoonStacheMat);
      z1.position.set(sx * 0.1, -0.11, 0.31);
      z1.rotation.z = sx * 0.25;
      const z2 = new THREE.Mesh(A.stacheZigGeo, A.cartoonStacheMat);
      z2.position.set(sx * 0.23, -0.09, 0.28);
      z2.rotation.z = -sx * 0.42;
      gSunny.add(ear, z1, z2);
    }
    headPivot.add(gSunny);
    charProps.sunny = gSunny;

    // 3. AQUA — Champi-Toad (oversized polka-dot mushroom cap + rosy cheeks)
    const gAqua = new THREE.Group();
    const mushDome = new THREE.Mesh(A.mushCapGeo, A.whiteBadgeMat);
    mushDome.position.set(0, 0.16, -0.02);
    mushDome.scale.set(1.18, 0.95, 1.18);
    mushDome.castShadow = castShadowFlag;
    gAqua.add(mushDome);
    const spotOffsets = [
      [0, 0.49, 0.16],
      [0.34, 0.34, 0.12],
      [-0.34, 0.34, 0.12],
      [0.24, 0.35, -0.26],
      [-0.24, 0.35, -0.26],
      [0, 0.38, -0.34],
    ];
    for (const sp of spotOffsets) {
      const spot = new THREE.Mesh(A.mushSpotGeo, A.redSpotMat);
      spot.position.set(sp[0], sp[1], sp[2]);
      spot.scale.setScalar(1.05);
      gAqua.add(spot);
    }
    for (const sx of [-1, 1]) {
      const ch = new THREE.Mesh(A.cheekGeo, A.rosyMat);
      ch.position.set(sx * 0.19, -0.06, 0.23);
      gAqua.add(ch);
    }
    headPivot.add(gAqua);
    charProps.aqua = gAqua;

    // 4. BERRY — Princesse Pêche (golden hair + ponytail + mini royal tiara)
    const gBerry = new THREE.Group();
    const hairTop = new THREE.Mesh(A.hairTopGeo, A.blondeHairMat);
    hairTop.position.set(0, 0.05, -0.02);
    hairTop.scale.set(1.06, 1.0, 1.08);
    const hairTail = new THREE.Mesh(A.ponytailGeo, A.blondeHairMat);
    hairTail.position.set(0, -0.06, -0.34);
    hairTail.rotation.x = -0.65;
    const tBand = new THREE.Mesh(A.tiaraBandGeo, A.goldCrownMat);
    tBand.position.set(0, 0.36, 0.04);
    gBerry.add(hairTop, hairTail, tBand);
    for (let s = -1; s <= 1; s++) {
      const spk = new THREE.Mesh(A.tiaraSpikeGeo, A.goldCrownMat);
      spk.position.set(s * 0.08, 0.44, 0.08);
      gBerry.add(spk);
    }
    for (const sx of [-1, 1]) {
      const earring = new THREE.Mesh(A.crownGemGeo, A.rosyMat);
      earring.position.set(sx * 0.31, -0.08, 0.02);
      earring.scale.setScalar(1.3);
      gBerry.add(earring);
    }
    headPivot.add(gBerry);
    charProps.berry = gBerry;

    // 5. KIWI — Yoshi-Croco (big green snout + puffy cheeks + orange spines + saddle)
    const gKiwi = new THREE.Group();
    const snout = new THREE.Mesh(A.dinoSnoutGeo, subSkinMat);
    snout.position.set(0, -0.02, 0.32);
    snout.scale.set(1.06, 0.92, 1.15);
    gKiwi.add(snout);
    for (const sx of [-1, 1]) {
      const ch = new THREE.Mesh(A.mushSpotGeo, A.whiteBadgeMat);
      ch.position.set(sx * 0.18, -0.08, 0.16);
      ch.scale.set(0.95, 0.82, 0.95);
      gKiwi.add(ch);
    }
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(A.dinoSpikeGeo, A.fieryHairMat);
      fin.position.set(0, 0.25 - i * 0.14, -0.22 - i * 0.1);
      fin.rotation.x = -0.95 - i * 0.2;
      gKiwi.add(fin);
    }
    const ySaddle = new THREE.Mesh(A.backShellGeo, A.redSpotMat);
    ySaddle.position.set(0, -0.34, -0.28);
    ySaddle.scale.set(0.92, 0.95, 0.72);
    gKiwi.add(ySaddle);
    headPivot.add(gKiwi);
    charProps.kiwi = gKiwi;

    // 6. COSMIC — Koopa-Boss (twin curved horns + fiery mohawk + furrowed brows + spiked shell)
    const gCosmic = new THREE.Group();
    for (const sx of [-1, 1]) {
      const hornB = new THREE.Mesh(A.hornBaseGeo, A.whiteBadgeMat);
      hornB.position.set(sx * 0.2, 0.22, 0.02);
      hornB.rotation.z = -sx * 0.55;
      const horn = new THREE.Mesh(A.hornGeo, A.whiteBadgeMat);
      horn.position.set(sx * 0.28, 0.31, 0.04);
      horn.rotation.z = -sx * 0.62;
      horn.rotation.x = 0.25;
      const brow = new THREE.Mesh(A.browGeo, A.fieryHairMat);
      brow.position.set(sx * 0.12, 0.12, 0.28);
      brow.rotation.z = sx * 0.32;
      const fang = new THREE.Mesh(A.fangGeo, A.whiteBadgeMat);
      fang.position.set(sx * 0.08, -0.11, 0.33);
      fang.rotation.x = Math.PI;
      gCosmic.add(hornB, horn, brow, fang);
    }
    const kHair = new THREE.Mesh(A.dinoSpikeGeo, A.fieryHairMat);
    kHair.position.set(0, 0.34, 0.08);
    kHair.scale.set(1.5, 1.35, 1.6);
    const kSnout = new THREE.Mesh(A.dinoSnoutGeo, A.goldCrownMat);
    kSnout.position.set(0, -0.05, 0.26);
    kSnout.scale.set(1.1, 0.68, 0.85);
    const kShell = new THREE.Mesh(A.backShellGeo, A.koopaShellMat);
    kShell.position.set(0, -0.34, -0.3);
    kShell.scale.set(1.12, 1.08, 0.8);
    gCosmic.add(kHair, kSnout, kShell);
    for (let s = 0; s < 3; s++) {
      const spk = new THREE.Mesh(A.dinoSpikeGeo, A.whiteBadgeMat);
      spk.position.set(0, -0.22 - s * 0.12, -0.52);
      spk.rotation.x = -Math.PI * 0.5 + (s - 1) * 0.32;
      gCosmic.add(spk);
    }
    headPivot.add(gCosmic);
    charProps.cosmic = gCosmic;
  }

  // Golden 3D Champion Crown (`kart.hasCrown`)
  const crownGroup = new THREE.Group();
  crownGroup.position.set(0, 0.54, -0.02);
  crownGroup.visible = false;
  if (!isGhost) {
    const band = new THREE.Mesh(A.crownBandGeo, A.goldCrownMat);
    crownGroup.add(band);
    for (let c = 0; c < 5; c++) {
      const ca = (c / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(A.crownSpikeGeo, A.goldCrownMat);
      spike.position.set(Math.cos(ca) * 0.17, 0.12, Math.sin(ca) * 0.17);
      crownGroup.add(spike);
      const gem = new THREE.Mesh(A.crownGemGeo, A.rubyGemMat);
      gem.position.set(Math.cos(ca) * 0.195, 0.0, Math.sin(ca) * 0.195);
      crownGroup.add(gem);
    }
  }
  headPivot.add(crownGroup);

  // Star Rainbow Aura Halo
  const starAuraMat = new THREE.MeshBasicMaterial({
    color: 0xffe600,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const starAuraGroup = new THREE.Group();
  starAuraGroup.position.y = 0.55;
  starAuraGroup.visible = false;
  const starRing1 = new THREE.Mesh(A.starRingGeo, starAuraMat);
  const starRing2 = new THREE.Mesh(A.starRingGeo, starAuraMat);
  starRing2.rotation.x = 0.45;
  starRing2.scale.setScalar(0.85);
  starAuraGroup.add(starRing1, starRing2);
  squashRig.add(starAuraGroup);

  // V2 Lightning Shrink Yellow Electric Zaps (`kart.shrinkTimer > 0`)
  const electricGroup = new THREE.Group();
  electricGroup.position.y = 0.65;
  electricGroup.visible = false;
  const zapMeshes = [];
  if (!isGhost) {
    for (let z = 0; z < 3; z++) {
      const zm = new THREE.Mesh(A.zapRingGeo, A.zapYellowMat);
      electricGroup.add(zm);
      zapMeshes.push(zm);
    }
  }
  squashRig.add(electricGroup);

  // Funny Lakitu-style 3D Cloud Fisherman & Fishing Pole (`kart.fallTimer > 0`)
  const rescueGroup = new THREE.Group();
  rescueGroup.visible = false;
  if (!isGhost) {
    const cloudRig = new THREE.Group();
    cloudRig.position.set(0.65, 2.72, 0.25);

    const cloudPuffOffsets = [
      [0, 0, 0, 1.05, 0.72, 0.92],
      [-0.32, -0.04, 0.05, 0.72, 0.58, 0.7],
      [0.32, -0.04, -0.05, 0.72, 0.58, 0.7],
      [0, 0.04, 0.26, 0.65, 0.52, 0.65],
      [0, 0.04, -0.26, 0.65, 0.52, 0.65],
    ];
    for (const cp of cloudPuffOffsets) {
      const puff = new THREE.Mesh(A.cloudPuffGeo, A.cloudWhiteMat);
      puff.position.set(cp[0], cp[1], cp[2]);
      puff.scale.set(cp[3], cp[4], cp[5]);
      cloudRig.add(puff);
    }

    // Funny Cloud Driver with shell back + big aviator goggles!
    const fishermanBody = new THREE.Mesh(A.backShellGeo, A.koopaShellMat);
    fishermanBody.position.set(0.05, 0.36, -0.08);
    fishermanBody.scale.set(0.88, 0.85, 0.88);
    const fishermanHead = new THREE.Mesh(A.headGeo, A.goldCrownMat);
    fishermanHead.position.set(-0.02, 0.62, 0.04);
    fishermanHead.scale.setScalar(0.74);
    cloudRig.add(fishermanBody, fishermanHead);

    for (const sx of [-1, 1]) {
      const rim = new THREE.Mesh(A.goggleRimGeo, A.darkChassisMat);
      rim.position.set(-0.02 + sx * 0.09, 0.66, 0.24);
      const lens = new THREE.Mesh(A.goggleLensGeo, A.whiteBadgeMat);
      lens.position.set(-0.02 + sx * 0.09, 0.66, 0.245);
      cloudRig.add(rim, lens);
    }

    // Angled 3D fishing pole reaching above the kart center (0, 3.35, 0)
    const polePivot = new THREE.Group();
    polePivot.position.set(0.45, 3.18, 0.22);
    polePivot.rotation.set(-0.22, 0, 0.52);
    const rod = new THREE.Mesh(A.rodShaftGeo, A.rodWoodMat);
    rod.position.y = 0.55;
    polePivot.add(rod);

    // Taut vertical fishing line & metallic hook down to kart
    const line = new THREE.Mesh(A.fishingLineGeo, A.fishingLineMat);
    line.position.set(0, 2.08, 0);
    const hook = new THREE.Mesh(A.fishingHookGeo, A.chromeMat);
    hook.position.set(0, 0.84, 0);
    hook.rotation.z = Math.PI * 0.85;
    const haloRing = new THREE.Mesh(A.rescueBeamGeo, A.rescueBeamMat);
    haloRing.position.y = 0.12;

    rescueGroup.add(cloudRig, polePivot, line, hook, haloRing);
  }
  root.add(rescueGroup);

  // Drift Sparks Particle Pool behind rear tires
  const sparkMat = new THREE.MeshBasicMaterial({
    color: DRIFT_SPARK_COLORS[0],
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sparksGroup = new THREE.Group();
  spinRig.add(sparksGroup);

  // V3 Trailing Shield behind rear bumper (z = -1.65)
  const shieldGroup = new THREE.Group();
  shieldGroup.position.set(0, 0.02, -1.65);
  shieldGroup.visible = false;
  let shieldBanana = null;
  let shieldGreenShell = null;
  let shieldRedShell = null;
  let shieldRing = null;

  if (!isGhost) {
    shieldRing = new THREE.Mesh(A.shieldRingGeo, A.shieldTetherMat);
    shieldRing.position.y = 0.04;
    shieldGroup.add(shieldRing);

    shieldBanana = new THREE.Group();
    const bBody = new THREE.Mesh(A.shieldBananaGeo, A.shieldBananaMat);
    const bPeel = new THREE.Mesh(A.shieldPeelGeo, A.shieldBananaMat);
    bPeel.position.y = 0.08;
    shieldBanana.add(bBody, bPeel);
    shieldGroup.add(shieldBanana);

    const buildMiniShell = (shellMat) => {
      const sg = new THREE.Group();
      sg.position.y = 0.28;
      const d = new THREE.Mesh(A.shieldDomeGeo, shellMat);
      d.position.y = 0.06;
      const c = new THREE.Mesh(A.shieldCapGeo, shellMat);
      c.position.y = 0.24;
      const r = new THREE.Mesh(A.shieldRimGeo, A.whiteBadgeMat);
      r.position.y = -0.04;
      sg.add(d, c, r);
      return sg;
    };

    shieldGreenShell = buildMiniShell(A.shieldGreenMat);
    shieldRedShell = buildMiniShell(A.shieldRedMat);
    shieldGroup.add(shieldGreenShell, shieldRedShell);
  }
  spinRig.add(shieldGroup);

  // V3 Slipstream / Aspiration Wind Streaks (`kart.drafting === true`)
  const draftGroup = new THREE.Group();
  draftGroup.visible = false;
  const windStreaks = [];
  if (!isGhost) {
    const streakSlots = [
      [-1.08, 0.42],
      [1.08, 0.42],
      [-0.96, 0.85],
      [0.96, 0.85],
      [-0.58, 1.18],
      [0.58, 1.18],
      [-1.18, 0.62],
      [1.18, 0.62],
    ];
    for (let i = 0; i < streakSlots.length; i++) {
      const sm = new THREE.Mesh(A.windStreakGeo, A.windStreakMat);
      const [sx, sy] = streakSlots[i];
      const sz = 1.6 - (i / streakSlots.length) * 3.4;
      sm.position.set(sx, sy, sz);
      draftGroup.add(sm);
      windStreaks.push({ mesh: sm, baseX: sx, baseY: sy, z: sz, speed: 26 + (i % 3) * 5 });
    }
  }
  spinRig.add(draftGroup);

  const SPARK_COUNT = isGhost ? 0 : 16;
  const sparks = [];
  for (let i = 0; i < SPARK_COUNT; i++) {
    const mesh = new THREE.Mesh(A.sparkGeo, sparkMat);
    mesh.visible = false;
    sparksGroup.add(mesh);
    sparks.push({
      mesh,
      side: i % 2 === 0 ? -1 : 1,
      age: (i / SPARK_COUNT) * 0.24,
      life: 0.24,
      vx: 0,
      vy: 0,
      vz: 0,
    });
  }

  // Pre-allocated Cartoon Smoke Puff Pool (drift, landing, rocket start)
  const smokeMat = isGhost
    ? null
    : new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.92,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      });
  const smokeGroup = new THREE.Group();
  spinRig.add(smokeGroup);
  const SMOKE_COUNT = isGhost ? 0 : 16;
  const smokePuffs = [];
  for (let i = 0; i < SMOKE_COUNT; i++) {
    const mesh = new THREE.Mesh(A.smokeGeo, smokeMat);
    mesh.visible = false;
    smokeGroup.add(mesh);
    smokePuffs.push({
      mesh,
      active: false,
      age: 0,
      life: 0.45,
      vx: 0,
      vy: 0,
      vz: 0,
      maxScale: 1.0,
    });
  }

  // Mini-Turbo Release Shockwave Ring
  const turboWaveMat = isGhost
    ? null
    : new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
  const turboWaveMesh = isGhost ? null : new THREE.Mesh(A.turboWaveGeo, turboWaveMat);
  if (turboWaveMesh) {
    turboWaveMesh.position.y = 0.22;
    turboWaveMesh.visible = false;
    squashRig.add(turboWaveMesh);
  }

  // Floating Nameplate Sprite
  const nameplateCanvas = document.createElement('canvas');
  nameplateCanvas.width = 288;
  nameplateCanvas.height = 64;
  const nameplateTex = new THREE.CanvasTexture(nameplateCanvas);
  nameplateTex.colorSpace = THREE.SRGBColorSpace;
  const nameplateMat = new THREE.SpriteMaterial({
    map: nameplateTex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const nameplateSprite = new THREE.Sprite(nameplateMat);
  nameplateSprite.position.set(0, 2.24, 0);
  nameplateSprite.scale.set(2.7, 0.6, 1);
  nameplateSprite.visible = Boolean(showNameplate && name);
  if (name) {
    drawNameplateCanvas(nameplateCanvas, name, spec.color, isGhost);
    nameplateTex.needsUpdate = true;
  }
  root.add(nameplateSprite);

  // V2 Floating 3D Emote Speech Bubble Sprite (`kart.emote`)
  const emoteCanvas = document.createElement('canvas');
  emoteCanvas.width = 128;
  emoteCanvas.height = 128;
  const emoteTex = new THREE.CanvasTexture(emoteCanvas);
  emoteTex.colorSpace = THREE.SRGBColorSpace;
  const emoteMat = new THREE.SpriteMaterial({
    map: emoteTex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const emoteSprite = new THREE.Sprite(emoteMat);
  emoteSprite.position.set(0, 2.95, 0);
  emoteSprite.scale.set(1.25, 1.25, 1);
  emoteSprite.visible = false;
  root.add(emoteSprite);

  // V4 Battle Arena 3D Floating Balloons (rear)
  const balloonsGroup = new THREE.Group();
  balloonsGroup.position.set(0, 1.25, -1.05);
  balloonsGroup.visible = false;
  const balloonMeshes = [];
  const balloonMats = [];
  if (!isGhost) {
    const bColors = [0xff2a54, 0x3b82f6, 0xffe600];
    const bOffsets = [
      [-0.36, 0.16, 0],
      [0, 0.38, -0.08],
      [0.36, 0.16, 0],
    ];
    for (let i = 0; i < 3; i++) {
      const bMat = new THREE.MeshStandardMaterial({
        color: bColors[i],
        emissive: bColors[i],
        emissiveIntensity: 0.22,
        roughness: 0.15,
        metalness: 0.1,
      });
      const bSlot = new THREE.Group();
      bSlot.position.set(bOffsets[i][0], bOffsets[i][1], bOffsets[i][2]);
      const sphere = new THREE.Mesh(A.balloonGeo, bMat);
      const cord = new THREE.Mesh(A.balloonCordGeo, A.whiteBadgeMat);
      cord.position.y = -0.34;
      bSlot.add(sphere, cord);
      balloonsGroup.add(bSlot);
      balloonMeshes.push(bSlot);
      balloonMats.push(bMat);
    }
  }
  chassis.add(balloonsGroup);

  const visObj = {
    root,
    isGhost,
    racerId: spec.id,
    kartId: kartId || 'classic',
    boostColorId: boostColorId || 'flame',
    lastLabel: name || '',
    lastEmoteIcon: '',
    primaryMat,
    accentMat,
    helmetMat,
    skinMat: subSkinMat,
    hoverMat,
    underglowMat,
    underglowMesh,
    kartBodies,
    fourWheelsGroup,
    motoWheelsGroup,
    hoverPodsGroup,
    balloonsGroup,
    balloonMeshes,
    balloonMats,
    charProps,
    flameOuterMat,
    flameInnerMat,
    sparkMat,
    starAuraMat,
    nameplateCanvas,
    nameplateTex,
    nameplateMat,
    nameplateSprite,
    emoteCanvas,
    emoteTex,
    emoteMat,
    emoteSprite,
    spinRig,
    squashRig,
    stuntPivot,
    chassis,
    steerPivots,
    wheelSpinners,
    steerWheel,
    headPivot,
    eyes,
    gloves,
    crownGroup,
    flameRigs,
    starAuraGroup,
    electricGroup,
    zapMeshes,
    rescueGroup,
    shieldGroup,
    shieldBanana,
    shieldGreenShell,
    shieldRedShell,
    shieldRing,
    draftGroup,
    windStreaks,
    sparks,
    smokeMat,
    smokePuffs,
    turboWaveMat,
    turboWaveMesh,
    // Animation state
    smoothSteer: 0,
    driftVisualYaw: 0,
    spinAngle: 0,
    prevHop: 0,
    squashAmp: 0,
    squashPhase: 0,
    wasBoosting: false,
    wasAirborne: false,
    prevDrifting: false,
    prevDriftCharge: 0,
    prevBoostTimer: 0,
    prevRocketCharge: 0,
    prevSpeed: 0,
    smokeEmitTimer: 0,
    smokeSideToggle: 1,
    turboWaveTimer: 0,
    turboWaveDuration: 0.42,
    blinkTimer: 1.4 + Math.random() * 2.4,
    blinkAnim: 0,
    hasPrevSkid: false,
    prevSkidL: { x: 0, y: 0, z: 0 },
    prevSkidR: { x: 0, y: 0, z: 0 },
    shrinkScale: 1.0,
    pitch: 0,
  };

  applyCharacterVariant(visObj, spec.id);
  applyKartVariant(visObj, visObj.kartId);
  applyBoostVisualStyle(visObj, visObj.boostColorId);
  return visObj;
}

function applyKartVariant(kartVis, kartId = 'classic') {
  if (!kartVis || !kartVis.kartBodies) return;
  const activeId = kartVis.kartBodies[kartId] ? kartId : 'classic';
  kartVis.kartId = activeId;
  for (const [k, grp] of Object.entries(kartVis.kartBodies)) {
    grp.visible = k === activeId;
  }
  if (kartVis.fourWheelsGroup) {
    kartVis.fourWheelsGroup.visible = activeId !== 'cyberbike' && activeId !== 'hover';
    const wScale = activeId === 'buggy' ? 1.18 : activeId === 'tank' ? 1.12 : activeId === 'f1gold' ? 0.96 : 1.0;
    kartVis.fourWheelsGroup.scale.setScalar(wScale);
  }
  if (kartVis.motoWheelsGroup) {
    kartVis.motoWheelsGroup.visible = activeId === 'cyberbike';
  }
  if (kartVis.hoverPodsGroup) {
    kartVis.hoverPodsGroup.visible = activeId === 'hover';
  }
}

function applyBoostVisualStyle(kartVis, boostColorId = 'flame') {
  if (!kartVis) return;
  const style = getBoostStyle(boostColorId);
  kartVis.boostColorId = style.id;
  if (!kartVis.isGhost && kartVis.underglowMesh && kartVis.underglowMat) {
    if (style.id === 'flame') {
      kartVis.underglowMesh.visible = false;
    } else {
      kartVis.underglowMesh.visible = true;
      kartVis.underglowMat.color.set(style.underglow || '#ff9e00');
    }
  }
  if (kartVis.flameInnerMat) {
    kartVis.flameInnerMat.color.set(style.coreColor || '#ffe066');
  }
}

const SKIN_COLOR_BY_RACER = {
  kiwi: 0x4ad66d,
  cosmic: 0xaacc00,
};

function applyCharacterVariant(kartVis, racerId) {
  if (!kartVis || kartVis.isGhost) return;
  if (kartVis.skinMat) {
    kartVis.skinMat.color.setHex(SKIN_COLOR_BY_RACER[racerId] || 0xffd6b0);
  }
  if (kartVis.charProps) {
    for (const [key, grp] of Object.entries(kartVis.charProps)) {
      grp.visible = key === racerId;
    }
  }
}

export function setKartRacerTheme(kartVis, racerId, kartId = undefined, boostColorId = undefined) {
  if (!kartVis) return;
  if (!kartVis.isGhost && racerId && kartVis.racerId !== racerId) {
    const spec = getRacerSpec(racerId);
    kartVis.racerId = spec.id;
    kartVis.primaryMat.color.set(spec.color);
    kartVis.accentMat.color.set(spec.accent);
    kartVis.helmetMat.color.set(spec.helmetColor);
    applyCharacterVariant(kartVis, spec.id);
    if (kartVis.lastLabel) {
      drawNameplateCanvas(kartVis.nameplateCanvas, kartVis.lastLabel, spec.color, false);
      kartVis.nameplateTex.needsUpdate = true;
    }
  }
  if (kartId && kartVis.kartId !== kartId) {
    applyKartVariant(kartVis, kartId);
  }
  if (boostColorId && kartVis.boostColorId !== boostColorId) {
    applyBoostVisualStyle(kartVis, boostColorId);
  }
}

const tmpHSLColor = new THREE.Color();
const blackColor = new THREE.Color(0x000000);

function _spawnSmokePuff(kartVis, x, y, z, vx, vy, vz, maxScale = 1.0, life = 0.46) {
  const puffs = kartVis.smokePuffs;
  if (!puffs || puffs.length === 0) return;

  let slot = null;
  let oldestScore = -1;
  for (let i = 0; i < puffs.length; i++) {
    const p = puffs[i];
    if (!p.active) {
      slot = p;
      break;
    }
    const score = p.age / p.life;
    if (score > oldestScore) {
      oldestScore = score;
      slot = p;
    }
  }
  if (!slot) return;

  slot.active = true;
  slot.age = 0;
  slot.life = life;
  slot.vx = vx;
  slot.vy = vy;
  slot.vz = vz;
  slot.maxScale = maxScale;
  slot.mesh.position.set(x, y, z);
  slot.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  slot.mesh.scale.setScalar(0.24 * maxScale);
  slot.mesh.visible = true;
}

/**
 * Updates kart pose, wheels, head lean, crown, emote bubble, stunt flip, shrink zaps, void rescue beam, drift sparks, boost flames & star aura!
 */
export function updateKartVisual(
  kartVis,
  kartState,
  dt,
  elapsed,
  isLocal = false,
  trackId = 'coco'
) {
  if (!kartVis || !kartState) return;

  if (!kartVis.isGhost) {
    const nextRacer = kartState.racerId || kartVis.racerId;
    const nextKart = kartState.kartId || kartVis.kartId;
    const nextBoost = kartState.boostColorId || kartVis.boostColorId;
    if (
      nextRacer !== kartVis.racerId ||
      nextKart !== kartVis.kartId ||
      nextBoost !== kartVis.boostColorId
    ) {
      setKartRacerTheme(kartVis, nextRacer, nextKart, nextBoost);
    }
  }

  // Elimination / visibility in Knockout & Battle Arena
  if (!kartVis.isGhost) {
    kartVis.root.visible = !kartState.eliminated;
    if (kartState.eliminated) return;
  }

  // Ditch/Void Fall sink & Cloud Fisherman Rescue (`kart.fallTimer > 0`: 0.90s plunge + 0.75s hoist)
  const fallTimer = kartState.fallTimer || 0;
  if (fallTimer > 0 && !kartVis.isGhost) {
    if (fallTimer <= 0.95) {
      kartVis.rescueGroup.visible = true;
      kartVis.rescueGroup.position.y = Math.sin(elapsed * 8.5) * 0.12;
      kartVis.rescueGroup.rotation.y = Math.sin(elapsed * 2.2) * 0.14;
    } else {
      kartVis.rescueGroup.visible = false;
    }
  } else {
    kartVis.rescueGroup.visible = false;
  }

  kartVis.root.position.set(kartState.x || 0, kartState.y || 0, kartState.z || 0);
  kartVis.root.rotation.y = kartState.yaw || 0;

  // Road slope pitch alignment (plunge nose-down on fall, level out on hoist/airborne)
  if (fallTimer > 0.75) {
    kartVis.pitch = THREE.MathUtils.lerp(kartVis.pitch, 0.55, 1 - Math.exp(-9 * dt));
    kartVis.root.rotation.x = kartVis.pitch;
  } else if (fallTimer > 0) {
    kartVis.pitch = THREE.MathUtils.lerp(kartVis.pitch, 0, 1 - Math.exp(-10 * dt));
    kartVis.root.rotation.x = kartVis.pitch;
  } else if (kartState.airborne) {
    const vyPitch = THREE.MathUtils.clamp(-(kartState.vy || 0) * 0.022, -0.35, 0.35);
    kartVis.pitch = THREE.MathUtils.lerp(kartVis.pitch, vyPitch, 1 - Math.exp(-10 * dt));
    kartVis.root.rotation.x = kartVis.pitch;
  } else if (isArenaTrack(trackId)) {
    kartVis.pitch = THREE.MathUtils.lerp(kartVis.pitch, 0, 1 - Math.exp(-14 * dt));
    kartVis.root.rotation.x = kartVis.pitch;
  } else if (typeof kartState.progress === 'number' && Number.isFinite(kartState.progress)) {
    const tFrac = ((kartState.progress % 1) + 1) % 1;
    const s = getTrackSample(tFrac, trackId);
    const hLen = Math.hypot(s.tx, s.tz) || 1;
    const targetPitch = -Math.atan2(s.ty || 0, hLen);
    kartVis.pitch = THREE.MathUtils.lerp(kartVis.pitch, targetPitch, 1 - Math.exp(-14 * dt));
    kartVis.root.rotation.x = kartVis.pitch;
  }

  // Nameplate visibility & text
  const showName = (kartVis.isGhost || !isLocal) && Boolean(kartState.name);
  kartVis.nameplateSprite.visible = showName;
  if (showName && kartState.name !== kartVis.lastLabel) {
    kartVis.lastLabel = kartState.name;
    const spec = getRacerSpec(kartVis.racerId);
    drawNameplateCanvas(kartVis.nameplateCanvas, kartState.name, spec.color, kartVis.isGhost);
    kartVis.nameplateTex.needsUpdate = true;
  }

  if (kartVis.isGhost) {
    for (const w of kartVis.wheelSpinners) {
      w.group.rotation.x += 28 * dt;
    }
    return;
  }

  // V3 Invulnerability Blink (`kart.invulnTimer > 0 && spinoutTimer <= 0`)
  const invulnTimer = kartState.invulnTimer || 0;
  const activeSpin = kartState.spinoutTimer || 0;
  if (invulnTimer > 0 && activeSpin <= 0) {
    kartVis.stuntPivot.visible = Math.floor(elapsed * 20) % 2 === 0;
  } else {
    kartVis.stuntPivot.visible = true;
  }

  // V3 Trailing 3D Shield (`kart.shieldItem`)
  const shieldItem = kartState.shieldItem || null;
  if (shieldItem && kartVis.shieldGroup) {
    kartVis.shieldGroup.visible = true;
    if (kartVis.shieldBanana) {
      kartVis.shieldBanana.visible = shieldItem === 'banana';
      if (kartVis.shieldBanana.visible) {
        kartVis.shieldBanana.rotation.z = Math.sin(elapsed * 6) * 0.1;
        kartVis.shieldBanana.position.y = Math.abs(Math.sin(elapsed * 7)) * 0.08;
      }
    }
    if (kartVis.shieldGreenShell) {
      kartVis.shieldGreenShell.visible = shieldItem === 'green_shell';
      if (kartVis.shieldGreenShell.visible) kartVis.shieldGreenShell.rotation.y += dt * 16;
    }
    if (kartVis.shieldRedShell) {
      kartVis.shieldRedShell.visible = shieldItem === 'red_shell';
      if (kartVis.shieldRedShell.visible) kartVis.shieldRedShell.rotation.y += dt * 16;
    }
    if (kartVis.shieldRing) {
      kartVis.shieldRing.scale.setScalar(0.92 + Math.sin(elapsed * 10) * 0.12);
    }
  } else if (kartVis.shieldGroup) {
    kartVis.shieldGroup.visible = false;
  }

  // V3 Slipstream / Aspiration Wind Streaks (`kart.drafting === true`)
  if (kartState.drafting && kartVis.draftGroup) {
    kartVis.draftGroup.visible = true;
    for (let i = 0; i < kartVis.windStreaks.length; i++) {
      const ws = kartVis.windStreaks[i];
      ws.z -= ws.speed * dt;
      if (ws.z < -2.0) ws.z += 3.7;
      ws.mesh.position.set(
        ws.baseX + Math.sin(elapsed * 16 + i) * 0.05,
        ws.baseY + Math.cos(elapsed * 14 + i) * 0.04,
        ws.z
      );
      const fade = 1 - Math.abs(ws.z + 0.15) / 2.1;
      ws.mesh.scale.set(1, 1, Math.max(0.25, fade * 1.25));
    }
  } else if (kartVis.draftGroup) {
    kartVis.draftGroup.visible = false;
  }

  // Golden 3D Champion Crown (`kart.hasCrown`)
  kartVis.crownGroup.visible = Boolean(kartState.hasCrown);
  if (kartVis.crownGroup.visible) {
    kartVis.crownGroup.rotation.y = elapsed * 1.8;
  }

  // Floating 3D Emote Bubble (`kart.emote`)
  const emote = kartState.emote;
  if (emote && (emote.timer === undefined || emote.timer > 0)) {
    const icon =
      emote.icon || EMOTES.find((e) => e.id === emote.id)?.icon || '🔥';
    if (icon !== kartVis.lastEmoteIcon) {
      kartVis.lastEmoteIcon = icon;
      drawEmoteBubbleCanvas(kartVis.emoteCanvas, icon);
      kartVis.emoteTex.needsUpdate = true;
    }
    kartVis.emoteSprite.visible = true;
    const rem = emote.timer ?? 1.0;
    const popIn = rem > 1.9 ? Math.min(1.2, (2.25 - rem) / 0.3) : 1.0;
    const popOut = rem < 0.25 ? Math.max(0.01, rem / 0.25) : 1.0;
    const bounce = 1 + Math.sin(elapsed * 12) * 0.08;
    const s = popIn * popOut * bounce * 1.25;
    kartVis.emoteSprite.scale.set(s, s, 1);
    kartVis.emoteSprite.position.y = 2.92 + Math.abs(Math.sin(elapsed * 8)) * 0.16;
  } else {
    kartVis.emoteSprite.visible = false;
  }

  // Steering & Driver Head Lean
  const rawSteer = Math.max(-1, Math.min(1, kartState.steer || 0));
  kartVis.smoothSteer = THREE.MathUtils.lerp(kartVis.smoothSteer, rawSteer, 1 - Math.exp(-15 * dt));

  const wheelSteerAngle = -kartVis.smoothSteer * 0.42;
  for (const sp of kartVis.steerPivots) {
    sp.rotation.y = wheelSteerAngle;
  }
  kartVis.steerWheel.rotation.z = kartVis.smoothSteer * 0.55;

  const speed = kartState.speed || 0;
  const speedRatio = Math.min(1.4, Math.abs(speed) / (RACE_CONFIG.KART_MAX_SPEED || 42));
  const isWinner = Boolean(kartState.finished) && kartState.rank === 1;
  const boostWiggle = (kartState.boostTimer || 0) > 0 ? Math.sin(elapsed * 26) * 0.09 : 0;

  if (isWinner) {
    kartVis.headPivot.rotation.z = Math.sin(elapsed * 7.5) * 0.18;
    kartVis.headPivot.rotation.y = Math.sin(elapsed * 4.2) * 0.36;
    kartVis.headPivot.rotation.x = -0.08 + Math.sin(elapsed * 11) * 0.12;
    kartVis.headPivot.position.y = 0.56 + Math.abs(Math.sin(elapsed * 8.5)) * 0.05;
  } else {
    kartVis.headPivot.rotation.z = kartVis.smoothSteer * 0.25 + boostWiggle;
    kartVis.headPivot.rotation.y = -kartVis.smoothSteer * 0.2 + ((kartState.spinoutTimer || 0) > 0 ? Math.sin(elapsed * 18) * 0.3 : 0);
    kartVis.headPivot.rotation.x = (kartState.boostTimer || 0) > 0 ? -0.1 : 0;
    kartVis.headPivot.position.y = 0.54 + Math.sin(elapsed * 18) * 0.008 * speedRatio;
  }

  // Driver Eye Blinking
  if (kartVis.eyes && kartVis.eyes.length > 0) {
    kartVis.blinkTimer -= dt;
    if (kartVis.blinkTimer <= 0) {
      kartVis.blinkAnim = 0.14;
      kartVis.blinkTimer = 1.9 + Math.random() * 2.8;
    }
    let eyeScaleY = 1;
    if (kartVis.blinkAnim > 0) {
      kartVis.blinkAnim = Math.max(0, kartVis.blinkAnim - dt);
      const blinkWave = Math.sin((kartVis.blinkAnim / 0.14) * Math.PI);
      eyeScaleY = Math.max(0.08, 1 - blinkWave * 0.92);
    }
    for (let i = 0; i < kartVis.eyes.length; i++) {
      const e = kartVis.eyes[i];
      e.eyeW.scale.y = eyeScaleY;
      e.pupil.scale.y = eyeScaleY;
    }
  }

  // Driver Gloves / Rank-1 Victory Celebration
  if (kartVis.gloves && kartVis.gloves.length > 0) {
    if (isWinner) {
      for (let i = 0; i < kartVis.gloves.length; i++) {
        const g = kartVis.gloves[i];
        g.mesh.position.set(
          g.sx * 0.34,
          0.72 + Math.abs(Math.sin(elapsed * 10 + i * 1.4)) * 0.24,
          0.12 + Math.cos(elapsed * 8 + i) * 0.06
        );
      }
    } else {
      for (let i = 0; i < kartVis.gloves.length; i++) {
        const g = kartVis.gloves[i];
        g.mesh.position.set(g.sx * 0.16, 0.22, 0.35);
      }
    }
  }

  for (const w of kartVis.wheelSpinners) {
    w.group.rotation.x += (speed * dt) / w.radius;
  }

  // V2 Stunt 360° Flip (`kart.stuntTimer > 0`)
  const stuntTimer = kartState.stuntTimer || 0;
  if (stuntTimer > 0) {
    const u = Math.max(0, Math.min(1, 1 - stuntTimer / 0.55));
    kartVis.stuntPivot.rotation.x = -u * Math.PI * 2;
    kartVis.stuntPivot.rotation.z = Math.sin(u * Math.PI) * 0.28;
  } else {
    kartVis.stuntPivot.rotation.x = 0;
    kartVis.stuntPivot.rotation.z = 0;
  }

  // V2 Lightning Shrink (`kart.shrinkTimer > 0`)
  const shrinkTimer = kartState.shrinkTimer || 0;
  const targetShrink = shrinkTimer > 0 ? 0.55 : 1.0;
  kartVis.shrinkScale = THREE.MathUtils.lerp(
    kartVis.shrinkScale,
    targetShrink,
    1 - Math.exp(-11 * dt)
  );
  if (shrinkTimer > 0) {
    kartVis.electricGroup.visible = true;
    for (let z = 0; z < kartVis.zapMeshes.length; z++) {
      const zm = kartVis.zapMeshes[z];
      zm.rotation.set(
        elapsed * (18 + z * 5) + z * 1.7,
        elapsed * (23 - z * 4),
        elapsed * 15 + z
      );
      const jitter = 0.85 + Math.sin(elapsed * 42 + z * 2.3) * 0.22;
      zm.scale.setScalar(jitter);
    }
  } else {
    kartVis.electricGroup.visible = false;
  }

  // Hop, Squash-Stretch & Shrink composite scale
  const hop = Math.max(0, kartState.hopOffset || 0);
  const hopVel = (hop - kartVis.prevHop) / Math.max(dt, 0.001);
  const landedHop = kartVis.prevHop > 0.03 && hop <= 0.01 && !kartState.airborne;
  if (kartVis.prevHop > 0.02 && hop <= 0.01) {
    kartVis.squashAmp = -0.18;
    kartVis.squashPhase = 0;
  } else if (kartVis.prevHop <= 0.01 && hop > 0.02) {
    kartVis.squashAmp = 0.18;
    kartVis.squashPhase = 0;
  }
  kartVis.prevHop = hop;

  const isBoosting = (kartState.boostTimer || 0) > 0;
  if (isBoosting && !kartVis.wasBoosting) {
    kartVis.squashAmp = 0.14;
    kartVis.squashPhase = 0;
  }
  kartVis.wasBoosting = isBoosting;

  if (Math.abs(kartVis.squashAmp) > 0.002) {
    kartVis.squashPhase += dt * 22;
    kartVis.squashAmp *= Math.exp(-6.5 * dt);
  } else {
    kartVis.squashAmp = 0;
  }

  const sq =
    Math.cos(kartVis.squashPhase) * kartVis.squashAmp +
    THREE.MathUtils.clamp(hopVel * 0.012, -0.1, 0.12);
  const boostStretchZ = isBoosting ? 0.065 : 0;
  const ss = kartVis.shrinkScale;
  const celebBounce = isWinner ? Math.abs(Math.sin(elapsed * 7.5)) * 0.14 : 0;

  kartVis.squashRig.position.y = hop + celebBounce;
  kartVis.squashRig.scale.set(
    (1 - sq * 0.55) * ss,
    (1 + sq) * ss,
    (1 - sq * 0.4 + boostStretchZ) * ss
  );

  // Rocket Start revving during countdown + normal driving body roll
  const rocketCharge = kartState.rocketCharge || 0;
  const revAmp = rocketCharge > 0 ? 0.016 * rocketCharge : rocketCharge < 0 ? 0.022 : 0;
  const idleVibe =
    Math.sin(elapsed * (rocketCharge !== 0 ? 55 : 38)) *
    (0.005 * (0.4 + speedRatio * 0.6) + revAmp);
  kartVis.chassis.position.y = idleVibe;
  kartVis.chassis.rotation.z = -kartVis.smoothSteer * 0.075 * Math.min(1, speedRatio);
  kartVis.chassis.rotation.x = isBoosting ? -0.055 : rocketCharge > 0 ? -0.03 * rocketCharge : 0;

  // Spin-out / Void-fall twirl OR Cloud Fisherman hook sway OR Drift slip stance
  const spinTimer = kartState.spinoutTimer || 0;
  if (spinTimer > 0 || fallTimer > 0.75) {
    kartVis.spinAngle += dt * 17.5;
    kartVis.spinRig.rotation.y = kartVis.spinAngle;
    kartVis.squashRig.rotation.z = Math.sin(elapsed * 24) * 0.19;
  } else if (fallTimer > 0) {
    kartVis.spinAngle = THREE.MathUtils.lerp(kartVis.spinAngle, 0, 1 - Math.exp(-8 * dt));
    kartVis.spinRig.rotation.y = kartVis.spinAngle;
    kartVis.squashRig.rotation.z = Math.sin(elapsed * 9) * 0.11;
  } else {
    kartVis.spinAngle = kartVis.spinAngle % (Math.PI * 2);
    if (kartVis.spinAngle > Math.PI) kartVis.spinAngle -= Math.PI * 2;
    if (kartVis.spinAngle < -Math.PI) kartVis.spinAngle += Math.PI * 2;
    kartVis.spinAngle = THREE.MathUtils.lerp(kartVis.spinAngle, 0, 1 - Math.exp(-12 * dt));

    const targetDriftYaw = kartState.drifting
      ? -(kartState.driftDir || kartVis.smoothSteer) * 0.24
      : 0;
    kartVis.driftVisualYaw = THREE.MathUtils.lerp(
      kartVis.driftVisualYaw,
      targetDriftYaw,
      1 - Math.exp(-10 * dt)
    );
    kartVis.spinRig.rotation.y = kartVis.spinAngle + kartVis.driftVisualYaw;
    kartVis.squashRig.rotation.z = THREE.MathUtils.lerp(
      kartVis.squashRig.rotation.z,
      0,
      1 - Math.exp(-10 * dt)
    );
  }

  // Turbo Exhaust Flame Cones (also glow warm during Rocket Start charge!)
  const starTimer = kartState.starTimer || 0;
  const showFlames = isBoosting || starTimer > 0 || rocketCharge > 0.25;
  for (let i = 0; i < kartVis.flameRigs.length; i++) {
    const fg = kartVis.flameRigs[i];
    fg.visible = showFlames;
    if (showFlames) {
      const baseScale = isBoosting || starTimer > 0 ? 0.95 : 0.45 * rocketCharge;
      const flicker =
        baseScale + Math.sin(elapsed * 52 + i * 2.1) * 0.25 + (isBoosting ? 0.25 : 0);
      fg.scale.set(0.9 + flicker * 0.15, 0.9 + flicker * 0.15, Math.max(0.2, flicker));
    }
  }
  if (showFlames) {
    if (starTimer > 0) {
      kartVis.flameOuterMat.color.setHex(0x00f5d4);
    } else if (kartVis.boostColorId === 'rainbow_boost') {
      kartVis.flameOuterMat.color.setHSL((elapsed * 2.2) % 1, 1.0, 0.56);
    } else {
      const bStyle = getBoostStyle(kartVis.boostColorId);
      kartVis.flameOuterMat.color.set(bStyle.flameColor || '#ff7b00');
    }
  }
  if (kartVis.underglowMesh && kartVis.underglowMesh.visible && kartVis.boostColorId === 'rainbow_boost') {
    kartVis.underglowMat.color.setHSL((elapsed * 1.6) % 1, 1.0, 0.55);
  }

  // V4 Battle Balloons visibility & gentle bobbing
  if (kartVis.balloonsGroup) {
    const showBalloons = isArenaTrack(trackId) && (kartState.balloons || 0) > 0;
    kartVis.balloonsGroup.visible = showBalloons;
    if (showBalloons) {
      const count = kartState.balloons || 0;
      for (let i = 0; i < kartVis.balloonMeshes.length; i++) {
        const bm = kartVis.balloonMeshes[i];
        bm.visible = i < count;
        if (bm.visible) {
          bm.rotation.z = Math.sin(elapsed * 4.5 + i * 1.4) * 0.14;
          bm.position.y = (i === 1 ? 0.38 : 0.16) + Math.sin(elapsed * 3.8 + i * 2.1) * 0.05;
        }
      }
    }
  }

  // Star Rainbow Aura
  if (starTimer > 0) {
    const hue = (elapsed * 1.85) % 1;
    tmpHSLColor.setHSL(hue, 1.0, 0.55);
    kartVis.primaryMat.emissive.copy(tmpHSLColor);
    kartVis.primaryMat.emissiveIntensity = 0.65;
    kartVis.accentMat.emissive.setHSL((hue + 0.33) % 1, 1.0, 0.55);
    kartVis.accentMat.emissiveIntensity = 0.65;
    kartVis.helmetMat.emissive.setHSL((hue + 0.66) % 1, 1.0, 0.55);
    kartVis.helmetMat.emissiveIntensity = 0.6;

    kartVis.starAuraGroup.visible = true;
    kartVis.starAuraGroup.rotation.y = elapsed * 5.5;
    kartVis.starAuraMat.color.copy(tmpHSLColor);
  } else if (kartVis.starAuraGroup.visible) {
    kartVis.primaryMat.emissive.copy(blackColor);
    kartVis.primaryMat.emissiveIntensity = 0;
    kartVis.accentMat.emissive.copy(blackColor);
    kartVis.accentMat.emissiveIntensity = 0;
    kartVis.helmetMat.emissive.copy(blackColor);
    kartVis.helmetMat.emissiveIntensity = 0;
    kartVis.starAuraGroup.visible = false;
  }

  // Drift Sparks behind rear tires
  const drifting =
    Boolean(kartState.drifting) &&
    !kartState.airborne &&
    Math.abs(speed) > 6 &&
    spinTimer <= 0;
  const chargeIdx = Math.max(0, Math.min(3, Math.floor(kartState.driftCharge || 0)));
  kartVis.sparkMat.color.setHex(DRIFT_SPARK_COLORS[chargeIdx]);
  const chargeBoostScale = 1 + chargeIdx * 0.38;

  for (let i = 0; i < kartVis.sparks.length; i++) {
    const sp = kartVis.sparks[i];
    sp.age += dt;

    if (sp.age >= sp.life) {
      if (drifting) {
        sp.age = 0;
        sp.life = 0.16 + (i % 4) * 0.035;
        sp.mesh.visible = true;
        sp.mesh.position.set(sp.side * 0.84, 0.12, -0.88);
        const spread = ((i * 37) % 10) * 0.1 - 0.5;
        sp.vx = sp.side * (1.2 + Math.abs(spread) * 2.2) + spread * 1.4;
        sp.vy = 2.0 + ((i * 19) % 7) * 0.45 * chargeBoostScale;
        sp.vz = -5.5 - chargeIdx * 1.8;
      } else {
        sp.mesh.visible = false;
        continue;
      }
    }

    if (sp.mesh.visible) {
      const progress = sp.age / sp.life;
      sp.vy -= 9.8 * dt;
      sp.mesh.position.x += sp.vx * dt;
      sp.mesh.position.y = Math.max(0.05, sp.mesh.position.y + sp.vy * dt);
      sp.mesh.position.z += sp.vz * dt;
      sp.mesh.rotation.x += dt * 14;
      sp.mesh.rotation.y += dt * 18;
      const s = (1 - progress * 0.82) * chargeBoostScale;
      sp.mesh.scale.set(s * 0.85, s * 0.85, s * 1.65);
    }
  }

  // Mini-Turbo Release Shockwave Ring + Cartoon Smoke Clouds (non-ghost)
  const boostTimerVal = kartState.boostTimer || 0;
  const driftChargeVal = kartState.driftCharge || 0;
  const isDriftingNow = Boolean(kartState.drifting);
  const landedAir = kartVis.wasAirborne && !kartState.airborne;

  if (!kartVis.isGhost) {
    // 1. Mini-Turbo Shockwave Ring
    if (kartVis.turboWaveMesh && kartVis.turboWaveMat) {
      const releasedMiniTurbo =
        (kartVis.prevDrifting &&
          !isDriftingNow &&
          kartVis.prevDriftCharge >= 1 &&
          (boostTimerVal > kartVis.prevBoostTimer || boostTimerVal > 0.08)) ||
        (boostTimerVal > kartVis.prevBoostTimer + 0.14 && kartVis.prevDriftCharge >= 1);

      if (releasedMiniTurbo) {
        const cLvl = Math.floor(kartVis.prevDriftCharge);
        const waveHex = cLvl >= 3 ? 0xff2bf2 : cLvl === 2 ? 0xff7b00 : 0x00e5ff;
        kartVis.turboWaveMat.color.setHex(waveHex);
        kartVis.turboWaveDuration = cLvl >= 3 ? 0.5 : 0.42;
        kartVis.turboWaveTimer = kartVis.turboWaveDuration;
        kartVis.turboWaveMesh.visible = true;
        kartVis.turboWaveMesh.scale.set(0.7, 1, 0.7);
      }

      if (kartVis.turboWaveTimer > 0) {
        kartVis.turboWaveTimer = Math.max(0, kartVis.turboWaveTimer - dt);
        const p = 1 - kartVis.turboWaveTimer / Math.max(0.01, kartVis.turboWaveDuration);
        const s = 0.7 + p * 3.1;
        kartVis.turboWaveMesh.scale.set(s, 1, s);
        kartVis.turboWaveMat.opacity = (1 - p) * 0.85;
        if (kartVis.turboWaveTimer <= 0) {
          kartVis.turboWaveMesh.visible = false;
        }
      }
    }

    // 2. Cartoon Smoke Puff Pool (drift, landing, rocket start)
    if (kartVis.smokeMat && kartVis.smokePuffs) {
      const baseTrack = getBaseTrackId(trackId);
      if (rocketCharge < -0.2) {
        kartVis.smokeMat.color.setHex(0x334155);
      } else if (baseTrack === 'polar') {
        kartVis.smokeMat.color.setHex(0xe0f2fe);
      } else {
        kartVis.smokeMat.color.setHex(0xf8fafc);
      }

      kartVis.smokeEmitTimer -= dt;
      if (drifting && !kartState.finished && kartVis.smokeEmitTimer <= 0) {
        kartVis.smokeEmitTimer = 0.065;
        kartVis.smokeSideToggle = -kartVis.smokeSideToggle;
        const sx = kartVis.smokeSideToggle * 0.72;
        _spawnSmokePuff(
          kartVis,
          sx,
          0.2,
          -0.92,
          sx * 0.75 + (Math.random() - 0.5) * 0.5,
          0.9 + Math.random() * 0.5,
          -1.8 - Math.random() * 1.1,
          driftChargeVal >= 2 ? 1.15 : 0.9,
          0.44
        );
      } else if (Math.abs(rocketCharge) > 0.25 && kartVis.smokeEmitTimer <= 0) {
        kartVis.smokeEmitTimer = 0.075;
        kartVis.smokeSideToggle = -kartVis.smokeSideToggle;
        const sx = kartVis.smokeSideToggle * 0.34;
        _spawnSmokePuff(
          kartVis,
          sx,
          0.44,
          -1.15,
          sx * 0.6 + (Math.random() - 0.5) * 0.4,
          1.1 + Math.random() * 0.6,
          -2.4 - Math.random() * 1.2,
          rocketCharge < 0 ? 1.25 : 0.85,
          0.42
        );
      }

      if ((landedAir || landedHop) && !kartState.finished && fallTimer <= 0) {
        _spawnSmokePuff(kartVis, -0.74, 0.16, -0.82, -1.6, 0.95, -0.7, 1.05, 0.42);
        _spawnSmokePuff(kartVis, 0.74, 0.16, -0.82, 1.6, 0.95, -0.7, 1.05, 0.42);
        _spawnSmokePuff(kartVis, -0.66, 0.15, 0.75, -1.3, 0.75, 0.4, 0.85, 0.38);
        _spawnSmokePuff(kartVis, 0.66, 0.15, 0.75, 1.3, 0.75, 0.4, 0.85, 0.38);
      }

      if (kartVis.prevRocketCharge > 0.35 && rocketCharge === 0 && isBoosting) {
        _spawnSmokePuff(kartVis, -0.36, 0.38, -1.2, -0.9, 1.1, -3.4, 1.3, 0.5);
        _spawnSmokePuff(kartVis, 0.36, 0.38, -1.2, 0.9, 1.1, -3.4, 1.3, 0.5);
        _spawnSmokePuff(kartVis, 0, 0.32, -1.28, (Math.random() - 0.5) * 0.6, 1.4, -4.0, 1.4, 0.54);
      }

      for (let i = 0; i < kartVis.smokePuffs.length; i++) {
        const p = kartVis.smokePuffs[i];
        if (!p.active) continue;
        p.age += dt;
        if (p.age >= p.life) {
          p.active = false;
          p.mesh.visible = false;
          continue;
        }
        const prog = p.age / p.life;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.vy *= Math.exp(-2.2 * dt);
        p.mesh.rotation.x += dt * 2.5;
        p.mesh.rotation.y += dt * 3.1;
        const grow = 0.42 + Math.sin(prog * Math.PI * 0.85) * 0.82;
        const tailFade = prog > 0.65 ? 1 - ((prog - 0.65) / 0.35) * 0.65 : 1;
        p.mesh.scale.setScalar(Math.max(0.05, grow * tailFade * p.maxScale));
      }
    }
  }

  kartVis.wasAirborne = Boolean(kartState.airborne);
  kartVis.prevDrifting = isDriftingNow;
  kartVis.prevDriftCharge = driftChargeVal;
  kartVis.prevBoostTimer = boostTimerVal;
  kartVis.prevRocketCharge = rocketCharge;
  kartVis.prevSpeed = speed;
}

export function disposeKartVisual(kartVis) {
  if (!kartVis) return;
  if (!kartVis.isGhost) {
    kartVis.primaryMat.dispose();
    kartVis.accentMat.dispose();
    kartVis.helmetMat.dispose();
    kartVis.skinMat?.dispose();
    kartVis.hoverMat?.dispose();
    if (kartVis.balloonMats) {
      for (const bm of kartVis.balloonMats) bm.dispose();
    }
  }
  kartVis.underglowMat?.dispose();
  kartVis.smokeMat?.dispose();
  kartVis.turboWaveMat?.dispose();
  kartVis.flameOuterMat.dispose();
  kartVis.flameInnerMat.dispose();
  kartVis.sparkMat.dispose();
  kartVis.starAuraMat.dispose();
  kartVis.nameplateTex.dispose();
  kartVis.nameplateMat.dispose();
  kartVis.emoteTex.dispose();
  kartVis.emoteMat.dispose();
}

const SKID_CAPACITY = 320;

export class KartVisualManager {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'RaceKarts';
    scene.add(this.group);
    this.scene = scene;
    this.map = new Map();
    this._seenIds = new Set();
    this._currentTrackId = null;

    // Persistent Tire Skid Marks Ring-Buffer (InstancedMesh, ~320 oriented quads)
    this.skidGeo = new THREE.PlaneGeometry(0.32, 1.0);
    this.skidGeo.rotateX(-Math.PI / 2);
    this.skidMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.skidMesh = new THREE.InstancedMesh(this.skidGeo, this.skidMat, SKID_CAPACITY);
    this.skidMesh.frustumCulled = false;

    this._tmpSkidObj = new THREE.Object3D();
    this._tmpSkidColor = new THREE.Color(0x1e293b);
    this._zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < SKID_CAPACITY; i++) {
      this.skidMesh.setMatrixAt(i, this._zeroMatrix);
      this.skidMesh.setColorAt(i, this._tmpSkidColor);
    }
    this.skidMesh.instanceMatrix.needsUpdate = true;
    if (this.skidMesh.instanceColor) this.skidMesh.instanceColor.needsUpdate = true;
    this.group.add(this.skidMesh);
    this._skidCursor = 0;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  _clearSkidMarks() {
    for (let i = 0; i < SKID_CAPACITY; i++) {
      this.skidMesh.setMatrixAt(i, this._zeroMatrix);
    }
    this.skidMesh.instanceMatrix.needsUpdate = true;
    this._skidCursor = 0;
    for (const vis of this.map.values()) {
      vis.hasPrevSkid = false;
    }
  }

  _emitSkidQuad(x1, y1, z1, x2, y2, z2, r, g, b, width = 1.0) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const distSq = dx * dx + dz * dz;
    if (distSq < 0.04 || distSq > 36) return;

    const dist = Math.sqrt(distSq);
    this._tmpSkidObj.position.set((x1 + x2) * 0.5, Math.max(y1, y2) + 0.045, (z1 + z2) * 0.5);
    this._tmpSkidObj.rotation.set(0, Math.atan2(dx, dz), 0);
    this._tmpSkidObj.scale.set(width, 1, dist + 0.08);
    this._tmpSkidObj.updateMatrix();

    const idx = this._skidCursor;
    this.skidMesh.setMatrixAt(idx, this._tmpSkidObj.matrix);
    this._tmpSkidColor.setRGB(r, g, b);
    this.skidMesh.setColorAt(idx, this._tmpSkidColor);
    this._skidCursor = (idx + 1) % SKID_CAPACITY;
  }

  sync(karts, localId, dt, elapsed, trackId = 'coco') {
    if (!Array.isArray(karts)) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    const baseTrack = getBaseTrackId(trackId);
    const isCyberTrack =
      baseTrack === 'neon' || baseTrack === 'pinball' || baseTrack === 'rainbow' || baseTrack === 'arena';
    const isPolarTrack = baseTrack === 'polar';

    if (trackId !== this._currentTrackId) {
      this._currentTrackId = trackId;
      this._clearSkidMarks();
      const targetBlending = isCyberTrack ? THREE.AdditiveBlending : THREE.NormalBlending;
      if (this.skidMat.blending !== targetBlending) {
        this.skidMat.blending = targetBlending;
        this.skidMat.needsUpdate = true;
      }
      this.skidMat.opacity = isCyberTrack ? 0.78 : isPolarTrack ? 0.52 : 0.56;
    }

    const seen = this._seenIds;
    seen.clear();
    let skidDirty = false;

    for (let i = 0; i < karts.length; i++) {
      const k = karts[i];
      if (!k || k.id == null) continue;
      seen.add(k.id);

      let vis = this.map.get(k.id);
      if (!vis) {
        vis = createKartVisual(k.racerId, {
          showNameplate: k.id !== localId,
          name: k.name,
          kartId: k.kartId,
          boostColorId: k.boostColorId,
        });
        this.group.add(vis.root);
        this.map.set(k.id, vis);
      }

      const speed = k.speed || 0;
      const isBraking =
        Boolean(k.braking) ||
        (vis.prevSpeed > 4 && vis.prevSpeed - speed > Math.max(0.25, 28 * dt));

      updateKartVisual(vis, k, dt, elapsed, k.id === localId, trackId);

      // Persistent Rear Tire Skid Marks
      const canLeaveSkid =
        !k.finished &&
        !k.airborne &&
        !k.eliminated &&
        (k.fallTimer || 0) <= 0 &&
        Math.abs(speed) > 3 &&
        (Boolean(k.drifting) || (k.spinoutTimer || 0) > 0 || isBraking);

      if (canLeaveSkid) {
        const yaw = k.yaw || 0;
        const cosY = Math.cos(yaw);
        const sinY = Math.sin(yaw);
        const lx = 0.72;
        const lz = -0.85;
        const curLx = (k.x || 0) - lx * cosY + lz * sinY;
        const curLz = (k.z || 0) + lx * sinY + lz * cosY;
        const curRx = (k.x || 0) + lx * cosY + lz * sinY;
        const curRz = (k.z || 0) - lx * sinY + lz * cosY;
        const curY = k.y || 0;

        if (vis.hasPrevSkid) {
          let rL = 0.08;
          let gL = 0.09;
          let bL = 0.11;
          let rR = 0.08;
          let gR = 0.09;
          let bR = 0.11;

          if (isCyberTrack) {
            rL = 0.0;
            gL = 0.92;
            bL = 1.0;
            rR = 1.0;
            gR = 0.15;
            bR = 0.92;
          } else if (isPolarTrack) {
            rL = 0.76;
            gL = 0.91;
            bL = 1.0;
            rR = 0.76;
            gR = 0.91;
            bR = 1.0;
          }

          const width = k.drifting ? 1.1 : 0.92;
          this._emitSkidQuad(vis.prevSkidL.x, vis.prevSkidL.y, vis.prevSkidL.z, curLx, curY, curLz, rL, gL, bL, width);
          this._emitSkidQuad(vis.prevSkidR.x, vis.prevSkidR.y, vis.prevSkidR.z, curRx, curY, curRz, rR, gR, bR, width);
          skidDirty = true;
        }

        vis.prevSkidL.x = curLx;
        vis.prevSkidL.y = curY;
        vis.prevSkidL.z = curLz;
        vis.prevSkidR.x = curRx;
        vis.prevSkidR.y = curY;
        vis.prevSkidR.z = curRz;
        vis.hasPrevSkid = true;
      } else {
        vis.hasPrevSkid = false;
      }
    }

    if (skidDirty) {
      this.skidMesh.instanceMatrix.needsUpdate = true;
      if (this.skidMesh.instanceColor) this.skidMesh.instanceColor.needsUpdate = true;
    }

    for (const [id, vis] of this.map.entries()) {
      if (!seen.has(id)) {
        this.group.remove(vis.root);
        disposeKartVisual(vis);
        this.map.delete(id);
      }
    }
  }

  dispose() {
    for (const vis of this.map.values()) {
      this.group.remove(vis.root);
      disposeKartVisual(vis);
    }
    this.map.clear();
    this.group.remove(this.skidMesh);
    this.skidGeo.dispose();
    this.skidMat.dispose();
    this.scene.remove(this.group);
  }
}
