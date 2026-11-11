import * as THREE from 'three';
import { RACERS, EMOTES, RACE_CONFIG } from '../shared/constants.js';
import { getTrackSample } from '../shared/trackData.js';

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

  // V2 Golden Champion Crown geometries
  const crownBandGeo = new THREE.CylinderGeometry(0.21, 0.18, 0.12, 12);
  const crownSpikeGeo = new THREE.ConeGeometry(0.055, 0.15, 5);
  const crownGemGeo = new THREE.SphereGeometry(0.035, 6, 6);

  // FX Geometries (Turbo flames, drift sparks, star aura, lightning zaps, UFO rescue beam)
  const flameOuterGeo = new THREE.ConeGeometry(0.18, 0.95, 10);
  flameOuterGeo.translate(0, 0.475, 0);
  flameOuterGeo.rotateX(-Math.PI / 2);

  const flameInnerGeo = new THREE.ConeGeometry(0.1, 0.62, 8);
  flameInnerGeo.translate(0, 0.31, 0);
  flameInnerGeo.rotateX(-Math.PI / 2);

  const sparkGeo = new THREE.OctahedronGeometry(0.11, 0);
  const starRingGeo = new THREE.TorusGeometry(1.28, 0.055, 8, 24);
  starRingGeo.rotateX(Math.PI / 2);

  // Jagged electric zap ring for Lightning Shrink
  const zapRingGeo = new THREE.TorusGeometry(0.95, 0.04, 4, 7);
  // UFO Tractor-Beam cone for Rainbow Void Fall rescue
  const rescueBeamGeo = new THREE.CylinderGeometry(0.45, 1.35, 6.2, 16, 1, true);
  rescueBeamGeo.translate(0, 3.1, 0);
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
    crownBandGeo,
    crownSpikeGeo,
    crownGemGeo,
    flameOuterGeo,
    flameInnerGeo,
    sparkGeo,
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
  { showNameplate = false, name = '', isGhost = false } = {}
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
  const subSkinMat = isGhost ? A.ghostHoloMat : A.skinMat;
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

  // Spin / drift-slip yaw container
  const spinRig = new THREE.Group();
  root.add(spinRig);

  // Hop & squash-stretch + shrink rig
  const squashRig = new THREE.Group();
  spinRig.add(squashRig);

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

  // Floorpan & body
  const floorPan = new THREE.Mesh(A.floorPanGeo, subDarkMat);
  floorPan.position.set(0, 0.2, 0.02);
  floorPan.castShadow = castShadowFlag;
  chassis.add(floorPan);

  const mainBody = new THREE.Mesh(A.mainBodyGeo, primaryMat);
  mainBody.position.set(0, 0.36, -0.05);
  mainBody.castShadow = castShadowFlag;
  mainBody.receiveShadow = castShadowFlag;
  chassis.add(mainBody);

  const nose = new THREE.Mesh(A.noseGeo, primaryMat);
  nose.position.set(0, 0.33, 0.78);
  nose.castShadow = castShadowFlag;
  chassis.add(nose);

  const frontBumper = new THREE.Mesh(A.bumperGeo, accentMat);
  frontBumper.position.set(0, 0.22, 1.15);
  frontBumper.castShadow = castShadowFlag;
  chassis.add(frontBumper);

  const badge = new THREE.Mesh(A.badgeGeo, subBadgeMat);
  badge.position.set(0, 0.47, 0.86);
  chassis.add(badge);

  for (const sx of [-1, 1]) {
    const pod = new THREE.Mesh(A.sidePodGeo, primaryMat);
    pod.position.set(sx * 0.58, 0.3, -0.02);
    pod.castShadow = castShadowFlag;
    chassis.add(pod);

    const stripe = new THREE.Mesh(A.sideStripeGeo, accentMat);
    stripe.position.set(sx * 0.75, 0.32, -0.02);
    chassis.add(stripe);
  }

  const engineDeck = new THREE.Mesh(A.engineDeckGeo, accentMat);
  engineDeck.position.set(0, 0.52, -0.74);
  engineDeck.castShadow = castShadowFlag;
  chassis.add(engineDeck);

  for (const sx of [-1, 1]) {
    const strut = new THREE.Mesh(A.strutGeo, subDarkMat);
    strut.position.set(sx * 0.36, 0.74, -0.92);
    strut.rotation.x = 0.22;
    chassis.add(strut);

    const endplate = new THREE.Mesh(A.spoilerTipGeo, primaryMat);
    endplate.position.set(sx * 0.7, 0.94, -0.98);
    chassis.add(endplate);
  }

  const spoilerWing = new THREE.Mesh(A.spoilerWingGeo, accentMat);
  spoilerWing.position.set(0, 0.94, -0.98);
  spoilerWing.rotation.x = 0.16;
  spoilerWing.castShadow = castShadowFlag;
  chassis.add(spoilerWing);

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

  // 4 Chunky Rubber Tires
  const steerPivots = [];
  const wheelSpinners = [];

  for (const sx of [-1, 1]) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(sx * 0.78, 0.28, 0.75);
    stuntContent.add(steerPivot);
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
    stuntContent.add(spinR);
    wheelSpinners.push({ group: spinR, radius: 0.34 });
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

  for (const sx of [-1, 1]) {
    const glove = new THREE.Mesh(A.gloveGeo, subBadgeMat);
    glove.position.set(sx * 0.16, 0.22, 0.35);
    driverGroup.add(glove);
  }

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.54, 0.02);
  driverGroup.add(headPivot);

  const head = new THREE.Mesh(A.headGeo, subSkinMat);
  head.castShadow = castShadowFlag;
  headPivot.add(head);

  const helmet = new THREE.Mesh(A.helmetGeo, helmetMat);
  helmet.position.y = 0.02;
  helmet.rotation.x = -0.18;
  helmet.castShadow = castShadowFlag;
  headPivot.add(helmet);

  const helmetStripe = new THREE.Mesh(A.helmetStripeGeo, primaryMat);
  helmetStripe.position.set(0, 0.32, -0.02);
  helmetStripe.rotation.x = -0.18;
  headPivot.add(helmetStripe);

  const visor = new THREE.Mesh(A.visorGeo, subVisorMat);
  visor.position.set(0, 0.06, 0.01);
  headPivot.add(visor);

  // Golden 3D Champion Crown (`kart.hasCrown`)
  const crownGroup = new THREE.Group();
  crownGroup.position.set(0, 0.42, -0.02);
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

  // V2 Void Fall UFO Tractor-Beam (`kart.fallTimer > 0`)
  const rescueGroup = new THREE.Group();
  rescueGroup.visible = false;
  if (!isGhost) {
    const beam = new THREE.Mesh(A.rescueBeamGeo, A.rescueBeamMat);
    const saucer = new THREE.Mesh(A.ufoDiscGeo, A.goldCrownMat);
    saucer.position.y = 4.6;
    rescueGroup.add(beam, saucer);
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

  return {
    root,
    isGhost,
    racerId: spec.id,
    lastLabel: name || '',
    lastEmoteIcon: '',
    primaryMat,
    accentMat,
    helmetMat,
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
    // Animation state
    smoothSteer: 0,
    driftVisualYaw: 0,
    spinAngle: 0,
    prevHop: 0,
    squashAmp: 0,
    squashPhase: 0,
    wasBoosting: false,
    shrinkScale: 1.0,
    pitch: 0,
  };
}

export function setKartRacerTheme(kartVis, racerId) {
  if (!kartVis || kartVis.isGhost || kartVis.racerId === racerId) return;
  const spec = getRacerSpec(racerId);
  kartVis.racerId = spec.id;
  kartVis.primaryMat.color.set(spec.color);
  kartVis.accentMat.color.set(spec.accent);
  kartVis.helmetMat.color.set(spec.helmetColor);
  if (kartVis.lastLabel) {
    drawNameplateCanvas(kartVis.nameplateCanvas, kartVis.lastLabel, spec.color, false);
    kartVis.nameplateTex.needsUpdate = true;
  }
}

const tmpHSLColor = new THREE.Color();
const blackColor = new THREE.Color(0x000000);

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

  if (!kartVis.isGhost && kartState.racerId && kartState.racerId !== kartVis.racerId) {
    setKartRacerTheme(kartVis, kartState.racerId);
  }

  // Void Fall sink / UFO Rescue Beam (`kart.fallTimer > 0`, physics handles y drop & 0.45s rescue lower!)
  const fallTimer = kartState.fallTimer || 0;
  if (fallTimer > 0 && !kartVis.isGhost) {
    if (fallTimer <= 0.48) {
      kartVis.rescueGroup.visible = true;
      kartVis.rescueGroup.rotation.y = elapsed * 6.0;
    } else {
      kartVis.rescueGroup.visible = false;
    }
  } else {
    kartVis.rescueGroup.visible = false;
  }

  kartVis.root.position.set(kartState.x || 0, kartState.y || 0, kartState.z || 0);
  kartVis.root.rotation.y = kartState.yaw || 0;

  // Road slope pitch alignment (smoothly levels out while airborne!)
  if (kartState.airborne) {
    const vyPitch = THREE.MathUtils.clamp(-(kartState.vy || 0) * 0.022, -0.35, 0.35);
    kartVis.pitch = THREE.MathUtils.lerp(kartVis.pitch, vyPitch, 1 - Math.exp(-10 * dt));
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
  kartVis.headPivot.rotation.z = kartVis.smoothSteer * 0.25;
  kartVis.headPivot.rotation.y = -kartVis.smoothSteer * 0.2;
  kartVis.headPivot.position.y = 0.54 + Math.sin(elapsed * 18) * 0.008 * speedRatio;

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

  kartVis.squashRig.position.y = hop;
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

  // Spin-out / Void-fall twirl OR Drift slip stance
  const spinTimer = kartState.spinoutTimer || 0;
  if (spinTimer > 0 || fallTimer > 0.48) {
    kartVis.spinAngle += dt * 17.5;
    kartVis.spinRig.rotation.y = kartVis.spinAngle;
    kartVis.squashRig.rotation.z = Math.sin(elapsed * 24) * 0.19;
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
    kartVis.flameOuterMat.color.setHex(starTimer > 0 ? 0x00f5d4 : 0xff5400);
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
}

export function disposeKartVisual(kartVis) {
  if (!kartVis) return;
  if (!kartVis.isGhost) {
    kartVis.primaryMat.dispose();
    kartVis.accentMat.dispose();
    kartVis.helmetMat.dispose();
  }
  kartVis.flameOuterMat.dispose();
  kartVis.flameInnerMat.dispose();
  kartVis.sparkMat.dispose();
  kartVis.starAuraMat.dispose();
  kartVis.nameplateTex.dispose();
  kartVis.nameplateMat.dispose();
  kartVis.emoteTex.dispose();
  kartVis.emoteMat.dispose();
}

export class KartVisualManager {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'RaceKarts';
    scene.add(this.group);
    this.scene = scene;
    this.map = new Map();
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  sync(karts, localId, dt, elapsed, trackId = 'coco') {
    if (!Array.isArray(karts)) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    const seen = new Set();
    for (let i = 0; i < karts.length; i++) {
      const k = karts[i];
      if (!k || k.id == null) continue;
      seen.add(k.id);

      let vis = this.map.get(k.id);
      if (!vis) {
        vis = createKartVisual(k.racerId, {
          showNameplate: k.id !== localId,
          name: k.name,
        });
        this.group.add(vis.root);
        this.map.set(k.id, vis);
      }

      updateKartVisual(vis, k, dt, elapsed, k.id === localId, trackId);
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
    this.scene.remove(this.group);
  }
}
