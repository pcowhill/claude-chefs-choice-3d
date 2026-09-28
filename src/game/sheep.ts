// ============================================================
// The flock. Sheep are boids with one extra dimension: FEAR.
// Calm sheep graze and barely move. Pressured sheep flow like
// water away from the dog. Panicked sheep are fast, stupid and
// hazard-blind. Every player verb is just a different shape of
// pressure feeding this system.
// ============================================================

import * as THREE from 'three';
import { SHEEP, DOG, COLORS, NAMES_POOL, FOLD } from './config.ts';
import type { World } from './world.ts';
import type { Dog } from './dog.ts';
import { clamp, lerp, mulberry32 } from './rng.ts';
import { paint, flatMat } from './meshUtil.ts';

export type SheepState = 'flock' | 'stray' | 'taken' | 'home' | 'lost';

export interface FlockCallbacks {
  onBaa(agent: SheepAgent): void;
  onStrayJoined(agent: SheepAgent): void;
  onPanicBolt(agent: SheepAgent): void;
}

let uid = 0;

export class SheepAgent {
  id = uid++;
  name: string;
  state: SheepState;
  isStray: boolean;
  isBlack: boolean;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  fear = 0;
  skittish: number; // 0.8 – 1.25 personality
  prevZ = 0; // stamped by the game each frame for gate-crossing checks
  passedGates = new Set<number>();

  group = new THREE.Group();
  woolMat: THREE.MeshLambertMaterial;
  private legs: THREE.Object3D[] = [];
  private headPivot!: THREE.Object3D;
  private animPhase = Math.random() * 10;
  private grazeBlend = 1;
  baaTimer = 3 + Math.random() * 10;
  wasPanicked = false;
  crossTimer = 0; // short-lived "I'm heading for the crossing" intent
  crossDir = -1;
  private wanderSeed = Math.random() * 100;
  hopPhase = 0;

  constructor(name: string, pos: THREE.Vector3, isStray: boolean, isBlack: boolean, rng: () => number) {
    this.name = name;
    this.isStray = isStray;
    this.isBlack = isBlack;
    this.state = isStray ? 'stray' : 'flock';
    this.pos.copy(pos);
    this.skittish = 0.82 + rng() * 0.42;

    const woolHex = isBlack
      ? COLORS.blackSheep
      : COLORS.sheepWool[Math.floor(rng() * COLORS.sheepWool.length)];
    this.woolMat = new THREE.MeshLambertMaterial({
      color: woolHex,
      flatShading: true,
      emissive: new THREE.Color(woolHex).multiplyScalar(0.5),
      emissiveIntensity: 0,
    });
    this.buildMesh(rng);
    this.group.position.copy(pos);
    this.group.rotation.y = rng() * Math.PI * 2;
  }

  private buildMesh(rng: () => number): void {
    const dark = flatMat();
    const faceHex = this.isBlack ? 0xd8cfc0 : 0x3a3634;
    const s = 0.9 + rng() * 0.22; // size personality

    const wool = new THREE.Mesh(paint(new THREE.BoxGeometry(0.78, 0.62, 1.06), 0xffffff), this.woolMat);
    wool.position.y = 0.62;
    wool.castShadow = true;
    // wooly lumps
    const lump1 = new THREE.Mesh(paint(new THREE.BoxGeometry(0.6, 0.34, 0.5), 0xffffff), this.woolMat);
    lump1.position.set(0, 0.94, 0.14);
    lump1.rotation.y = 0.4;
    const lump2 = new THREE.Mesh(paint(new THREE.BoxGeometry(0.5, 0.3, 0.42), 0xffffff), this.woolMat);
    lump2.position.set(0, 0.9, -0.3);
    lump2.rotation.y = -0.3;

    this.headPivot = new THREE.Group();
    const head = new THREE.Mesh(paint(new THREE.BoxGeometry(0.26, 0.3, 0.34), faceHex), dark);
    head.position.set(0, -0.05, -0.22);
    head.castShadow = true;
    const earGeo = paint(new THREE.BoxGeometry(0.16, 0.07, 0.1), faceHex);
    const earL = new THREE.Mesh(earGeo, dark);
    earL.position.set(-0.2, 0.06, -0.16);
    earL.rotation.z = -0.25;
    const earR = new THREE.Mesh(earGeo.clone(), dark);
    earR.position.set(0.2, 0.06, -0.16);
    earR.rotation.z = 0.25;
    const woolCap = new THREE.Mesh(paint(new THREE.BoxGeometry(0.3, 0.18, 0.26), 0xffffff), this.woolMat);
    woolCap.position.set(0, 0.14, -0.1);
    this.headPivot.add(head, earL, earR, woolCap);
    this.headPivot.position.set(0, 0.72, -0.5);

    const tail = new THREE.Mesh(paint(new THREE.BoxGeometry(0.14, 0.18, 0.1), 0xffffff), this.woolMat);
    tail.position.set(0, 0.68, 0.55);

    const legGeo = paint(new THREE.BoxGeometry(0.09, 0.36, 0.09), this.isBlack ? 0x2a2624 : 0x413c38);
    const mkLeg = (x: number, z: number): THREE.Object3D => {
      const leg = new THREE.Mesh(legGeo.clone(), dark);
      leg.position.set(x, 0.18, z);
      this.group.add(leg);
      return leg;
    };
    this.legs = [mkLeg(-0.24, -0.36), mkLeg(0.24, -0.36), mkLeg(-0.24, 0.38), mkLeg(0.24, 0.38)];

    this.group.add(wool, lump1, lump2, this.headPivot, tail);
    this.group.scale.setScalar(s);
  }

  get active(): boolean {
    return this.state === 'flock' || this.state === 'stray' || this.state === 'home';
  }

  animate(dt: number, speed: number): void {
    const spNorm = clamp(speed / 5, 0, 1);
    this.animPhase += dt * (2 + speed * 3.2);
    const swing = 0.75 * clamp(speed / 2.2, 0, 1);
    for (let i = 0; i < 4; i++) {
      const ph = i % 2 === 0 ? 0 : Math.PI;
      const ph2 = i < 2 ? 0 : Math.PI * 0.85;
      this.legs[i].rotation.x = Math.sin(this.animPhase + ph + ph2) * swing;
    }
    // grazing: head down when calm and still
    const wantGraze = this.fear < SHEEP.calmThreshold && speed < 0.4 && this.state !== 'taken' ? 1 : 0;
    this.grazeBlend = lerp(this.grazeBlend, wantGraze, 1 - Math.exp(-3 * dt));
    this.headPivot.rotation.x = this.grazeBlend * 0.95 - (this.fear > 0.5 ? 0.18 : 0);

    // panic hop
    let hopY = 0;
    if (this.fear > 0.7 && speed > 2.5) {
      this.hopPhase += dt * 11;
      hopY = Math.abs(Math.sin(this.hopPhase)) * 0.16 * spNorm;
    } else {
      this.hopPhase = 0;
    }
    this.group.position.y = this.pos.y + hopY;

    // face velocity (model face = local -z)
    if (speed > 0.35) {
      const targetYaw = Math.atan2(-this.vel.x, -this.vel.z);
      let d = targetYaw - this.group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.group.rotation.y += d * (1 - Math.exp(-8 * dt));
    }
  }

  /** wander direction that changes smoothly over time */
  wander(t: number, out: THREE.Vector3): THREE.Vector3 {
    const a = Math.sin(t * 0.27 + this.wanderSeed * 3.1) * 3 + Math.sin(t * 0.13 + this.wanderSeed) * 2;
    return out.set(Math.sin(a), 0, Math.cos(a));
  }
}

export class Flock {
  agents: SheepAgent[] = [];
  group = new THREE.Group();
  private world: World;
  private acc = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private tmp3 = new THREE.Vector3();
  private pushScratch = new THREE.Vector3();
  private centroidV = new THREE.Vector3();
  foldGateShut = false;
  private time = 0;

  constructor(world: World) {
    this.world = world;
    const rng = mulberry32(777);
    const names = [...NAMES_POOL];
    // shuffle names
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    const blackIdx = Math.floor(rng() * SHEEP.count);

    for (let i = 0; i < SHEEP.count; i++) {
      const ang = (i / SHEEP.count) * Math.PI * 2;
      const r = 2.2 + rng() * 3.4;
      const p = new THREE.Vector3(
        world.flockStart.x + Math.cos(ang) * r,
        0,
        world.flockStart.z + Math.sin(ang) * r * 0.8,
      );
      p.y = world.heightAt(p.x, p.z);
      const a = new SheepAgent(names[i], p, false, i === blackIdx, rng);
      this.agents.push(a);
      this.group.add(a.group);
    }
    for (let i = 0; i < SHEEP.strayCount && i < world.strayStarts.length; i++) {
      const a = new SheepAgent(names[SHEEP.count + i], world.strayStarts[i], true, false, rng);
      this.agents.push(a);
      this.group.add(a.group);
    }
  }

  /** flock-state sheep centroid (falls back to dog pos region if empty) */
  centroid(): THREE.Vector3 {
    let n = 0;
    this.centroidV.set(0, 0, 0);
    for (const a of this.agents) {
      if (a.state === 'flock') {
        this.centroidV.add(a.pos);
        n++;
      }
    }
    if (n > 0) this.centroidV.divideScalar(n);
    return this.centroidV;
  }

  count(state: SheepState): number {
    let n = 0;
    for (const a of this.agents) if (a.state === state) n++;
    return n;
  }

  applyBark(dogPos: THREE.Vector3): void {
    for (const a of this.agents) {
      if (a.state !== 'flock' && a.state !== 'home') continue;
      const d = a.pos.distanceTo(dogPos);
      if (d < DOG.barkRadius) {
        const fall = 1 - d / DOG.barkRadius;
        this.tmp.subVectors(a.pos, dogPos);
        this.tmp.y = 0;
        this.tmp.normalize().multiplyScalar(DOG.barkPush * (0.4 + fall));
        a.vel.add(this.tmp);
        if (a.state !== 'home') a.fear = clamp(a.fear + DOG.barkFear * (0.45 + fall) * a.skittish, 0, 1);
      }
    }
  }

  update(
    dt: number,
    dog: Dog,
    wolves: Array<{ pos: THREE.Vector3; threatening: boolean }>,
    cb: FlockCallbacks,
    darkness: number,
  ): void {
    this.time += dt;
    const world = this.world;
    const whistleOn = dog.whistleActiveTimer > 0;
    const dogSpeed = dog.speed;
    const pressureR = SHEEP.pressureBase + dogSpeed * SHEEP.pressureSpeedScale;
    const dogFacing = dog.facingDir(this.tmp3);
    const woolEmissive = clamp((darkness - 0.45) / 0.55, 0, 1) * 0.55;

    for (const a of this.agents) {
      a.woolMat.emissiveIntensity = woolEmissive;

      if (a.state === 'lost') continue;
      if (a.state === 'taken') {
        a.fear = 1;
        a.animate(dt, 3);
        a.group.position.copy(a.pos);
        continue;
      }

      // stray: waits, grazing, until the dog comes near — then joins the flock
      if (a.state === 'stray') {
        const dDog = a.pos.distanceTo(dog.pos);
        if (dDog < 12) {
          a.state = 'flock';
          a.fear = 0.4;
          cb.onStrayJoined(a);
        } else {
          a.fear = Math.max(0, a.fear - SHEEP.fearDecay * dt);
          a.animate(dt, 0);
          continue;
        }
      }

      const acc = this.acc.set(0, 0, 0);
      const isHome = a.state === 'home';
      const panicked = a.fear > SHEEP.panicThreshold;

      // ---- boids ----
      let cohX = 0, cohZ = 0, cohN = 0;
      let alX = 0, alZ = 0, alN = 0;
      let neighbors = 0;
      for (const b of this.agents) {
        if (b === a || (b.state !== 'flock' && b.state !== 'home') || b.state !== a.state) continue;
        const dx = a.pos.x - b.pos.x;
        const dz = a.pos.z - b.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < SHEEP.sepRadius * SHEEP.sepRadius && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const f = (SHEEP.sepForce * (1 - d / SHEEP.sepRadius)) / d;
          acc.x += dx * f;
          acc.z += dz * f;
        }
        if (neighbors < SHEEP.neighborCap && d2 < SHEEP.cohRadius * SHEEP.cohRadius) {
          cohX += b.pos.x;
          cohZ += b.pos.z;
          cohN++;
          neighbors++;
          if (d2 < SHEEP.alignRadius * SHEEP.alignRadius) {
            alX += b.vel.x;
            alZ += b.vel.z;
            alN++;
          }
        }
      }
      if (cohN > 0 && !isHome) {
        cohX = cohX / cohN - a.pos.x;
        cohZ = cohZ / cohN - a.pos.z;
        // scared sheep bunch tighter; full panic loosens the bond a little
        const fearBoost = a.fear > 0.2 ? (panicked ? 1.15 : 1.75) : 1;
        acc.x += cohX * SHEEP.cohForce * 0.14 * fearBoost;
        acc.z += cohZ * SHEEP.cohForce * 0.14 * fearBoost;
      }
      if (alN > 0 && !isHome) {
        acc.x += (alX / alN - a.vel.x) * SHEEP.alignForce;
        acc.z += (alZ / alN - a.vel.z) * SHEEP.alignForce;
      }

      // ---- dog presence ----
      if (!isHome) {
        const ddx = a.pos.x - dog.pos.x;
        const ddz = a.pos.z - dog.pos.z;
        const dDog = Math.hypot(ddx, ddz);
        if (dDog < pressureR && dDog > 1e-4) {
          const fall = Math.pow(1 - dDog / pressureR, 1.4);
          const str = SHEEP.pressureForce * fall * (0.7 + a.fear * 0.8) * a.skittish;
          acc.x += (ddx / dDog) * str;
          acc.z += (ddz / dDog) * str;
          // presence always stirs: heads come up the moment the dog is close…
          if (dDog < pressureR * 0.8 && a.fear < SHEEP.startleFear) {
            a.fear = SHEEP.startleFear;
          }
          // …and fear builds with the dog's speed
          const speedFactor = 0.3 + 0.7 * (dogSpeed / 10.6);
          a.fear = clamp(a.fear + SHEEP.proximityFearPerSec * speedFactor * fall * a.skittish * dt * 2.2, 0, 1);
        }

        // ---- the Eye ----
        if (dog.eyeActive && dDog < DOG.eyeRange && dDog > 1e-4) {
          const toSheepX = ddx / dDog;
          const toSheepZ = ddz / dDog;
          const cos = toSheepX * dogFacing.x + toSheepZ * dogFacing.z;
          if (cos > DOG.eyeCosHalfAngle) {
            const px = lerp(toSheepX, dogFacing.x, DOG.eyeBlend);
            const pz = lerp(toSheepZ, dogFacing.z, DOG.eyeBlend);
            const pl = Math.hypot(px, pz) || 1;
            const str = DOG.eyePush * (1 - (dDog / DOG.eyeRange) * 0.45);
            acc.x += (px / pl) * str;
            acc.z += (pz / pl) * str;
            a.fear = clamp(a.fear + DOG.eyeFearPerSec * dt, 0, 1);
          }
        }

        // ---- whistle gather ----
        if (whistleOn) {
          const d = Math.hypot(ddx, ddz);
          if (d > DOG.whistleMinDist) {
            acc.x -= (ddx / d) * DOG.whistlePull;
            acc.z -= (ddz / d) * DOG.whistlePull;
          }
        }
      }

      // ---- wolves ----
      for (const w of wolves) {
        if (!w.threatening) continue;
        const wx = a.pos.x - w.pos.x;
        const wz = a.pos.z - w.pos.z;
        const d = Math.hypot(wx, wz);
        const r = SHEEP.wolfFleeRadius * (1 + a.fear * 0.4);
        if (d < r && d > 1e-4) {
          const fall = 1 - d / r;
          acc.x += (wx / d) * SHEEP.wolfFleeForce * fall;
          acc.z += (wz / d) * SHEEP.wolfFleeForce * fall;
          a.fear = clamp(a.fear + SHEEP.wolfFearPerSec * fall * dt, 0, 1);
        }
      }

      // ---- hazard sense (lost in panic) ----
      const spd = Math.hypot(a.vel.x, a.vel.z);
      if (!panicked && spd > 0.5) {
        const lx = a.pos.x + (a.vel.x / spd) * SHEEP.hazardLookahead;
        const lz = a.pos.z + (a.vel.z / spd) * SHEEP.hazardLookahead;
        const ahead = world.sample(lx, lz);
        if (ahead.deepWater) {
          // deep water ahead: brake, and remember the intent to cross.
          // The steering itself lives below so it persists even while
          // the sheep is stopped (no oscillating jam at the bank).
          acc.x -= (a.vel.x / spd) * 5;
          acc.z -= (a.vel.z / spd) * 5;
          a.crossTimer = 2.5;
          a.crossDir = a.vel.z < 0 ? -1 : 1;
        } else if (ahead.bog && !world.sample(a.pos.x, a.pos.z).bog) {
          acc.x -= (a.vel.x / spd) * 2.2;
          acc.z -= (a.vel.z / spd) * 2.2;
        }
      }

      // pressure near the river bank also wakes the crossing intent,
      // even in a sheep standing still
      if (!panicked && a.fear > 0.15) {
        const rd = world.riverDist(a.pos.x, a.pos.z);
        if (rd > 0 && rd < 11) {
          a.crossTimer = Math.max(a.crossTimer, 1.2);
          a.crossDir = -1;
        }
      }

      // ---- crossing intent: make for the ford (or the bridge if lined
      // up with the planks), then commit across ----
      if (!panicked && a.crossTimer > 0) {
        a.crossTimer -= dt;
        const onBridgeLine = Math.abs(a.pos.x - world.bridgeCenter.x) < 1.5;
        const onFordLine = Math.abs(a.pos.x - world.fordCenter.x) < 7;
        if (onBridgeLine || onFordLine) {
          acc.z += a.crossDir * 3.6; // commit across
        } else {
          acc.x += Math.sign(world.fordCenter.x - a.pos.x) * 6.5;
        }
      }

      // ---- gate sense: pressed against a fence line, drift toward the opening ----
      if (!panicked) {
        for (const g of world.gates) {
          const dz = a.pos.z - g.z;
          if (dz > 0.5 && dz < 5 && a.vel.z < -0.2) {
            const openC = (g.openLeft + g.openRight) / 2;
            const halfSpan = (g.openRight - g.openLeft) / 2 - 0.8;
            if (Math.abs(a.pos.x - openC) > halfSpan) {
              acc.x += Math.sign(openC - a.pos.x) * 2.6;
            }
            break;
          }
        }
      }

      // ---- home pull near the open fold ----
      if (!isHome && !this.foldGateShut) {
        const dm = a.pos.distanceTo(world.foldMouth);
        if (dm < SHEEP.homeAttractRadius) {
          this.tmp.subVectors(world.foldCenter, a.pos).normalize().multiplyScalar(0.85);
          acc.x += this.tmp.x;
          acc.z += this.tmp.z;
        }
      }

      // ---- graze wander ----
      if (a.fear < SHEEP.calmThreshold) {
        a.wander(this.time, this.tmp);
        acc.x += this.tmp.x * SHEEP.grazeWander;
        acc.z += this.tmp.z * SHEEP.grazeWander;
      } else if (panicked) {
        a.wander(this.time * 3.1, this.tmp);
        acc.x += this.tmp.x * 1.4;
        acc.z += this.tmp.z * 1.4;
      }

      // ---- soft world bounds ----
      const cx = world.pathCX(a.pos.z);
      const bound = world.corridorW(a.pos.z) + 34;
      if (a.pos.x - cx > bound) acc.x -= 3;
      if (a.pos.x - cx < -bound) acc.x += 3;

      // ---- integrate ----
      const accLen = Math.hypot(acc.x, acc.z);
      if (accLen > 16) {
        acc.x *= 16 / accLen;
        acc.z *= 16 / accLen;
      }
      a.vel.x += acc.x * dt * SHEEP.accel * 0.35;
      a.vel.z += acc.z * dt * SHEEP.accel * 0.35;

      const dragK = 1 / (1 + SHEEP.drag * dt * (a.fear < SHEEP.calmThreshold ? 1.3 : 1));
      a.vel.x *= dragK;
      a.vel.z *= dragK;

      let maxSpeed = SHEEP.baseSpeed + a.fear * SHEEP.fearSpeed;
      if (isHome) maxSpeed = Math.min(maxSpeed, 1.1);
      const smp = world.sample(a.pos.x, a.pos.z);
      if (smp.waterDepth > 0.15) maxSpeed *= 0.55;
      else if (smp.bog) maxSpeed *= 0.5;
      const v = Math.hypot(a.vel.x, a.vel.z);
      if (v > maxSpeed) {
        a.vel.x *= maxSpeed / v;
        a.vel.z *= maxSpeed / v;
      }

      // never enter deep water: cancel the offending velocity component
      const nextX = a.pos.x + a.vel.x * dt;
      const nextZ = a.pos.z + a.vel.z * dt;
      if (world.sample(nextX, nextZ).deepWater) {
        if (!world.sample(a.pos.x + a.vel.x * dt, a.pos.z).deepWater) {
          a.vel.z = 0;
        } else if (!world.sample(a.pos.x, a.pos.z + a.vel.z * dt).deepWater) {
          a.vel.x = 0;
        } else {
          a.vel.set(0, 0, 0);
        }
      }

      a.pos.x += a.vel.x * dt;
      a.pos.z += a.vel.z * dt;
      if (world.resolveCircle(a.pos, SHEEP.radius, this.pushScratch)) {
        const n = this.pushScratch;
        const nl = Math.hypot(n.x, n.z);
        if (nl > 1e-6) {
          const nx = n.x / nl;
          const nz = n.z / nl;
          const into = a.vel.x * nx + a.vel.z * nz;
          if (into < 0) {
            a.vel.x -= nx * into;
            a.vel.z -= nz * into;
          }
        }
      }
      a.pos.y = world.heightAt(a.pos.x, a.pos.z) - (smp.waterDepth > 0.15 ? 0.1 : 0);

      // ---- fear decay (faster in lantern light) ----
      const lanternD = world.nearestLanternDist(a.pos.x, a.pos.z);
      const calmMul = lanternD < 11 ? SHEEP.lanternCalmBoost : 1;
      a.fear = Math.max(0, a.fear - SHEEP.fearDecay * calmMul * dt);

      // panic bolt — edge-triggered when fear crosses the threshold:
      // one wild impulse plus an event for audio/fx
      const nowPanicked = a.fear > SHEEP.panicThreshold;
      if (nowPanicked && !a.wasPanicked) {
        a.wander(this.time * 7 + a.id, this.tmp2);
        a.vel.x += this.tmp2.x * 3.4;
        a.vel.z += this.tmp2.z * 3.4;
        cb.onPanicBolt(a);
      }
      a.wasPanicked = nowPanicked;

      // baa
      a.baaTimer -= dt * (0.7 + a.fear * 2.4);
      if (a.baaTimer <= 0) {
        a.baaTimer = 4 + Math.random() * 11;
        cb.onBaa(a);
      }

      a.animate(dt, v);
      a.group.position.x = a.pos.x;
      a.group.position.z = a.pos.z;
      // y set in animate (hop) relative to pos.y
    }

    // hard de-overlap pass (sheep–sheep)
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (a.state !== 'flock' && a.state !== 'home') continue;
      for (let j = i + 1; j < this.agents.length; j++) {
        const b = this.agents[j];
        if (b.state !== 'flock' && b.state !== 'home') continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const min = SHEEP.radius * 1.55;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (min - d) / d / 2;
          a.pos.x -= dx * push;
          a.pos.z -= dz * push;
          b.pos.x += dx * push;
          b.pos.z += dz * push;
        }
      }
    }
  }

  /** does a flock sheep sit inside the fold pen? */
  insideFold(a: SheepAgent): boolean {
    const w = this.world;
    return (
      Math.abs(a.pos.x - w.foldCenter.x) < FOLD.w / 2 - 0.4 &&
      a.pos.z > FOLD.z - FOLD.d / 2 + 0.4 &&
      a.pos.z < FOLD.z + FOLD.d / 2 - 0.2
    );
  }
}
