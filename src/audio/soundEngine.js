/**
 * PocketKart 3D V3 — Procedural Web Audio Arcade Synthesizer & Dynamic Music Engine
 * Pure Web Audio API (zero external .mp3/.wav dependencies).
 *
 * V3 Additions:
 * - setPaused(bool) / isPaused() cleanly quiets engine + music while Solo is paused and resumes smoothly.
 * - Distinct SFX for 'shield_block', 'respawn', and slipstream draft boost (type === 'boost' && source === 'draft').
 */

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const TRACK_GROOVES = {
  coco: {
    bpm: 128,
    leadWave: 'triangle',
    bassWave: 'triangle',
    leadCutoff: 2800,
    lead: [72, null, 76, 79, 81, null, 79, 76, 74, 76, 79, null, 84, 81, 79, 76],
    bass: [48, null, 48, 55, 53, null, 53, 60, 55, null, 55, 50, 48, null, 55, 48],
  },
  neon: {
    bpm: 134,
    leadWave: 'sawtooth',
    bassWave: 'sawtooth',
    leadCutoff: 2300,
    lead: [69, null, 72, 76, 79, null, 76, 72, 65, null, 69, 72, 76, 74, 72, 71],
    bass: [33, 45, 33, 45, 36, 48, 36, 48, 29, 41, 29, 41, 31, 43, 32, 44],
  },
  rainbow: {
    bpm: 138,
    leadWave: 'triangle',
    bassWave: 'sine',
    leadCutoff: 3600,
    lead: [67, 71, 74, 78, 79, 74, 71, 74, 69, 72, 76, 81, 79, 76, 74, 71],
    bass: [43, null, 50, 55, 45, null, 52, 57, 40, null, 47, 52, 38, null, 50, 54],
  },
};

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.muted = false;
    this.musicEnabled = true;
    this.paused = false;

    // Continuous kart engine + drift hiss nodes
    this.engineNodes = null;
    this.noiseBuffer = null;
    this.engineActive = false;

    // Procedural music scheduler state
    this._musicPlaying = false;
    this._musicTrackId = 'coco';
    this._finalLap = false;
    this._musicStep = 0;
    this._nextNoteTime = 0;
    this._musicTimer = null;
  }

  /**
   * Lazily initializes & resumes AudioContext on the first user gesture.
   */
  unlock() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;

    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
        this._buildMasterGraph();
      } catch {
        return false;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (this._musicPlaying && !this._musicTimer) {
      this._startScheduler();
    }

    return this.ctx.state === 'running';
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(this.muted ? 0.0001 : 0.72, now, 0.025);
    }
    this._syncMusicGain();
  }

  isMuted() {
    return this.muted;
  }

  /**
   * Quiets engine + music cleanly while Solo is paused, and resumes seamlessly on unpause.
   */
  setPaused(paused) {
    const next = Boolean(paused);
    if (this.paused === next) return;
    this.paused = next;

    if (this.ctx && this.engineNodes && next) {
      const now = this.ctx.currentTime;
      this.engineNodes.engineGain.gain.setTargetAtTime(0.0001, now, 0.04);
      this.engineNodes.driftGain.gain.setTargetAtTime(0.0001, now, 0.04);
      this.engineActive = false;
    }

    if (!next && this.ctx) {
      this._nextNoteTime = this.ctx.currentTime + 0.04;
    }

    this._syncMusicGain();
  }

  isPaused() {
    return this.paused;
  }

  setMusicEnabled(enabled) {
    this.musicEnabled = Boolean(enabled);
    this._syncMusicGain();
  }

  isMusicEnabled() {
    return this.musicEnabled;
  }

  setFinalLap(isFinal) {
    this._finalLap = Boolean(isFinal);
  }

  startMusic(trackId = 'coco') {
    const cleanId = TRACK_GROOVES[trackId] ? trackId : 'coco';
    const trackChanged = cleanId !== this._musicTrackId;
    this._musicTrackId = cleanId;

    if (!this._musicPlaying || trackChanged) {
      this._musicStep = 0;
      if (!this._musicPlaying) {
        this._finalLap = false;
      }
    }

    this._musicPlaying = true;
    this._syncMusicGain();

    if (this.ctx && !this._musicTimer) {
      this._startScheduler();
    }
  }

  stopMusic() {
    this._musicPlaying = false;
    this._finalLap = false;
    if (this._musicTimer) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
    this._syncMusicGain();
  }

  _syncMusicGain() {
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;
    const shouldPlay =
      this._musicPlaying && this.musicEnabled && !this.muted && !this.paused;
    const target = shouldPlay ? 0.2 : 0.0001;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setTargetAtTime(target, now, 0.05);
  }

  _startScheduler() {
    if (this._musicTimer || !this.ctx) return;
    this._nextNoteTime = this.ctx.currentTime + 0.05;
    this._musicTimer = setInterval(() => this._tickMusicScheduler(), 75);
  }

  _tickMusicScheduler() {
    if (!this._musicPlaying || !this.ctx) return;
    if (
      this.ctx.state !== 'running' ||
      this.muted ||
      this.paused ||
      !this.musicEnabled ||
      (typeof document !== 'undefined' && document.hidden)
    ) {
      this._nextNoteTime = this.ctx.currentTime + 0.06;
      return;
    }

    const now = this.ctx.currentTime;
    if (this._nextNoteTime < now - 0.12) {
      this._nextNoteTime = now + 0.03;
    }

    const groove = TRACK_GROOVES[this._musicTrackId] || TRACK_GROOVES.coco;
    const tempoMult = this._finalLap ? 1.18 : 1.0;
    const stepDur = 60 / (groove.bpm * tempoMult) / 4;
    const transpose = this._finalLap ? 2 : 0;

    while (this._nextNoteTime < now + 0.18) {
      const step = this._musicStep % 16;
      this._scheduleMusicStep(groove, step, this._nextNoteTime, stepDur, transpose);
      this._nextNoteTime += stepDur;
      this._musicStep = (this._musicStep + 1) % 16;
    }
  }

  _scheduleMusicStep(groove, step, when, stepDur, transpose) {
    if (!this.ctx || !this.musicGain) return;

    const leadMidi = groove.lead[step];
    if (leadMidi !== null && leadMidi !== undefined) {
      const freq = midiToFreq(leadMidi + transpose);
      this._musicTone({
        freq,
        type: groove.leadWave,
        when,
        duration: stepDur * 0.85,
        gain: 0.17,
        cutoff: groove.leadCutoff,
      });
    }

    const bassMidi = groove.bass[step];
    if (bassMidi !== null && bassMidi !== undefined) {
      const freq = midiToFreq(bassMidi + transpose);
      this._musicTone({
        freq,
        type: groove.bassWave,
        when,
        duration: stepDur * 0.9,
        gain: 0.24,
        cutoff: 780,
      });
    }

    if (step % 4 === 0) {
      this._musicKick(when);
    } else if (step % 4 === 2) {
      this._musicHat(when);
    }
  }

  _musicTone({ freq, type, when, duration, gain, cutoff }) {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(24, freq), when);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, when);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(gain, when + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.03, duration));

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.musicGain);

    osc.start(when);
    osc.stop(when + Math.max(0.04, duration) + 0.015);
  }

  _musicKick(when) {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(118, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.085);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.22, when);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);

    osc.connect(env);
    env.connect(this.musicGain);
    osc.start(when);
    osc.stop(when + 0.1);
  }

  _musicHat(when) {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer || !this.musicGain) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(5500, when);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.065, when);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.038);

    src.connect(hp);
    hp.connect(env);
    env.connect(this.musicGain);
    src.start(when);
    src.stop(when + 0.045);
  }

  _buildMasterGraph() {
    const ctx = this.ctx;
    if (!ctx) return;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 18;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.16;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0.0001 : 0.72;

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.92;

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value =
      this._musicPlaying && this.musicEnabled && !this.muted && !this.paused ? 0.2 : 0.0001;

    this.sfxGain.connect(compressor);
    this.musicGain.connect(compressor);
    compressor.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * 1.5);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;

    this._initEngineSynth(compressor);
  }

  _initEngineSynth(destination) {
    const ctx = this.ctx;
    if (!ctx) return;

    const oscMain = ctx.createOscillator();
    oscMain.type = 'sawtooth';
    oscMain.frequency.value = 62;

    const oscSub = ctx.createOscillator();
    oscSub.type = 'triangle';
    oscSub.frequency.value = 31;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 2.4;
    lfo.connect(lfoGain);
    lfoGain.connect(oscMain.frequency);

    const subMix = ctx.createGain();
    subMix.gain.value = 0.55;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    filter.Q.value = 2.2;

    const engineGain = ctx.createGain();
    engineGain.gain.value = 0.0001;

    oscMain.connect(filter);
    oscSub.connect(subMix);
    subMix.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(destination);

    const driftNoise = ctx.createBufferSource();
    driftNoise.buffer = this.noiseBuffer;
    driftNoise.loop = true;

    const driftFilter = ctx.createBiquadFilter();
    driftFilter.type = 'bandpass';
    driftFilter.frequency.value = 2100;
    driftFilter.Q.value = 3.2;

    const driftGain = ctx.createGain();
    driftGain.gain.value = 0.0001;

    driftNoise.connect(driftFilter);
    driftFilter.connect(driftGain);
    driftGain.connect(destination);

    oscMain.start();
    oscSub.start();
    lfo.start();
    driftNoise.start();

    this.engineNodes = {
      oscMain,
      oscSub,
      lfo,
      filter,
      engineGain,
      driftFilter,
      driftGain,
    };
  }

  /**
   * Smoothly updates kart engine purr and drift tire hiss each frame.
   */
  updateEngine({
    speed = 0,
    maxSpeed = 42,
    drifting = false,
    active = false,
    shrunk = false,
    shrinkTimer = 0,
  } = {}) {
    if (!this.ctx || !this.engineNodes) return;

    const now = this.ctx.currentTime;
    const { oscMain, oscSub, lfo, filter, engineGain, driftFilter, driftGain } = this.engineNodes;

    if (!active || this.paused || this.muted || this.ctx.state !== 'running') {
      engineGain.gain.setTargetAtTime(0.0001, now, 0.06);
      driftGain.gain.setTargetAtTime(0.0001, now, 0.05);
      this.engineActive = false;
      return;
    }

    const safeSpeed = Number.isFinite(speed) ? Math.abs(speed) : 0;
    const safeMax = Number.isFinite(maxSpeed) && maxSpeed > 1 ? maxSpeed : 42;
    const ratio = Math.min(1.45, Math.max(0, safeSpeed / safeMax));
    const shrinkPitch = shrunk || shrinkTimer > 0 ? 1.65 : 1.0;

    const baseFreq = (56 + ratio * 134) * shrinkPitch;
    oscMain.frequency.setTargetAtTime(baseFreq, now, 0.045);
    oscSub.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.045);
    lfo.frequency.setTargetAtTime(11 + ratio * 16, now, 0.08);
    filter.frequency.setTargetAtTime((240 + ratio * 1150) * (shrinkPitch > 1 ? 1.3 : 1), now, 0.05);

    const targetGain = 0.04 + Math.min(1, ratio) * 0.062;
    engineGain.gain.setTargetAtTime(targetGain, now, 0.05);

    const isDrifting = Boolean(drifting) && ratio > 0.22;
    const targetDriftGain = isDrifting ? 0.036 + Math.min(1, ratio) * 0.022 : 0.0001;
    driftFilter.frequency.setTargetAtTime(isDrifting ? 1850 + ratio * 900 : 1600, now, 0.06);
    driftGain.gain.setTargetAtTime(targetDriftGain, now, 0.04);
    this.engineActive = true;
  }

  /**
   * Plays procedural arcade SFX for V1 + V2 + V3 race events.
   */
  handleEvent(event, localId) {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
      if (this.ctx.state !== 'running') return;
    }

    const rawType =
      typeof event === 'string'
        ? event
        : event?.type || event?.kind || event?.name || event?.event || '';
    const type = String(rawType).toLowerCase();

    const actorId =
      event?.kartId ??
      event?.playerId ??
      event?.targetId ??
      event?.ownerId ??
      event?.id ??
      null;
    const isLocal = !actorId || !localId || actorId === localId;
    const gainScale = isLocal ? 1.0 : 0.3;

    switch (type) {
      case 'countdown':
      case 'tick':
        this._playCountdownBeep();
        break;

      case 'go':
      case 'start':
        this._playGoFanfare();
        break;

      case 'rocket_start':
        this._playRocketStart(gainScale);
        break;

      case 'rocket_fail':
        this._playRocketFail(gainScale);
        break;

      case 'pickup':
      case 'item_pickup':
      case 'item':
        if (isLocal) this._playPickupArp();
        break;

      case 'boost':
      case 'turbo':
      case 'star':
        if (event?.source === 'draft') {
          this._playDraftBoostChime(gainScale);
        } else {
          this._playBoostWhoosh(gainScale, type === 'star' || event?.item === 'star');
        }
        break;

      case 'shield_block':
        this._playShieldBlock(gainScale);
        break;

      case 'respawn':
        this._playRespawnChime(gainScale);
        break;

      case 'jump':
        this._playJumpBoing(gainScale);
        break;

      case 'stunt':
        this._playStuntChime(gainScale);
        break;

      case 'fire':
      case 'shoot':
      case 'throw':
      case 'drop':
      case 'use_item':
        this._playFirePop(gainScale);
        break;

      case 'lightning':
        this._playLightningStrike();
        break;

      case 'explosion':
        this._playBlueShellExplosion(isLocal ? 1.0 : 0.7);
        break;

      case 'warning':
        if (isLocal) this._playThreatWarning(event?.threat === 'blue_shell');
        break;

      case 'emote':
        this._playEmoteSfx(event, gainScale);
        break;

      case 'fall':
        this._playVoidFall(gainScale);
        break;

      case 'hit':
      case 'spinout':
      case 'crash':
        this._playHitSpinout(
          event?.targetId && localId && event.targetId === localId ? 1.0 : gainScale
        );
        break;

      case 'lap':
      case 'final_lap':
        if (isLocal) {
          const isFinal = Boolean(event?.finalLap || event?.lap === 3 || type === 'final_lap');
          if (isFinal) this.setFinalLap(true);
          this._playLapJingle(isFinal);
        }
        break;

      case 'finish':
      case 'win':
      case 'race_over':
        if (isLocal) this._playFinishFanfare(event?.rank ?? 1);
        break;

      default:
        break;
    }
  }

  _tone({
    freq = 440,
    endFreq = null,
    type = 'triangle',
    start = 0,
    duration = 0.14,
    gain = 0.22,
    filterFreq = 3200,
  }) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;

    const t0 = ctx.currentTime + Math.max(0, start);
    const t1 = t0 + Math.max(0.02, duration);

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (endFreq !== null && Number.isFinite(endFreq)) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t1);
    }

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, t0);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(Math.max(0.001, gain), t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.sfxGain);

    osc.start(t0);
    osc.stop(t1 + 0.02);
  }

  _noiseBurst({ start = 0, duration = 0.22, gain = 0.14, startFreq = 700, endFreq = 2600 }) {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer || !this.sfxGain) return;

    const t0 = ctx.currentTime + Math.max(0, start);
    const t1 = t0 + Math.max(0.03, duration);

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.8;
    filter.frequency.setValueAtTime(Math.max(40, startFreq), t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t1);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(Math.max(0.001, gain), t0 + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t1);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.sfxGain);

    src.start(t0);
    src.stop(t1 + 0.02);
  }

  _playCountdownBeep() {
    this._tone({ freq: 523.25, type: 'square', duration: 0.15, gain: 0.16, filterFreq: 2200 });
    this._tone({ freq: 1046.5, type: 'triangle', duration: 0.12, gain: 0.12, filterFreq: 3400 });
  }

  _playGoFanfare() {
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((f, idx) => {
      this._tone({
        freq: f,
        type: idx % 2 === 0 ? 'sawtooth' : 'square',
        start: idx * 0.018,
        duration: 0.44,
        gain: 0.15,
        filterFreq: 3800,
      });
    });
  }

  _playRocketStart(scale = 1) {
    this._noiseBurst({ duration: 0.45, gain: 0.24 * scale, startFreq: 400, endFreq: 4200 });
    const arp = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    arp.forEach((f, i) => {
      this._tone({
        freq: f,
        type: 'sawtooth',
        start: i * 0.04,
        duration: 0.24,
        gain: 0.17 * scale,
        filterFreq: 4000,
      });
    });
  }

  _playRocketFail(scale = 1) {
    [0, 0.11, 0.23].forEach((t, idx) => {
      this._tone({
        freq: 155 - idx * 28,
        endFreq: 52,
        type: 'sawtooth',
        start: t,
        duration: 0.1,
        gain: 0.22 * scale,
        filterFreq: 680,
      });
    });
    this._noiseBurst({
      start: 0.08,
      duration: 0.28,
      gain: 0.14 * scale,
      startFreq: 600,
      endFreq: 180,
    });
  }

  /**
   * V3: Distinct airy slipstream wind-tunnel whoosh + aerodynamic major seventh chime!
   */
  _playDraftBoostChime(scale = 1) {
    this._noiseBurst({
      duration: 0.42,
      gain: 0.16 * scale,
      startFreq: 950,
      endFreq: 4600,
    });
    const notes = [698.46, 880.0, 1046.5, 1396.91]; // F5 - A5 - C6 - F6
    notes.forEach((f, i) => {
      this._tone({
        freq: f,
        type: 'triangle',
        start: i * 0.042,
        duration: 0.22,
        gain: 0.18 * scale,
        filterFreq: 4800,
      });
    });
  }

  /**
   * V3: Crisp metallic deflection clang + harmonic ping when trailing shield blocks a shell!
   */
  _playShieldBlock(scale = 1) {
    this._noiseBurst({
      duration: 0.12,
      gain: 0.2 * scale,
      startFreq: 2400,
      endFreq: 900,
    });
    this._tone({
      freq: 987.77, // B5
      endFreq: 1480.0, // F#6
      type: 'square',
      duration: 0.16,
      gain: 0.2 * scale,
      filterFreq: 4200,
    });
    this._tone({
      freq: 1975.53, // B6 crystal ping
      type: 'triangle',
      start: 0.04,
      duration: 0.22,
      gain: 0.18 * scale,
      filterFreq: 5000,
    });
  }

  /**
   * V3: Clean arcade teleport / centerline respawn chime!
   */
  _playRespawnChime(scale = 1) {
    const seq = [523.25, 783.99, 1046.5, 1318.51]; // C5 - G5 - C6 - E6
    seq.forEach((f, i) => {
      this._tone({
        freq: f,
        type: 'sine',
        start: i * 0.055,
        duration: 0.16,
        gain: 0.19 * scale,
        filterFreq: 4000,
      });
    });
  }

  _playJumpBoing(scale = 1) {
    this._tone({
      freq: 230,
      endFreq: 690,
      type: 'triangle',
      duration: 0.22,
      gain: 0.2 * scale,
      filterFreq: 3000,
    });
  }

  _playStuntChime(scale = 1) {
    const notes = [659.25, 830.61, 987.77, 1318.51];
    notes.forEach((f, i) => {
      this._tone({
        freq: f,
        type: 'triangle',
        start: i * 0.045,
        duration: 0.18,
        gain: 0.2 * scale,
        filterFreq: 4500,
      });
    });
  }

  _playLightningStrike() {
    this._noiseBurst({ duration: 0.55, gain: 0.3, startFreq: 2800, endFreq: 140 });
    this._tone({
      freq: 1760,
      endFreq: 65,
      type: 'sawtooth',
      duration: 0.38,
      gain: 0.24,
      filterFreq: 3800,
    });
    this._tone({
      freq: 1320,
      endFreq: 95,
      type: 'square',
      start: 0.08,
      duration: 0.28,
      gain: 0.18,
      filterFreq: 3200,
    });
  }

  _playBlueShellExplosion(scale = 1) {
    this._tone({
      freq: 135,
      endFreq: 30,
      type: 'sawtooth',
      duration: 0.52,
      gain: 0.32 * scale,
      filterFreq: 520,
    });
    this._noiseBurst({
      duration: 0.48,
      gain: 0.28 * scale,
      startFreq: 1200,
      endFreq: 90,
    });
  }

  _playThreatWarning(isBlue = false) {
    const base = isBlue ? 1046.5 : 880;
    [0, 0.11, 0.22].forEach((t, i) => {
      this._tone({
        freq: i % 2 === 0 ? base : base * 1.25,
        type: 'square',
        start: t,
        duration: 0.08,
        gain: 0.18,
        filterFreq: 3200,
      });
    });
  }

  _playEmoteSfx(event, scale = 1) {
    const emoteId = String(event?.emoteId || event?.id || '').toLowerCase();
    const isHorn = emoteId === 'horn' || event?.icon === '📯';
    if (isHorn) {
      [
        { start: 0, dur: 0.1 },
        { start: 0.13, dur: 0.24 },
      ].forEach((b) => {
        this._tone({
          freq: 392.0,
          type: 'sawtooth',
          start: b.start,
          duration: b.dur,
          gain: 0.16 * scale,
          filterFreq: 2100,
        });
        this._tone({
          freq: 493.88,
          type: 'sawtooth',
          start: b.start,
          duration: b.dur,
          gain: 0.15 * scale,
          filterFreq: 2100,
        });
      });
    } else {
      this._tone({
        freq: 520,
        endFreq: 920,
        type: 'sine',
        duration: 0.11,
        gain: 0.18 * scale,
        filterFreq: 3500,
      });
    }
  }

  _playVoidFall(scale = 1) {
    this._tone({
      freq: 880,
      endFreq: 150,
      type: 'sine',
      duration: 0.55,
      gain: 0.22 * scale,
      filterFreq: 3000,
    });
    [520, 660, 780].forEach((f, i) => {
      this._tone({
        freq: f,
        type: 'triangle',
        start: 0.58 + i * 0.07,
        duration: 0.1,
        gain: 0.14 * scale,
        filterFreq: 2800,
      });
    });
  }

  _playPickupArp() {
    const notes = [587.33, 739.99, 880.0, 1174.66];
    notes.forEach((f, i) => {
      this._tone({
        freq: f,
        type: 'triangle',
        start: i * 0.048,
        duration: 0.13,
        gain: 0.2,
        filterFreq: 4200,
      });
    });
  }

  _playBoostWhoosh(scale = 1, isStar = false) {
    this._noiseBurst({
      duration: 0.36,
      gain: 0.18 * scale,
      startFreq: 500,
      endFreq: 3400,
    });
    this._tone({
      freq: 190,
      endFreq: 680,
      type: 'sawtooth',
      duration: 0.32,
      gain: 0.16 * scale,
      filterFreq: 2800,
    });
    if (isStar) {
      const sparkle = [783.99, 987.77, 1174.66, 1567.98];
      sparkle.forEach((f, i) => {
        this._tone({
          freq: f,
          type: 'square',
          start: 0.05 + i * 0.055,
          duration: 0.14,
          gain: 0.13 * scale,
          filterFreq: 3600,
        });
      });
    }
  }

  _playFirePop(scale = 1) {
    this._tone({
      freq: 580,
      endFreq: 145,
      type: 'square',
      duration: 0.15,
      gain: 0.2 * scale,
      filterFreq: 2600,
    });
    this._noiseBurst({
      duration: 0.09,
      gain: 0.11 * scale,
      startFreq: 1800,
      endFreq: 700,
    });
  }

  _playHitSpinout(scale = 1) {
    this._tone({
      freq: 165,
      endFreq: 48,
      type: 'sawtooth',
      duration: 0.24,
      gain: 0.26 * scale,
      filterFreq: 900,
    });
    const steps = [720, 610, 510, 410, 310, 220];
    steps.forEach((f, i) => {
      this._tone({
        freq: f,
        endFreq: f * 0.82,
        type: 'triangle',
        start: 0.04 + i * 0.06,
        duration: 0.08,
        gain: 0.18 * scale,
        filterFreq: 2600,
      });
    });
  }

  _playLapJingle(isFinal = false) {
    const mult = isFinal ? 1.1892 : 1.0;
    const seq = [
      { f: 523.25 * mult, t: 0.0, d: 0.1 },
      { f: 659.25 * mult, t: 0.09, d: 0.1 },
      { f: 783.99 * mult, t: 0.18, d: 0.1 },
      { f: 1046.5 * mult, t: 0.28, d: 0.28 },
    ];
    seq.forEach((n) => {
      this._tone({
        freq: n.f,
        type: 'sawtooth',
        start: n.t,
        duration: n.d,
        gain: 0.17,
        filterFreq: 3400,
      });
    });
  }

  _playFinishFanfare(rank = 1) {
    const podium = rank <= 3;
    const notes = podium
      ? [
          { f: 523.25, t: 0.0, d: 0.12 },
          { f: 659.25, t: 0.11, d: 0.12 },
          { f: 783.99, t: 0.22, d: 0.12 },
          { f: 1046.5, t: 0.34, d: 0.18 },
          { f: 783.99, t: 0.52, d: 0.12 },
          { f: 1046.5, t: 0.65, d: 0.48 },
        ]
      : [
          { f: 440.0, t: 0.0, d: 0.14 },
          { f: 523.25, t: 0.14, d: 0.14 },
          { f: 659.25, t: 0.28, d: 0.36 },
        ];

    notes.forEach((n) => {
      this._tone({
        freq: n.f,
        type: 'sawtooth',
        start: n.t,
        duration: n.d,
        gain: 0.18,
        filterFreq: 3600,
      });
      this._tone({
        freq: n.f * 0.5,
        type: 'triangle',
        start: n.t,
        duration: n.d,
        gain: 0.14,
        filterFreq: 1800,
      });
    });
  }
}
