/**
 * PocketKart 3D V3 — Procedural Web Audio Arcade Synthesizer & Dynamic Music Engine
 * Pure Web Audio API (zero external .mp3/.wav dependencies).
 *
 * V3 Additions:
 * - setPaused(bool) / isPaused() cleanly quiets engine + music while Solo is paused and resumes smoothly.
 * - Distinct SFX for 'shield_block', 'respawn', and slipstream draft boost (type === 'boost' && source === 'draft').
 */

import { getBaseTrackId } from '../shared/trackData.js';

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const TRACK_GROOVES = {
  coco: {
    bpm: 128,
    leadWave: 'triangle',
    bassWave: 'triangle',
    padWave: 'triangle',
    leadCutoff: 2800,
    chordCutoff: 1550,
    clap: false,
    lead: [72, null, 76, 79, 81, null, 79, 76, 74, 76, 79, null, 84, 81, 79, 76],
    bass: [48, null, 48, 55, 53, null, 53, 60, 55, null, 55, 50, 48, null, 55, 48],
    chords: [
      [60, 64, 67], null, null, [60, 64, 67],
      [65, 69, 72], null, null, null,
      [67, 71, 74], null, [67, 71, 74], null,
      [60, 64, 67, 71], null, null, null,
    ],
    arp: [72, 76, 79, 84, 77, 81, 84, 89, 79, 83, 86, 91, 72, 76, 79, 84],
  },
  polar: {
    bpm: 124,
    leadWave: 'sine',
    bassWave: 'triangle',
    padWave: 'sine',
    leadCutoff: 3400,
    chordCutoff: 1900,
    clap: false,
    lead: [76, null, 79, 83, 84, null, 83, 79, 74, null, 76, 79, 81, 79, 76, 74],
    bass: [45, null, 52, 57, 41, null, 48, 53, 43, null, 50, 55, 40, null, 47, 52],
    chords: [
      [57, 60, 64, 69], null, null, null,
      [53, 57, 60, 64], null, null, null,
      [55, 59, 62, 67], null, null, null,
      [52, 55, 59, 64], null, [55, 59, 62], null,
    ],
    arp: [76, 81, 84, 88, 77, 81, 84, 88, 79, 83, 86, 91, 76, 79, 83, 88],
  },
  neon: {
    bpm: 134,
    leadWave: 'sawtooth',
    bassWave: 'sawtooth',
    padWave: 'sawtooth',
    leadCutoff: 2300,
    chordCutoff: 1450,
    clap: true,
    lead: [69, null, 72, 76, 79, null, 76, 72, 65, null, 69, 72, 76, 74, 72, 71],
    bass: [33, 45, 33, 45, 36, 48, 36, 48, 29, 41, 29, 41, 31, 43, 32, 44],
    chords: [
      [57, 60, 64], null, [57, 60, 64], null,
      [60, 64, 67], null, [60, 64, 67], null,
      [53, 57, 60], null, [53, 57, 60], null,
      [55, 59, 62], null, [56, 59, 64], null,
    ],
    arp: [69, 72, 76, 81, 72, 76, 79, 84, 65, 69, 72, 77, 67, 71, 76, 80],
  },
  pinball: {
    bpm: 140,
    leadWave: 'square',
    bassWave: 'sawtooth',
    padWave: 'triangle',
    leadCutoff: 2600,
    chordCutoff: 1850,
    clap: true,
    lead: [72, 76, 79, null, 84, 79, 76, null, 74, 77, 81, 77, 79, null, 83, 79],
    bass: [36, 48, 36, 48, 41, 53, 41, 53, 38, 50, 38, 50, 43, 55, 43, 55],
    chords: [
      [60, 64, 67], null, null, [60, 64, 67],
      [65, 69, 72], null, [65, 69, 72], null,
      [62, 65, 69], null, null, [62, 65, 69],
      [67, 71, 74], null, [67, 71, 77], null,
    ],
    arp: [72, 76, 79, 84, 77, 81, 84, 89, 74, 77, 81, 86, 79, 83, 86, 91],
  },
  volcano: {
    bpm: 136,
    leadWave: 'sawtooth',
    bassWave: 'square',
    padWave: 'sawtooth',
    leadCutoff: 2100,
    chordCutoff: 1300,
    clap: false,
    lead: [64, null, 67, 70, 71, 70, 67, null, 62, null, 65, 69, 70, 69, 65, 64],
    bass: [40, 40, 52, 40, 39, 39, 51, 39, 38, 38, 50, 38, 43, 42, 40, 38],
    chords: [
      [52, 55, 59], null, null, null,
      [51, 57, 59], null, null, null,
      [50, 53, 57], null, [50, 53, 57], null,
      [55, 59, 62], null, [52, 55, 59], null,
    ],
    arp: [64, 67, 71, 76, 63, 67, 71, 75, 62, 65, 69, 74, 67, 70, 74, 79],
  },
  rainbow: {
    bpm: 138,
    leadWave: 'triangle',
    bassWave: 'sine',
    padWave: 'sine',
    leadCutoff: 3600,
    chordCutoff: 2200,
    clap: false,
    lead: [67, 71, 74, 78, 79, 74, 71, 74, 69, 72, 76, 81, 79, 76, 74, 71],
    bass: [43, null, 50, 55, 45, null, 52, 57, 40, null, 47, 52, 38, null, 50, 54],
    chords: [
      [55, 59, 62, 66], null, null, null,
      [57, 60, 64, 67], null, null, null,
      [52, 55, 59, 64], null, null, null,
      [50, 54, 57, 62], null, [50, 54, 57, 60], null,
    ],
    arp: [79, 83, 86, 90, 81, 84, 88, 93, 76, 79, 83, 88, 74, 78, 81, 86],
  },
  arena: {
    bpm: 132,
    leadWave: 'square',
    bassWave: 'sawtooth',
    padWave: 'sawtooth',
    leadCutoff: 2500,
    chordCutoff: 1600,
    clap: true,
    lead: [69, 72, 76, null, 79, 76, 72, 69, 71, 74, 77, null, 76, 74, 72, null],
    bass: [33, null, 45, 33, 36, null, 48, 36, 38, null, 50, 38, 40, 43, 40, 36],
    chords: [
      [57, 60, 64], null, [57, 60, 64], null,
      [60, 64, 67], null, null, [60, 64, 67],
      [62, 65, 69], null, [62, 65, 69], null,
      [64, 68, 71], null, [64, 67, 71], null,
    ],
    arp: [69, 72, 76, 81, 72, 76, 79, 84, 74, 77, 81, 86, 76, 80, 83, 88],
  },
};

// Warm, mellow 108 BPM lounge synthwave progression (64 steps = 4 bars: Fmaj9 -> Em7 -> Dm9 -> Cmaj9)
const MENU_GROOVE = {
  bpm: 108,
  steps: 64,
  chords: {
    0: [53, 57, 60, 64, 67],
    10: [53, 57, 60, 64],
    16: [52, 55, 59, 62, 67],
    26: [52, 55, 59, 62],
    32: [50, 53, 57, 60, 64],
    42: [50, 53, 57, 60],
    48: [48, 52, 55, 59, 62],
    58: [50, 55, 59, 64],
  },
  bass: [
    41, null, null, null, null, null, 41, null, 45, null, null, null, 48, null, 45, null,
    40, null, null, null, null, null, 40, null, 43, null, null, null, 47, null, 43, null,
    38, null, null, null, null, null, 38, null, 41, null, null, null, 45, null, 41, null,
    36, null, null, null, null, null, 36, null, 43, null, null, null, 38, null, 43, null,
  ],
  bell: [
    null, null, 72, null, null, null, 76, null, null, null, 79, null, null, null, null, null,
    null, null, 71, null, null, null, 74, null, null, null, 79, null, null, null, null, null,
    null, null, 69, null, null, null, 72, null, null, null, 76, null, null, null, null, null,
    null, null, 67, null, null, null, 71, null, null, null, 74, null, null, null, 76, null,
  ],
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
    this._menuMusicPlaying = false;
    this._musicTrackId = 'coco';
    this._finalLap = false;
    this._musicStep = 0;
    this._menuStep = 0;
    this._nextNoteTime = 0;
    this._musicTimer = null;
    this._silentUnlocked = false;
    this._rearmGestureBound = null;

    if (typeof document !== 'undefined') {
      this._onVisibilityChange = () => {
        if (!this.ctx) return;
        if (document.hidden) {
          this._stopScheduler();
          if (this.ctx.state === 'running' && typeof this.ctx.suspend === 'function') {
            this.ctx.suspend().catch(() => {});
          }
        } else {
          if (!this.muted && this.ctx.state !== 'running') {
            this.ctx.resume().catch(() => {});
            this._armInterruptionRecovery();
          }
          this._nextNoteTime = this.ctx.currentTime + 0.05;
          if ((this._musicPlaying || this._menuMusicPlaying) && !this.muted && this.musicEnabled) {
            this._startScheduler();
          }
        }
        this._syncMusicGain();
      };
      document.addEventListener('visibilitychange', this._onVisibilityChange);
    }
  }

  _armInterruptionRecovery() {
    if (typeof window === 'undefined' || this._rearmGestureBound) return;
    const onGesture = () => {
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('touchend', onGesture, true);
      this._rearmGestureBound = null;
      if (!this.muted && (!document.hidden)) {
        this.unlock();
      }
    };
    this._rearmGestureBound = onGesture;
    window.addEventListener('pointerdown', onGesture, { capture: true, passive: true });
    window.addEventListener('touchend', onGesture, { capture: true, passive: true });
  }

  _playSilentUnlockBuffer() {
    if (!this.ctx || this._silentUnlocked) return;
    try {
      const buf = this.ctx.createBuffer(1, 1, 22050);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
      this._silentUnlocked = true;
    } catch {
      // Ignore if context is not ready yet
    }
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
        this.ctx.onstatechange = () => {
          if (!this.ctx) return;
          if (
            (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') &&
            !this.muted &&
            !(typeof document !== 'undefined' && document.hidden)
          ) {
            this._armInterruptionRecovery();
          }
        };
      } catch {
        return false;
      }
    }

    this._playSilentUnlockBuffer();

    if (!this.muted && this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {});
    }

    if (
      (this._musicPlaying || this._menuMusicPlaying) &&
      !this._musicTimer &&
      !this.muted &&
      this.musicEnabled
    ) {
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
    if (this.ctx) {
      if (this.muted) {
        this._stopScheduler();
        if (this.ctx.state === 'running' && typeof this.ctx.suspend === 'function') {
          this.ctx.suspend().catch(() => {});
        }
      } else if (!(typeof document !== 'undefined' && document.hidden)) {
        if (this.ctx.state !== 'running') {
          this.ctx.resume().catch(() => {});
        }
        if ((this._musicPlaying || this._menuMusicPlaying) && this.musicEnabled) {
          this._startScheduler();
        }
      }
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
    if (!this.musicEnabled) {
      this._stopScheduler();
    } else if (
      this.ctx &&
      !this.muted &&
      (this._musicPlaying || this._menuMusicPlaying) &&
      !this._musicTimer
    ) {
      this._startScheduler();
    }
    this._syncMusicGain();
  }

  isMusicEnabled() {
    return this.musicEnabled;
  }

  setFinalLap(isFinal) {
    this._finalLap = Boolean(isFinal);
  }

  startMenuMusic() {
    const wasPlayingRace = this._musicPlaying;
    this._musicPlaying = false;
    this._finalLap = false;

    if (!this._menuMusicPlaying || wasPlayingRace) {
      this._menuStep = 0;
    }
    this._menuMusicPlaying = true;
    this._syncMusicGain();

    if (this.ctx && !this._musicTimer && !this.muted && this.musicEnabled) {
      this._startScheduler();
    }
  }

  stopMenuMusic() {
    this._menuMusicPlaying = false;
    if (!this._musicPlaying) {
      this._stopScheduler();
    }
    this._syncMusicGain();
  }

  startMusic(trackId = 'coco') {
    const baseId = getBaseTrackId(trackId);
    const cleanId = TRACK_GROOVES[baseId] ? baseId : 'coco';
    const trackChanged = cleanId !== this._musicTrackId;
    const wasMenu = this._menuMusicPlaying;
    this._menuMusicPlaying = false;
    this._musicTrackId = cleanId;

    if (!this._musicPlaying || trackChanged || wasMenu) {
      this._musicStep = 0;
      if (!this._musicPlaying) {
        this._finalLap = false;
      }
    }

    this._musicPlaying = true;
    this._syncMusicGain();

    if (this.ctx && !this._musicTimer && !this.muted && this.musicEnabled) {
      this._startScheduler();
    }
  }

  stopMusic() {
    this._musicPlaying = false;
    this._finalLap = false;
    if (!this._menuMusicPlaying) {
      this._stopScheduler();
    }
    this._syncMusicGain();
  }

  _syncMusicGain() {
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;
    const hidden = typeof document !== 'undefined' && document.hidden;
    const shouldPlay =
      (this._musicPlaying || this._menuMusicPlaying) &&
      this.musicEnabled &&
      !this.muted &&
      !this.paused &&
      !hidden;
    const target = shouldPlay
      ? this._menuMusicPlaying && !this._musicPlaying
        ? 0.17
        : 0.2
      : 0.0001;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setTargetAtTime(target, now, 0.05);
  }

  _startScheduler() {
    if (this._musicTimer || !this.ctx || this.muted || !this.musicEnabled) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    this._nextNoteTime = this.ctx.currentTime + 0.05;
    this._musicTimer = setInterval(() => this._tickMusicScheduler(), 75);
  }

  _stopScheduler() {
    if (this._musicTimer) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
  }

  _tickMusicScheduler() {
    if ((!this._musicPlaying && !this._menuMusicPlaying) || !this.ctx) return;
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

    if (this._menuMusicPlaying && !this._musicPlaying) {
      const stepDur = 60 / MENU_GROOVE.bpm / 4;
      while (this._nextNoteTime < now + 0.18) {
        const step = this._menuStep % MENU_GROOVE.steps;
        this._scheduleMenuStep(step, this._nextNoteTime, stepDur);
        this._nextNoteTime += stepDur;
        this._menuStep = (this._menuStep + 1) % MENU_GROOVE.steps;
      }
      return;
    }

    const groove = TRACK_GROOVES[getBaseTrackId(this._musicTrackId)] || TRACK_GROOVES.coco;
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

  _connectToMusicBus(node, pan = 0, when = 0) {
    if (!this.ctx || !this.musicGain) return;
    if (pan !== 0 && typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), when);
      node.connect(panner);
      panner.connect(this.musicGain);
      return;
    }
    node.connect(this.musicGain);
  }

  _scheduleMenuStep(step, when, stepDur) {
    if (!this.ctx || !this.musicGain) return;

    const chord = MENU_GROOVE.chords[step];
    if (chord) {
      const dur = step % 16 === 0 ? stepDur * 8.5 : stepDur * 4.8;
      chord.forEach((midi, idx) => {
        const pan = -0.26 + (idx / Math.max(1, chord.length - 1)) * 0.52;
        this._musicRhodesNote(midiToFreq(midi), when + idx * 0.014, dur, 0.052, pan);
      });
    }

    const bassMidi = MENU_GROOVE.bass[step];
    if (bassMidi !== null && bassMidi !== undefined) {
      this._musicTone({
        freq: midiToFreq(bassMidi),
        type: 'sine',
        when,
        duration: stepDur * 2.4,
        gain: 0.22,
        cutoff: 380,
        pan: 0,
      });
      this._musicTone({
        freq: midiToFreq(bassMidi),
        type: 'triangle',
        when,
        duration: stepDur * 1.6,
        gain: 0.075,
        cutoff: 440,
        pan: 0,
      });
    }

    const bellMidi = MENU_GROOVE.bell[step];
    if (bellMidi !== null && bellMidi !== undefined) {
      this._musicTone({
        freq: midiToFreq(bellMidi),
        type: 'sine',
        when,
        duration: stepDur * 1.9,
        gain: 0.065,
        cutoff: 2200,
        pan: step % 32 < 16 ? -0.22 : 0.22,
      });
    }

    // Soft feutré kick on 1 & 3 (steps 0, 8) and light syncopated kick on step 10
    const barStep = step % 16;
    if (barStep === 0 || barStep === 8) {
      this._musicSoftKick(when, 0.13);
    } else if (barStep === 10) {
      this._musicSoftKick(when, 0.075);
    }

    // Mellow light rim/brush on beats 2 & 4
    if (barStep === 4 || barStep === 12) {
      this._musicBrushSnare(when, -0.1);
    }

    // Light lounge hi-hat on 8ths + gentle 16th ghost ticks
    if (barStep % 2 === 0) {
      const accent = barStep % 4 === 2 ? 0.042 : 0.024;
      this._musicHat(when, accent, 0.18, 6800);
    } else if (barStep === 7 || barStep === 15) {
      this._musicHat(when, 0.018, 0.18, 7600);
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
        gain: 0.16,
        cutoff: groove.leadCutoff,
        pan: step % 2 === 0 ? -0.1 : 0.1,
      });
    }

    const chord = groove.chords?.[step];
    if (Array.isArray(chord) && chord.length > 0) {
      const chordDur = step % 4 === 0 ? stepDur * 3.1 : stepDur * 1.4;
      const voiceGain = Math.min(0.072, 0.2 / chord.length);
      chord.forEach((midi, idx) => {
        const pan = -0.32 + (idx / Math.max(1, chord.length - 1)) * 0.64;
        this._musicTone({
          freq: midiToFreq(midi + transpose),
          type: groove.padWave || 'triangle',
          when,
          duration: chordDur,
          gain: voiceGain,
          cutoff: groove.chordCutoff || 1600,
          pan,
        });
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
        gain: 0.23,
        cutoff: 780,
        pan: 0,
      });
    }

    // Final lap sparkling arpeggio layer
    if (this._finalLap && groove.arp) {
      const arpMidi = groove.arp[step];
      if (arpMidi !== null && arpMidi !== undefined) {
        const panSweep = Math.sin(step * 0.85) * 0.38;
        this._musicTone({
          freq: midiToFreq(arpMidi + transpose),
          type: 'triangle',
          when,
          duration: stepDur * 0.72,
          gain: 0.085,
          cutoff: 4200,
          pan: panSweep,
        });
      }
    }

    if (step % 4 === 0) {
      this._musicKick(when);
    } else if (step % 4 === 2) {
      this._musicHat(when, 0.065, 0.22, 5500);
    } else if (this._finalLap) {
      this._musicHat(when, 0.026, 0.22, 6800);
    }

    // Snare / clap on beats 2 & 4 (steps 4 and 12)
    if (step === 4 || step === 12) {
      this._musicSnare(when, groove.clap, -0.12);
    }
  }

  _musicRhodesNote(freq, when, duration, gain, pan = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;

    const oscBody = ctx.createOscillator();
    oscBody.type = 'sine';
    oscBody.frequency.setValueAtTime(Math.max(40, freq), when);

    const oscTine = ctx.createOscillator();
    oscTine.type = 'triangle';
    oscTine.frequency.setValueAtTime(Math.max(40, freq * 2), when);

    const tineGain = ctx.createGain();
    tineGain.gain.setValueAtTime(0.22, when);
    tineGain.gain.exponentialRampToValueAtTime(0.02, when + Math.min(0.18, duration * 0.45));

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1350, when);
    filter.frequency.exponentialRampToValueAtTime(680, when + Math.max(0.1, duration));

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(gain, when + 0.018);
    env.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.08, duration));

    oscBody.connect(filter);
    oscTine.connect(tineGain);
    tineGain.connect(filter);
    filter.connect(env);
    this._connectToMusicBus(env, pan, when);

    oscBody.start(when);
    oscTine.start(when);
    const stopAt = when + Math.max(0.1, duration) + 0.02;
    oscBody.stop(stopAt);
    oscTine.stop(stopAt);
  }

  _musicSoftKick(when, gain = 0.13) {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(92, when);
    osc.frequency.exponentialRampToValueAtTime(38, when + 0.09);

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, when);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.11);

    osc.connect(env);
    this._connectToMusicBus(env, 0, when);
    osc.start(when);
    osc.stop(when + 0.12);
  }

  _musicBrushSnare(when, pan = -0.1) {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer || !this.musicGain) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2200, when);
    bp.Q.value = 1.4;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.036, when);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.065);

    src.connect(bp);
    bp.connect(env);
    this._connectToMusicBus(env, pan, when);
    src.start(when);
    src.stop(when + 0.075);
  }

  _musicTone({ freq, type, when, duration, gain, cutoff, pan = 0 }) {
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
    this._connectToMusicBus(env, pan, when);

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
    this._connectToMusicBus(env, 0, when);
    osc.start(when);
    osc.stop(when + 0.1);
  }

  _musicSnare(when, isClap = false, pan = -0.12) {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer || !this.musicGain) return;

    if (!isClap) {
      const body = ctx.createOscillator();
      body.type = 'triangle';
      body.frequency.setValueAtTime(195, when);
      body.frequency.exponentialRampToValueAtTime(98, when + 0.055);

      const bodyEnv = ctx.createGain();
      bodyEnv.gain.setValueAtTime(0.11, when);
      bodyEnv.gain.exponentialRampToValueAtTime(0.0001, when + 0.065);

      body.connect(bodyEnv);
      this._connectToMusicBus(bodyEnv, pan, when);
      body.start(when);
      body.stop(when + 0.075);
    }

    const taps = isClap ? [0, 0.011, 0.022] : [0];
    taps.forEach((offset, idx) => {
      const t = when + offset;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(isClap ? 1850 : 2100, t);
      bp.Q.value = isClap ? 1.5 : 1.1;

      const env = ctx.createGain();
      const peak = isClap ? (idx === 2 ? 0.095 : 0.065) : 0.095;
      const dur = isClap ? (idx === 2 ? 0.1 : 0.025) : 0.095;
      env.gain.setValueAtTime(peak, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      src.connect(bp);
      bp.connect(env);
      this._connectToMusicBus(env, pan, t);
      src.start(t);
      src.stop(t + dur + 0.01);
    });
  }

  _musicHat(when, gain = 0.065, pan = 0.22, cutoff = 5500) {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer || !this.musicGain) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(cutoff, when);

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, when);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.038);

    src.connect(hp);
    hp.connect(env);
    this._connectToMusicBus(env, pan, when);
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
    const hidden = typeof document !== 'undefined' && document.hidden;
    const shouldPlayMusic =
      (this._musicPlaying || this._menuMusicPlaying) &&
      this.musicEnabled &&
      !this.muted &&
      !this.paused &&
      !hidden;
    this.musicGain.gain.value = shouldPlayMusic
      ? this._menuMusicPlaying && !this._musicPlaying
        ? 0.17
        : 0.2
      : 0.0001;

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

    // Warm, low-fatigue multi-layer engine purr (triangle fundamental + soft sine fifth + gentle texture)
    const oscMain = ctx.createOscillator();
    oscMain.type = 'triangle';
    oscMain.frequency.value = 62;

    const oscHarm = ctx.createOscillator();
    oscHarm.type = 'sine';
    oscHarm.frequency.value = 93;

    const oscSub = ctx.createOscillator();
    oscSub.type = 'sine';
    oscSub.frequency.value = 31;

    const oscTex = ctx.createOscillator();
    oscTex.type = 'sawtooth';
    oscTex.frequency.value = 62;

    const harmMix = ctx.createGain();
    harmMix.gain.value = 0.26;
    const subMix = ctx.createGain();
    subMix.gain.value = 0.42;
    const texMix = ctx.createGain();
    texMix.gain.value = 0.09;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 210;
    filter.Q.value = 0.65;

    const purrGain = ctx.createGain();
    purrGain.gain.value = 0.92;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 10;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.07;
    lfo.connect(lfoGain);
    lfoGain.connect(purrGain.gain);

    const engineGain = ctx.createGain();
    engineGain.gain.value = 0.0001;

    oscMain.connect(filter);
    oscHarm.connect(harmMix);
    harmMix.connect(filter);
    oscSub.connect(subMix);
    subMix.connect(filter);
    oscTex.connect(texMix);
    texMix.connect(filter);

    filter.connect(purrGain);
    purrGain.connect(engineGain);
    engineGain.connect(destination);

    const driftNoise = ctx.createBufferSource();
    driftNoise.buffer = this.noiseBuffer;
    driftNoise.loop = true;

    const driftFilter = ctx.createBiquadFilter();
    driftFilter.type = 'bandpass';
    driftFilter.frequency.value = 1450;
    driftFilter.Q.value = 1.6;

    const driftGain = ctx.createGain();
    driftGain.gain.value = 0.0001;

    driftNoise.connect(driftFilter);
    driftFilter.connect(driftGain);
    driftGain.connect(destination);

    oscMain.start();
    oscHarm.start();
    oscSub.start();
    oscTex.start();
    lfo.start();
    driftNoise.start();

    this.engineNodes = {
      oscMain,
      oscHarm,
      oscSub,
      oscTex,
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
    boosting = false,
    active = false,
    shrunk = false,
    shrinkTimer = 0,
  } = {}) {
    if (!this.ctx || !this.engineNodes) return;

    const now = this.ctx.currentTime;
    const {
      oscMain,
      oscHarm,
      oscSub,
      oscTex,
      lfo,
      filter,
      engineGain,
      driftFilter,
      driftGain,
    } = this.engineNodes;

    if (!active || this.paused || this.muted || this.ctx.state !== 'running') {
      engineGain.gain.setTargetAtTime(0.0001, now, 0.07);
      driftGain.gain.setTargetAtTime(0.0001, now, 0.05);
      this.engineActive = false;
      return;
    }

    const safeSpeed = Number.isFinite(speed) ? Math.abs(speed) : 0;
    const safeMax = Number.isFinite(maxSpeed) && maxSpeed > 1 ? maxSpeed : 42;
    const ratio = Math.min(1.4, Math.max(0, safeSpeed / safeMax));
    const shrinkPitch = shrunk || shrinkTimer > 0 ? 1.5 : 1.0;

    const boostPitch = boosting ? 14 : 0;
    const baseFreq = (56 + ratio * 92 + boostPitch) * shrinkPitch;
    oscMain.frequency.setTargetAtTime(baseFreq, now, 0.055);
    oscHarm.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.055);
    oscSub.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.055);
    oscTex.frequency.setTargetAtTime(baseFreq, now, 0.055);
    lfo.frequency.setTargetAtTime(9 + ratio * 12, now, 0.09);

    const cutoff = (180 + ratio * 460 + (boosting ? 110 : 0)) * (shrinkPitch > 1 ? 1.25 : 1);
    filter.frequency.setTargetAtTime(cutoff, now, 0.06);

    const targetGain = 0.011 + Math.min(1, ratio) * 0.032 + (boosting ? 0.007 : 0);
    engineGain.gain.setTargetAtTime(targetGain, now, 0.06);

    const isDrifting = Boolean(drifting) && ratio > 0.24;
    const targetDriftGain = isDrifting ? 0.016 + Math.min(1, ratio) * 0.014 : 0.0001;
    driftFilter.frequency.setTargetAtTime(isDrifting ? 1350 + ratio * 650 : 1200, now, 0.07);
    driftGain.gain.setTargetAtTime(targetDriftGain, now, 0.05);
    this.engineActive = true;
  }

  /**
   * Plays procedural arcade SFX for V1 + V2 + V3 race events.
   */
  handleEvent(event, localId) {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state !== 'running') {
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

      case 'coin':
        this._playCoinChime(isLocal ? 1.0 : 0.25);
        break;

      case 'bumper':
        this._playBumperBoing(gainScale);
        break;

      case 'knockout_tick':
        this._playKnockoutTick(event?.count ?? 3);
        break;

      case 'eliminated':
        this._playEliminated(isLocal ? 1.0 : 0.45);
        break;

      case 'balloon_pop': {
        const atkLocal = event?.attackerId && localId && event.attackerId === localId;
        this._playBalloonPop(isLocal || atkLocal ? 1.0 : 0.45, Boolean(atkLocal));
        break;
      }

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

      case 'rescue':
        this._playRescueHook(gainScale);
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
    // Playful slide-whistle plunge + bubbly ditch splash burst
    this._tone({
      freq: 780,
      endFreq: 145,
      type: 'sine',
      duration: 0.56,
      gain: 0.2 * scale,
      filterFreq: 2600,
    });
    this._noiseBurst({
      start: 0.45,
      duration: 0.28,
      gain: 0.16 * scale,
      startFreq: 950,
      endFreq: 320,
    });
  }

  _playRescueHook(scale = 1) {
    // Cheerful Cloud Fisherman fishing-reel tick + ascending rescue chime
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this._tone({
        freq: f,
        type: 'triangle',
        start: i * 0.075,
        duration: 0.14,
        gain: 0.15 * scale,
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

  _playCoinChime(scale = 1) {
    this._tone({ freq: 987.77, type: 'sine', start: 0, duration: 0.08, gain: 0.22 * scale, filterFreq: 4800 });
    this._tone({ freq: 1318.51, type: 'sine', start: 0.075, duration: 0.22, gain: 0.24 * scale, filterFreq: 5200 });
  }

  _playBumperBoing(scale = 1) {
    this._tone({ freq: 240, endFreq: 720, type: 'triangle', start: 0, duration: 0.16, gain: 0.28 * scale, filterFreq: 3200 });
    this._tone({ freq: 1046.5, type: 'sine', start: 0.04, duration: 0.14, gain: 0.16 * scale, filterFreq: 4500 });
  }

  _playKnockoutTick(count = 3) {
    const pitch = 520 + (5 - Math.max(1, Math.min(5, count))) * 110;
    this._tone({ freq: pitch, type: 'square', start: 0, duration: 0.09, gain: 0.16, filterFreq: 2400 });
  }

  _playEliminated(scale = 1) {
    this._tone({ freq: 260, endFreq: 58, type: 'sawtooth', start: 0, duration: 0.42, gain: 0.28 * scale, filterFreq: 1400 });
    this._noiseBurst({ start: 0, duration: 0.3, gain: 0.18 * scale, startFreq: 1200, endFreq: 240 });
  }

  _playBalloonPop(scale = 1, isAttackerLocal = false) {
    this._noiseBurst({ start: 0, duration: 0.12, gain: 0.28 * scale, startFreq: 2400, endFreq: 450 });
    this._tone({ freq: 380, endFreq: 110, type: 'triangle', start: 0, duration: 0.14, gain: 0.24 * scale, filterFreq: 2200 });
    if (isAttackerLocal) {
      this._tone({ freq: 880, type: 'sine', start: 0.08, duration: 0.14, gain: 0.18, filterFreq: 4200 });
    }
  }

  playLevelUpFanfare() {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {});
    }
    const notes = [
      { f: 587.33, t: 0.0, d: 0.11 },
      { f: 739.99, t: 0.1, d: 0.11 },
      { f: 880.0, t: 0.2, d: 0.12 },
      { f: 1174.66, t: 0.32, d: 0.42 },
    ];
    notes.forEach((n) => {
      this._tone({
        freq: n.f,
        type: 'triangle',
        start: n.t,
        duration: n.d,
        gain: 0.24,
        filterFreq: 4400,
      });
    });
  }

  playUiTick() {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {});
    }
    this._tone({
      freq: 620,
      endFreq: 740,
      type: 'triangle',
      start: 0,
      duration: 0.045,
      gain: 0.08,
      filterFreq: 2600,
    });
  }

  playUiConfirm() {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {});
    }
    this._tone({
      freq: 523.25,
      endFreq: 783.99,
      type: 'triangle',
      start: 0,
      duration: 0.08,
      gain: 0.12,
      filterFreq: 3400,
    });
    this._tone({
      freq: 783.99,
      type: 'sine',
      start: 0.055,
      duration: 0.09,
      gain: 0.1,
      filterFreq: 3800,
    });
  }

  playUiBack() {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {});
    }
    this._tone({
      freq: 540,
      endFreq: 360,
      type: 'triangle',
      start: 0,
      duration: 0.07,
      gain: 0.09,
      filterFreq: 2200,
    });
  }

  /**
   * Ascending crystalline chime for Mini-Turbo drift charge tiers (1 | 2 | 3).
   */
  playDriftTierTick(tier = 1) {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {});
    }

    const level = Math.max(1, Math.min(3, Math.round(Number(tier) || 1)));
    const presets = {
      1: [659.25, 987.77],
      2: [880.0, 1174.66, 1479.98],
      3: [1046.5, 1318.51, 1567.98, 2093.0],
    };
    const notes = presets[level];

    notes.forEach((freq, idx) => {
      const start = idx * 0.032;
      this._tone({
        freq,
        type: 'sine',
        start,
        duration: level === 3 ? 0.18 : 0.13,
        gain: 0.13 + level * 0.015,
        filterFreq: 5600,
      });
      this._tone({
        freq: freq * 1.5,
        type: 'triangle',
        start,
        duration: 0.075,
        gain: 0.045 + level * 0.01,
        filterFreq: 6400,
      });
    });
  }

  /**
   * Subtle overtake chime; adds a golden sparkle when taking 1st place (newRank === 1).
   */
  playOvertakeChime(newRank = 2) {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {});
    }

    const isLeader = Number(newRank) === 1;
    if (isLeader) {
      const goldNotes = [783.99, 987.77, 1174.66, 1567.98];
      goldNotes.forEach((freq, idx) => {
        const start = idx * 0.042;
        this._tone({
          freq,
          type: 'triangle',
          start,
          duration: idx === goldNotes.length - 1 ? 0.28 : 0.14,
          gain: 0.14,
          filterFreq: 5400,
        });
        this._tone({
          freq: freq * 2,
          type: 'sine',
          start: start + 0.01,
          duration: 0.12,
          gain: 0.06,
          filterFreq: 6800,
        });
      });
      return;
    }

    const passNotes = [587.33, 880.0];
    passNotes.forEach((freq, idx) => {
      this._tone({
        freq,
        type: 'sine',
        start: idx * 0.045,
        duration: 0.11,
        gain: 0.1,
        filterFreq: 4200,
      });
    });
  }
}
