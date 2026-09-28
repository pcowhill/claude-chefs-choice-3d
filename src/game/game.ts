// ============================================================
// GLOAMING — orchestrator. Owns the renderer, the state machine
// (title → howto → playing ⇄ paused → end), the run lifecycle,
// scoring, gates, and all cross-system event routing.
// ============================================================

import * as THREE from 'three';
import { World } from './world.ts';
import { Sky } from './sky.ts';
import { buildScenery, updateScenery, type SceneryHandles } from './scenery.ts';
import { Dog } from './dog.ts';
import { DogCamera } from './camera.ts';
import { Flock, type SheepAgent } from './sheep.ts';
import { WolfPack, type Wolf } from './wolves.ts';
import { FX } from './fx.ts';
import { AudioEngine } from './audio.ts';
import { HUD, type PipInfo } from './hud.ts';
import { UI, type EndStats } from './ui.ts';
import { Input } from './input.ts';
import { ZONES, DOG, DUSK, SCORING, RANKS, STORAGE_KEYS } from './config.ts';
import { clamp, lerp } from './rng.ts';

type GameState = 'boot' | 'title' | 'playing' | 'paused' | 'ending' | 'end';

interface BestRecord {
  score: number;
  rank: string;
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private world: World;
  private sky: Sky;
  private scenery: SceneryHandles;
  private terrain: THREE.Mesh;
  private water: THREE.Mesh;
  private input: Input;
  private hud: HUD;
  private ui: UI;
  private audio = new AudioEngine();

  private dogCam: DogCamera;
  private dog!: Dog;
  private flock!: Flock;
  private wolves!: WolfPack;
  private fx!: FX;

  private state: GameState = 'boot';
  private elapsed = 0; // run time (drives dusk)
  private wallTime = 0;
  private timeScale = 1;
  private hitstop = 0;

  // run bookkeeping
  private barks = 0;
  private distance = 0;
  private gateCounts: number[] = [0, 0, 0];
  private gatePassed: Array<Set<number>> = [new Set(), new Set(), new Set()];
  private zoneIdx = -1;
  private foldShut = false;
  private endingTimer = 0;
  private pendingEnd: EndStats | null = null;
  private lostCauses = new Map<number, string>();
  private firstWolfSeen = false;
  private stepPhase = 0;
  private hadLockThisRun = false;
  private lastCamProj = new THREE.Vector3();
  private titleOrbitT = 0;

  private best: BestRecord = { score: 0, rank: '' };

  constructor(canvasRoot: HTMLElement, uiRoot: HTMLElement) {
    // ?lowfx — lifeline for weak/software GPUs (and headless testing)
    const lowfx = new URLSearchParams(location.search).has('lowfx');
    this.renderer = new THREE.WebGLRenderer({ antialias: !lowfx, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(lowfx ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = !lowfx;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.16;
    canvasRoot.appendChild(this.renderer.domElement);

    this.world = new World();
    this.sky = new Sky(this.scene);
    this.terrain = this.world.buildTerrainMesh();
    this.water = this.world.buildWaterMesh();
    this.scene.add(this.terrain, this.water);
    this.scenery = buildScenery(this.world);
    this.scene.add(this.scenery.group);

    this.dogCam = new DogCamera(window.innerWidth / window.innerHeight);
    this.input = new Input(this.renderer.domElement);
    this.hud = new HUD(uiRoot);
    this.ui = new UI(uiRoot, {
      onStart: () => this.handleStartPressed(),
      onResume: () => this.resume(),
      onRestart: () => this.beginRun(),
      onQuitToTitle: () => this.toTitle(),
      onVolume: (v) => this.audio.setVolume(v),
      onMuteToggle: () => this.audio.toggleMute(),
      onClick: () => {
        this.audio.unlock();
        this.audio.uiClick();
      },
    });
    this.ui.syncSound(this.audio.volume, this.audio.muted);

    this.loadBest();
    this.createRunEntities();

    window.addEventListener('resize', () => this.onResize());
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.pointerLocked) this.input.requestLock();
    });

    if (new URLSearchParams(location.search).has('debug')) {
      this.installDebug();
    }

    this.toTitle();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  // ---------------- lifecycle ----------------

  private createRunEntities(): void {
    if (this.dog) this.scene.remove(this.dog.group);
    if (this.flock) this.scene.remove(this.flock.group);
    if (this.wolves) this.scene.remove(this.wolves.group);
    if (this.fx) this.scene.remove(this.fx.group);

    this.dog = new Dog(this.world);
    this.flock = new Flock(this.world);
    this.wolves = new WolfPack();
    this.fx = new FX(this.world);
    this.scene.add(this.dog.group, this.flock.group, this.wolves.group, this.fx.group);

    for (const a of this.flock.agents) {
      if (a.isStray) this.fx.addStrayMarker(a.id, a.pos);
    }

    // fold gate visual back to open
    this.scenery.foldGateBar.rotation.y = Math.PI / 2 + 0.35;
  }

  private resetRunState(): void {
    this.elapsed = 0;
    this.barks = 0;
    this.distance = 0;
    this.gateCounts = [0, 0, 0];
    this.gatePassed = [new Set(), new Set(), new Set()];
    this.zoneIdx = -1;
    this.foldShut = false;
    this.endingTimer = 0;
    this.pendingEnd = null;
    this.lostCauses.clear();
    this.firstWolfSeen = false;
    this.timeScale = 1;
    this.hitstop = 0;
    this.hud.reset();
  }

  private handleStartPressed(): void {
    this.audio.unlock();
    if (!localStorage.getItem(STORAGE_KEYS.seenHowto)) {
      localStorage.setItem(STORAGE_KEYS.seenHowto, '1');
      this.ui.showHowto('title');
      return;
    }
    this.beginRun();
  }

  private beginRun(): void {
    this.audio.unlock();
    this.createRunEntities();
    this.resetRunState();
    this.ui.hideAll();
    this.hud.show();
    this.state = 'playing';
    this.hadLockThisRun = false;
    this.input.requestLock();
    this.hud.showZoneCard('I', 'The High Meadow');
    this.hud.message('Bring them down the vale. The light will not wait.');
    this.hud.setLockHint(!this.input.pointerLocked);
    setTimeout(() => this.hud.setLockHint(false), 6000);
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.releaseLock();
    this.ui.showPause();
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.ui.hidePause();
    this.state = 'playing';
    this.hadLockThisRun = false;
    this.input.requestLock();
  }

  private toTitle(): void {
    this.state = 'title';
    this.input.releaseLock();
    this.hud.hide();
    this.createRunEntities();
    this.resetRunState();
    this.ui.showTitle(this.best.score, this.best.rank);
  }

  // ---------------- persistence ----------------

  private loadBest(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.best);
      if (raw) this.best = JSON.parse(raw) as BestRecord;
    } catch {
      this.best = { score: 0, rank: '' };
    }
  }

  private saveBest(): void {
    localStorage.setItem(STORAGE_KEYS.best, JSON.stringify(this.best));
  }

  // ---------------- the frame ----------------

  private lastT = 0;

  private frame(tMs: number): void {
    // generous clamp — the fixed-substep sim absorbs slow frames
    const rawDt = Math.min((tMs - this.lastT) / 1000 || 0.016, 0.25);
    this.lastT = tMs;
    this.wallTime += rawDt;

    // hitstop recovery
    if (this.hitstop > 0) {
      this.hitstop -= rawDt;
      this.timeScale = this.hitstop > 0 ? 0.2 : 1;
    }
    const dt = rawDt * this.timeScale;

    switch (this.state) {
      case 'title':
        this.updateTitle(Math.min(rawDt, 1 / 20));
        break;
      case 'playing':
      case 'ending':
        this.updatePlaying(dt, rawDt);
        break;
      case 'paused':
      case 'end':
        // world holds its breath; overlays own the screen
        break;
      case 'boot':
        break;
    }

    // global input that works in most states
    if (this.input.mutePressed) {
      const muted = this.audio.toggleMute();
      this.ui.syncSound(undefined, muted);
    }
    if (this.input.pausePressed) {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused' && !this.ui.howtoOpen) this.resume();
    }

    // auto-pause if pointer lock is lost unexpectedly mid-run (Esc).
    // hadLockThisRun re-arms only after lock is actually held, so the
    // async lock request after beginRun/resume can't trip it.
    if (this.state === 'playing') {
      if (this.hadLockThisRun && !this.input.pointerLocked) {
        this.pause();
      } else if (this.input.pointerLocked) {
        this.hadLockThisRun = true;
      }
    }

    const avgFear = this.averageFear();
    this.audio.update(this.sky.darkness, avgFear, this.dog?.speed ?? 0, this.state !== 'playing' && this.state !== 'ending');
    this.hud.updateOverlays(rawDt);

    this.renderer.render(this.scene, this.dogCam.camera);
    this.input.endFrame();
  }

  private updateTitle(dt: number): void {
    this.titleOrbitT += dt;
    // gentle idle: flock grazes, dog waits, golden hour holds
    this.dog.update(dt, this.input, 0, this.world, false);
    this.flock.update(dt, this.dog, [], this.flockCallbacks, 0.08);
    this.fx.update(dt);
    for (const a of this.flock.agents) {
      if (a.isStray && a.state === 'stray') this.fx.updateStrayMarker(a.id, a.pos);
    }

    const c = this.world.flockStart;
    const ang = this.titleOrbitT * 0.07;
    const cx = c.x + Math.cos(ang) * 17;
    const cz = c.z + 6 + Math.sin(ang) * 14;
    const cy = this.world.heightAt(cx, cz) + 5.2;
    this.dogCam.camera.position.set(cx, cy, cz);
    this.dogCam.camera.lookAt(c.x, c.y + 1.2, c.z - 4);

    this.sky.update(34, c, this.dogCam.camera.position);
    updateScenery(this.scenery, this.wallTime, this.sky.darkness, this.dogCam.camera.position);
  }

  private simAccum = 0;

  private updatePlaying(dt: number, rawDt: number): void {
    // fixed-substep simulation: correct at any framerate (headless
    // software GL, tab-switch hitches, high-refresh monitors alike)
    const h = 1 / 60;
    this.simAccum += dt;
    let steps = 0;
    while (this.simAccum >= h && steps < 8) {
      this.simStep(h);
      this.simAccum -= h;
      steps++;
    }
    if (steps === 8) this.simAccum = 0; // under extreme load: slow-mo, not spiral

    const dog = this.dog;
    const canAct = this.state === 'playing';

    // ending countdown → end screen
    if (this.state === 'ending') {
      this.endingTimer -= rawDt;
      if (this.endingTimer <= 0 && this.pendingEnd) {
        this.state = 'end';
        this.input.releaseLock();
        this.hud.hide();
        this.ui.showEnd(this.pendingEnd);
      }
    }

    // camera + sky + scenery (per-frame, not per-substep)
    this.dogCam.update(rawDt, this.input, dog.pos, dog.vel, this.world, dog.eyeActive, this.input.sprintHeld && dog.speed > 8, canAct);
    this.sky.update(this.elapsed, dog.pos, this.dogCam.camera.position);
    updateScenery(this.scenery, this.wallTime, this.sky.darkness, this.dogCam.camera.position);
    dog.setDarkness(this.sky.darkness);

    // fold gate bar swing
    const targetRot = this.foldShut ? 0 : Math.PI / 2 + 0.35;
    const bar = this.scenery.foldGateBar;
    bar.rotation.y = lerp(bar.rotation.y, targetRot, 1 - Math.exp(-6 * rawDt));

    this.updateHUD();
  }

  private simStep(dt: number): void {
    const world = this.world;
    const dog = this.dog;
    const canAct = this.state === 'playing';

    this.elapsed += dt;

    // remember z for gate-crossing detection
    for (const a of this.flock.agents) a.prevZ = a.pos.z;

    const prevX = dog.pos.x;
    const prevZ = dog.pos.z;
    dog.update(dt, this.input, this.dogCam.yaw, world, canAct);
    this.distance += Math.hypot(dog.pos.x - prevX, dog.pos.z - prevZ);

    // route dog actions
    if (dog.barkedThisFrame) {
      this.barks++;
      this.flock.applyBark(dog.pos);
      this.wolves.applyBark(dog.pos, dog, this.wolfCallbacks);
      this.fx.barkRing(dog.pos, DOG.barkRadius);
      this.audio.bark();
      this.dogCam.addShake(0.3);
    }
    if (dog.whistledThisFrame) {
      this.audio.whistle();
    }

    this.flock.update(dt, dog, this.wolves.threats(), this.flockCallbacks, this.sky.darkness);
    this.wolves.update(dt, world, dog, this.flock, this.sky.darkness, this.elapsed, this.wolfCallbacks);
    this.fx.update(dt);

    for (const a of this.flock.agents) {
      if (a.isStray && a.state === 'stray') this.fx.updateStrayMarker(a.id, a.pos);
    }

    // footsteps + dust
    if (dog.speed > 1.2) {
      this.stepPhase += dt * dog.speed;
      if (this.stepPhase > 2.6) {
        this.stepPhase = 0;
        const wet = world.sample(dog.pos.x, dog.pos.z).waterDepth > 0.12;
        this.audio.footstep(wet);
        if (wet) this.fx.splash(dog.pos.clone());
        else if (dog.speed > 8) {
          const back = new THREE.Vector3(-dog.vel.x, 0, -dog.vel.z).normalize();
          this.fx.dust(dog.pos.clone(), back, 2);
        }
      }
    }

    this.checkGates();
    this.checkZone();
    this.checkFold(canAct);
    if (canAct) this.checkEndConditions();
  }

  // ---------------- run logic ----------------

  private checkGates(): void {
    for (let gi = 0; gi < this.world.gates.length; gi++) {
      const g = this.world.gates[gi];
      for (const a of this.flock.agents) {
        if (a.state !== 'flock') continue;
        if (this.gatePassed[gi].has(a.id)) continue;
        if (a.prevZ > g.z && a.pos.z <= g.z) {
          this.gatePassed[gi].add(a.id);
          this.gateCounts[gi]++;
          this.audio.gateChime(this.gateCounts[gi] - 1);
          this.fx.gateSparkle(g.center);
          const alive = this.flock.count('flock');
          if (this.gateCounts[gi] === 1) {
            this.hud.message('Through the gate — keep them moving.', 'good');
          } else if (this.gateCounts[gi] === alive && alive > 1) {
            this.hud.message('The whole flock is through.', 'good');
          }
        }
      }
    }
  }

  private checkZone(): void {
    const z = this.dog.pos.z;
    for (let i = 0; i < ZONES.length; i++) {
      if (z >= ZONES[i].zMin) {
        if (i !== this.zoneIdx) {
          this.zoneIdx = i;
          if (this.elapsed > 3) this.hud.showZoneCard(ZONES[i].num, ZONES[i].name);
        }
        break;
      }
    }
  }

  private foldEligible(): { near: boolean; inside: number } {
    const [p1, p2] = this.world.foldGatePosts;
    const d1 = this.dog.pos.distanceTo(p1);
    const d2 = this.dog.pos.distanceTo(p2);
    let inside = 0;
    for (const a of this.flock.agents) {
      if (a.state === 'flock' && this.flock.insideFold(a)) inside++;
    }
    return { near: Math.min(d1, d2) < 4.2 && !this.foldShut, inside };
  }

  private checkFold(canAct: boolean): void {
    if (this.foldShut) return;
    const { near, inside } = this.foldEligible();
    if (near) {
      if (inside > 0) {
        this.hud.setInteract(`F — shut the gate  ·  ${inside} inside`);
        if (canAct && this.input.interactPressed) this.shutFold();
      } else {
        this.hud.setInteract('the fold is empty — drive them in first');
      }
    } else {
      this.hud.setInteract(null);
    }
  }

  private shutFold(auto = false): void {
    if (this.foldShut) return;
    this.foldShut = true;
    this.flock.foldGateShut = true;
    this.hud.setInteract(null);

    const homeNames: string[] = [];
    for (const a of this.flock.agents) {
      if (a.state === 'flock' && this.flock.insideFold(a)) {
        a.state = 'home';
        a.fear = 0;
        homeNames.push(a.name);
      }
    }
    this.audio.winFanfare();
    this.fx.winBurst(this.world.foldCenter.clone().add(new THREE.Vector3(0, 1, 0)));
    this.dogCam.addShake(0.18);
    this.hud.message(
      auto ? 'The last sheep is in — the gate swings shut.' : `The gate is shut. ${homeNames.length} safe inside.`,
      'good',
    );
    this.finishRun(true);
  }

  private checkEndConditions(): void {
    const flockN = this.flock.count('flock');
    const strayN = this.flock.count('stray');
    const takenN = this.flock.count('taken');
    const homeN = this.flock.count('home');

    // everything still herdable is gone
    if (flockN + strayN + takenN === 0) {
      if (homeN > 0 && !this.foldShut) {
        this.shutFold(true);
      } else if (homeN === 0) {
        this.finishRun(false);
      }
    }

    // all remaining flock sheep are inside the fold and the dog isn't needed:
    // auto-shut only when every live sheep (incl. strays) is in the pen
    if (!this.foldShut && flockN > 0 && strayN === 0 && takenN === 0) {
      let allIn = true;
      for (const a of this.flock.agents) {
        if (a.state === 'flock' && !this.flock.insideFold(a)) {
          allIn = false;
          break;
        }
      }
      if (allIn) this.shutFold(true);
    }
  }

  private finishRun(won: boolean): void {
    if (this.state !== 'playing') return;

    const total = this.flock.agents.length;
    const homeAgents = this.flock.agents.filter((a) => a.state === 'home');
    const home = homeAgents.length;
    const straysRescued = homeAgents.filter((a) => a.isStray).length;
    const leftOut = this.flock.agents
      .filter((a) => a.state === 'flock' || a.state === 'stray')
      .map((a) => a.name);
    const lostNames = this.flock.agents
      .filter((a) => a.state === 'lost' || a.state === 'taken')
      .map((a) => ({
        name: a.name,
        cause: a.state === 'taken' ? 'was carried into the pines' : this.lostCauses.get(a.id) ?? 'was lost in the dark',
      }));

    let score = home * SCORING.sheepHome + straysRescued * SCORING.strayBonus + this.wolves.totalDrivenOff * SCORING.wolfDrivenOff;
    if (won) {
      const daylightLeft = Math.max(0, DUSK.duration - this.elapsed);
      score += Math.round(daylightLeft * SCORING.daylightBonusPerSec);
      if (home === total) score += SCORING.allHomeBonus;
    }
    score = Math.round(score);

    let rank = 'No sheep came home';
    for (const r of RANKS) {
      if (home >= r.min) {
        rank = r.title;
        break;
      }
    }
    if (!won) rank = 'The vale keeps them now';

    const newBest = score > this.best.score;
    if (newBest) {
      this.best = { score, rank };
      this.saveBest();
    }

    this.pendingEnd = {
      won,
      home,
      total,
      straysRescued,
      timeSec: this.elapsed,
      wolvesDrivenOff: this.wolves.totalDrivenOff,
      barks: this.barks,
      distance: this.distance,
      score,
      best: this.best.score,
      newBest,
      rank,
      homeNames: homeAgents.map((a) => a.name),
      lostNames,
      leftOut,
    };

    if (!won) this.audio.loseDrone();
    this.state = 'ending';
    this.endingTimer = won ? 2.1 : 1.6;
  }

  // ---------------- callbacks ----------------

  private flockCallbacks = {
    onBaa: (a: SheepAgent) => {
      const d = a.pos.distanceTo(this.dogCam.camera.position);
      this.audio.baa(d, (a.id % 7) / 7, a.fear);
    },
    onStrayJoined: (a: SheepAgent) => {
      this.fx.removeStrayMarker(a.id);
      this.fx.freedBurst(a.pos.clone().add(new THREE.Vector3(0, 1, 0)));
      this.audio.freedNote();
      this.hud.message(`${a.name} joins the flock.`, 'good');
    },
    onPanicBolt: (a: SheepAgent) => {
      const d = a.pos.distanceTo(this.dogCam.camera.position);
      this.audio.baa(d * 0.6, (a.id % 7) / 7, 1);
    },
  };

  private wolfCallbacks = {
    onEmerge: (w: Wolf) => {
      const d = w.pos.distanceTo(this.dogCam.camera.position);
      this.audio.growl(d);
      if (!this.firstWolfSeen) {
        this.firstWolfSeen = true;
        this.hud.message('Something moves at the treeline…', 'bad');
      }
    },
    onCharge: (_w: Wolf) => {
      this.audio.snarl();
    },
    onGrab: (w: Wolf, s: SheepAgent) => {
      this.audio.grabSting();
      this.fx.grabFlash(s.pos.clone().add(new THREE.Vector3(0, 0.8, 0)));
      this.hud.flash();
      this.dogCam.addShake(0.5);
      this.hitstop = 0.3;
      this.hud.message(`${s.name} is taken — drive the wolf off!`, 'bad');
    },
    onSheepLost: (s: SheepAgent) => {
      this.lostCauses.set(s.id, 'was lost to the pines');
      this.hud.message(`${s.name} is lost to the pines.`, 'bad');
      this.audio.loseDrone();
      this.dogCam.addShake(0.25);
    },
    onSheepFreed: (s: SheepAgent) => {
      this.fx.freedBurst(s.pos.clone().add(new THREE.Vector3(0, 0.9, 0)));
      this.audio.freedNote();
      this.hud.message(`${s.name} breaks free!`, 'good');
    },
    onDrivenOff: (w: Wolf, _cause: 'bark' | 'eye' | 'dog') => {
      this.wolves.totalDrivenOff++;
      this.fx.dust(w.pos.clone(), new THREE.Vector3(0, 0.4, 0), 3);
    },
  };

  // ---------------- HUD ----------------

  private averageFear(): number {
    if (!this.flock) return 0;
    let sum = 0;
    let n = 0;
    for (const a of this.flock.agents) {
      if (a.state === 'flock') {
        sum += a.fear;
        n++;
      }
    }
    return n ? sum / n : 0;
  }

  private updateHUD(): void {
    const states = this.flock.agents.map((a) => ({ state: a.state, isStray: a.isStray }));
    const withDog = this.flock.count('flock') + this.flock.count('home');
    this.hud.setFlock(states, withDog, this.flock.agents.length);

    const zone = ZONES[Math.max(0, this.zoneIdx)];
    this.hud.setDusk(this.sky.darkness, zone.name);

    const liveScore =
      this.flock.count('home') * SCORING.sheepHome +
      this.flock.agents.filter((a) => a.state === 'home' && a.isStray).length * SCORING.strayBonus +
      this.wolves.totalDrivenOff * SCORING.wolfDrivenOff;
    this.hud.setScore(liveScore, this.best.score);

    this.hud.setStamina(this.dog.stamina / DOG.staminaMax);
    this.hud.setVerbs(
      this.dog.barkCooldown / DOG.barkCooldown,
      this.dog.whistleCooldown / DOG.whistleCooldown,
      this.dog.eyeActive,
      this.dog.whistleActiveTimer > 0,
    );

    this.updatePips();
  }

  private updatePips(): void {
    const pips: PipInfo[] = [];
    const w = window.innerWidth;
    const h = window.innerHeight;
    const margin = 22;
    const cam = this.dogCam.camera;

    const project = (p: THREE.Vector3, cls: PipInfo['cls'], alwaysWhenFar = false, farDist = 30): void => {
      const d = p.distanceTo(this.dog.pos);
      const v = this.lastCamProj.copy(p);
      v.y += 1;
      v.project(cam);
      const behind = v.z > 1;
      const off = behind || Math.abs(v.x) > 0.93 || Math.abs(v.y) > 0.9;
      if (!off) return;
      if (!alwaysWhenFar && d < farDist) return;
      let x = v.x;
      let y = v.y;
      if (behind) {
        x = -x;
        y = -1;
      }
      const px = clamp((x * 0.5 + 0.5) * w, margin, w - margin);
      const py = clamp((-y * 0.5 + 0.5) * h, margin, h - margin);
      pips.push({ x: px, y: py, cls });
    };

    for (const a of this.flock.agents) {
      if (a.state === 'flock') project(a.pos, 'sheep', false, 26);
      else if (a.state === 'stray') project(a.pos, 'stray', true);
      else if (a.state === 'taken') project(a.pos, 'wolf', true);
    }
    for (const wolf of this.wolves.wolves) {
      if (wolf.threatening) project(wolf.pos, 'wolf', true);
    }
    if (this.dog.pos.z < -430 && !this.foldShut) {
      project(this.world.foldMouth, 'fold', true);
    }
    this.hud.setPips(pips);
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.dogCam.camera.aspect = w / h;
    this.dogCam.camera.updateProjectionMatrix();
  }

  // ---------------- debug hooks (?debug) ----------------

  private installDebug(): void {
    const g = {
      game: this,
      state: () => this.state,
      begin: () => this.beginRun(),
      win: () => {
        if (this.state !== 'playing') return;
        for (const a of this.flock.agents) {
          if (a.state === 'flock' || a.state === 'stray') {
            a.state = 'flock';
            a.pos.set(
              this.world.foldCenter.x + (Math.random() - 0.5) * 6,
              this.world.foldCenter.y,
              this.world.foldCenter.z + (Math.random() - 0.5) * 5,
            );
          }
        }
        this.shutFold();
      },
      lose: () => {
        if (this.state !== 'playing') return;
        for (const a of this.flock.agents) {
          if (a.state !== 'home') {
            a.state = 'lost';
            a.group.visible = false;
          }
        }
      },
      dark: (t: number) => {
        this.elapsed = t * DUSK.duration;
      },
      teleport: (z: number) => {
        this.dog.pos.set(this.world.pathCX(z), this.world.heightAt(this.world.pathCX(z), z), z);
        for (const a of this.flock.agents) {
          if (a.state === 'flock') {
            a.pos.set(
              this.world.pathCX(z) + (Math.random() - 0.5) * 8,
              0,
              z - 6 - Math.random() * 6,
            );
            a.pos.y = this.world.heightAt(a.pos.x, a.pos.z);
          }
        }
      },
      spawnWolf: () => {
        this.elapsed = Math.max(this.elapsed, 200);
      },
      flockInfo: () =>
        this.flock.agents.map((a) => ({ name: a.name, state: a.state, fear: +a.fear.toFixed(2), x: +a.pos.x.toFixed(1), z: +a.pos.z.toFixed(1) })),
      dogInfo: () => ({ x: +this.dog.pos.x.toFixed(1), z: +this.dog.pos.z.toFixed(1), speed: +this.dog.speed.toFixed(1) }),
    };
    (window as unknown as { __game: typeof g }).__game = g;
  }
}
