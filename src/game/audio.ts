// ============================================================
// Procedural audio — no samples, no licences, just WebAudio.
// A folk-ambient bed (wind, crickets, a low drone with slow
// chords and sparse pentatonic plucks) that darkens with dusk,
// plus synthesized barks, bleats, whistles, growls and bells.
// ============================================================

import { STORAGE_KEYS } from './config.ts';
import { clamp, lerp } from './rng.ts';

const PLUCK_SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 659.25];
const CHORDS_DAY: number[][] = [
  [220, 261.63, 329.63], // Am
  [174.61, 220, 261.63], // F
  [196, 246.94, 293.66], // G-ish
  [220, 261.63, 329.63], // Am
];
const CHORDS_NIGHT: number[][] = [
  [220, 261.63, 329.63], // Am
  [164.81, 246.94, 329.63], // Em
  [174.61, 220, 261.63], // F
  [220, 261.63, 311.13], // Am(dim color)
];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private amb!: GainNode;

  volume = 0.8;
  muted = false;

  // ambience nodes
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private cricketGain!: GainNode;
  private padOscs: OscillatorNode[] = [];
  private padGains: GainNode[] = [];
  private padFilter!: BiquadFilterNode;
  private droneOsc!: OscillatorNode;

  private chordIdx = 0;
  private nextChordAt = 0;
  private nextPluckAt = 0;

  constructor() {
    const v = localStorage.getItem(STORAGE_KEYS.volume);
    if (v !== null) this.volume = clamp(parseFloat(v) || 0.8, 0, 1);
    this.muted = localStorage.getItem(STORAGE_KEYS.muted) === '1';
  }

  get unlocked(): boolean {
    return !!this.ctx;
  }

  /** must be called from a user gesture */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.amb = ctx.createGain();
    this.sfx.connect(this.master);
    this.music.connect(this.master);
    this.amb.connect(this.master);
    this.sfx.gain.value = 0.9;
    this.music.gain.value = 0.34;
    this.amb.gain.value = 0.5;
    this.applyMaster();
    this.buildAmbience();
    this.buildMusic();
  }

  private applyMaster(): void {
    if (!this.ctx) return;
    const target = this.muted ? 0 : this.volume * this.volume;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  setVolume(v: number): void {
    this.volume = clamp(v, 0, 1);
    localStorage.setItem(STORAGE_KEYS.volume, String(this.volume));
    this.applyMaster();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(STORAGE_KEYS.muted, this.muted ? '1' : '0');
    this.applyMaster();
    return this.muted;
  }

  // ---------------- ambience ----------------

  private noiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // pinkish noise via leaky integrator mix
      const white = Math.random() * 2 - 1;
      last = last * 0.97 + white * 0.03;
      data[i] = last * 6 + white * 0.12;
    }
    return buf;
  }

  private buildAmbience(): void {
    const ctx = this.ctx!;
    // wind
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer(4);
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 320;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.22;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.amb);
    wind.start();
    // slow wind LFO
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(this.windFilter.frequency);
    lfo.start();

    // crickets: high band noise pulsed fast
    const cr = ctx.createBufferSource();
    cr.buffer = this.noiseBuffer(2);
    cr.loop = true;
    const crBand = ctx.createBiquadFilter();
    crBand.type = 'bandpass';
    crBand.frequency.value = 4300;
    crBand.Q.value = 9;
    this.cricketGain = ctx.createGain();
    this.cricketGain.gain.value = 0;
    const pulse = ctx.createGain();
    pulse.gain.value = 0.5;
    const pulseLfo = ctx.createOscillator();
    pulseLfo.frequency.value = 21;
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.5;
    pulseLfo.connect(pulseDepth).connect(pulse.gain);
    pulseLfo.start();
    cr.connect(crBand).connect(pulse).connect(this.cricketGain).connect(this.amb);
    cr.start();
  }

  private buildMusic(): void {
    const ctx = this.ctx!;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 0.4;
    this.padFilter.connect(this.music);

    // low drone A
    this.droneOsc = ctx.createOscillator();
    this.droneOsc.type = 'sawtooth';
    this.droneOsc.frequency.value = 55;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.05;
    this.droneOsc.connect(droneGain).connect(this.padFilter);
    this.droneOsc.start();

    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = i === 1 ? 'triangle' : 'sawtooth';
      o.frequency.value = CHORDS_DAY[0][i];
      o.detune.value = (i - 1) * 5;
      const g = ctx.createGain();
      g.gain.value = 0.028;
      o.connect(g).connect(this.padFilter);
      o.start();
      this.padOscs.push(o);
      this.padGains.push(g);
    }
    this.nextChordAt = ctx.currentTime + 8;
    this.nextPluckAt = ctx.currentTime + 3;
  }

  /** call every frame with world state */
  update(darkness: number, avgFear: number, dogSpeed: number, paused: boolean): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // wind eases off; crickets rise after sundown
    this.windGain.gain.setTargetAtTime(lerp(0.26, 0.1, darkness) * (paused ? 0.4 : 1), t, 0.4);
    this.cricketGain.gain.setTargetAtTime(clamp((darkness - 0.45) / 0.4, 0, 1) * 0.16 * (paused ? 0.3 : 1), t, 0.6);

    // music darkens: filter closes, tension opens it slightly
    const cutoff = lerp(1050, 420, darkness) + avgFear * 320 + dogSpeed * 8;
    this.padFilter.frequency.setTargetAtTime(cutoff, t, 0.5);
    this.music.gain.setTargetAtTime(paused ? 0.16 : 0.34, t, 0.3);

    // chord changes
    if (t >= this.nextChordAt) {
      const set = darkness > 0.6 ? CHORDS_NIGHT : CHORDS_DAY;
      this.chordIdx = (this.chordIdx + 1) % set.length;
      const chord = set[this.chordIdx];
      for (let i = 0; i < 3; i++) {
        this.padOscs[i].frequency.setTargetAtTime(chord[i], t, 1.6);
      }
      this.nextChordAt = t + 8 + Math.random() * 5;
    }

    // sparse plucks — rarer and lower as night falls
    if (!paused && t >= this.nextPluckAt) {
      const n = PLUCK_SCALE[Math.floor(Math.random() * (darkness > 0.6 ? 5 : PLUCK_SCALE.length))];
      this.pluck(n, 0.05 + Math.random() * 0.04);
      this.nextPluckAt = t + lerp(4, 10, darkness) + Math.random() * 6;
    }
  }

  private pluck(freq: number, gain: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    // simple echo
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.4;
    o.connect(g);
    g.connect(this.music);
    g.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(this.music);
    o.start(t);
    o.stop(t + 2.4);
  }

  // ---------------- one-shots ----------------

  private env(gain: number, attack: number, decay: number): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.sfx);
    return g;
  }

  bark(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const dt of [0, 0.11]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(340, t + dt);
      o.frequency.exponentialRampToValueAtTime(150, t + dt + 0.085);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.5, t + dt + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.1);
      o.connect(f).connect(g).connect(this.sfx);
      o.start(t + dt);
      o.stop(t + dt + 0.12);
      // breath noise
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuffer(0.1);
      const nf = ctx.createBiquadFilter();
      nf.type = 'highpass';
      nf.frequency.value = 900;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t + dt);
      ng.gain.exponentialRampToValueAtTime(0.18, t + dt + 0.01);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.07);
      n.connect(nf).connect(ng).connect(this.sfx);
      n.start(t + dt);
    }
  }

  whistle(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(1560, t + 0.16);
    o.frequency.setValueAtTime(1560, t + 0.22);
    o.frequency.exponentialRampToValueAtTime(660, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
    g.gain.setValueAtTime(0.22, t + 0.42);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    const vib = ctx.createOscillator();
    vib.frequency.value = 11;
    const vibG = ctx.createGain();
    vibG.gain.value = 14;
    vib.connect(vibG).connect(o.frequency);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.6);
    vib.start(t);
    vib.stop(t + 0.6);
  }

  baa(dist: number, pitch: number, fear: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = clamp(1 - dist / 60, 0, 1);
    if (vol < 0.03) return;
    const base = 320 + pitch * 260 + fear * 90;
    const dur = 0.3 + Math.random() * 0.25;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = base;
    const trem = ctx.createOscillator();
    trem.frequency.value = 8.5 + Math.random() * 2.5;
    const tremG = ctx.createGain();
    tremG.gain.value = base * 0.045;
    trem.connect(tremG).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 760;
    f.Q.value = 1.1;
    const g = ctx.createGain();
    const peak = 0.14 * vol * (0.7 + fear * 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.05);
    g.gain.setValueAtTime(peak, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
    trem.start(t);
    trem.stop(t + dur + 0.05);
  }

  growl(dist: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = clamp(1 - dist / 55, 0, 1);
    if (vol < 0.04) return;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer(1.4);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 240;
    const g = this.env(0.3 * vol, 0.15, 1.1);
    const wob = ctx.createOscillator();
    wob.frequency.value = 13;
    const wobG = ctx.createGain();
    wobG.gain.value = 90;
    wob.connect(wobG).connect(f.frequency);
    n.connect(f).connect(g);
    n.start(t);
    wob.start(t);
    wob.stop(t + 1.4);
    const sub = ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.value = 52;
    const sg = this.env(0.16 * vol, 0.12, 1.0);
    sub.connect(sg);
    sub.start(t);
    sub.stop(t + 1.3);
  }

  snarl(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer(0.4);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 800;
    f.Q.value = 0.7;
    const g = this.env(0.34, 0.02, 0.34);
    n.connect(f).connect(g);
    n.start(t);
  }

  grabSting(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.4);
    const g = this.env(0.55, 0.01, 0.5);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.55);
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer(0.2);
    const nf = ctx.createBiquadFilter();
    nf.type = 'highpass';
    nf.frequency.value = 1800;
    const ng = this.env(0.2, 0.005, 0.15);
    n.connect(nf).connect(ng);
    n.start(t);
  }

  freedNote(): void {
    this.bell(523.25, 0.14);
    setTimeout(() => this.bell(659.25, 0.12), 110);
  }

  bell(freq: number, gain = 0.16): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const [mult, g0] of [[1, gain], [2.76, gain * 0.3], [5.4, gain * 0.12]] as Array<[number, number]>) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(g0, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      o.connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + 1.4);
    }
  }

  gateChime(step: number): void {
    const scale = [392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    this.bell(scale[Math.min(step, scale.length - 1)], 0.15);
  }

  uiClick(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer(0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1600;
    f.Q.value = 2.5;
    const g = this.env(0.14, 0.004, 0.06);
    n.connect(f).connect(g);
    n.start();
  }

  footstep(inWater: boolean): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer(0.06);
    const f = ctx.createBiquadFilter();
    f.type = inWater ? 'bandpass' : 'lowpass';
    f.frequency.value = inWater ? 1100 : 380;
    const g = this.env(inWater ? 0.1 : 0.055, 0.003, inWater ? 0.1 : 0.055);
    n.connect(f).connect(g);
    n.start();
  }

  winFanfare(): void {
    const notes = [440, 523.25, 659.25, 880];
    notes.forEach((f, i) => setTimeout(() => this.bell(f, 0.18), i * 150));
  }

  loseDrone(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const [f0, f1] of [[220, 208], [277, 262]] as Array<[number, number]>) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.linearRampToValueAtTime(f1, t + 2.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      o.connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + 2.7);
    }
  }
}
