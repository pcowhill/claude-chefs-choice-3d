// ============================================================
// Wolves. A director spawns them from the treeline as darkness
// rises. They stalk the most isolated sheep, charge when the dog
// is out of position, and drag their prize into the pines.
// Lantern light is sanctuary; the dog's body, bark and stare are
// the only other answers.
// ============================================================

import * as THREE from 'three';
import { WOLF, DOG, DUSK } from './config.ts';
import type { World } from './world.ts';
import type { Dog } from './dog.ts';
import type { Flock, SheepAgent } from './sheep.ts';
import { clamp, lerp, damp } from './rng.ts';
import { paint, flatMat } from './meshUtil.ts';

export type WolfState = 'emerge' | 'stalk' | 'charge' | 'drag' | 'flee' | 'gone';

export interface WolfCallbacks {
  onGrab(w: Wolf, s: SheepAgent): void;
  onSheepLost(s: SheepAgent): void;
  onSheepFreed(s: SheepAgent): void;
  onDrivenOff(w: Wolf, cause: 'bark' | 'eye' | 'dog'): void;
  onCharge(w: Wolf): void;
  onEmerge(w: Wolf): void;
}

let wuid = 0;

export class Wolf {
  private static pushScratch = new THREE.Vector3();
  id = wuid++;
  state: WolfState = 'emerge';
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  target: SheepAgent | null = null;
  group = new THREE.Group();

  private stateTime = 0;
  private retargetTimer = 0;
  private stalkTotal = 0;
  private orbitDir = Math.random() < 0.5 ? 1 : -1;
  private legs: THREE.Object3D[] = [];
  private body!: THREE.Object3D;
  private head!: THREE.Object3D;
  private eyeSprites: THREE.Sprite[] = [];
  private animPhase = Math.random() * 7;
  private fadeIn = 0;

  constructor(pos: THREE.Vector3) {
    this.pos.copy(pos);
    this.buildMesh();
    this.group.position.copy(pos);
  }

  private buildMesh(): void {
    const mat = flatMat();
    const GREY = 0x41434c;
    const DARK = 0x32343c;
    const mk = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      return m;
    };
    this.body = new THREE.Group();
    this.body.add(mk(paint(new THREE.BoxGeometry(0.44, 0.46, 1.05), GREY), 0, 0, 0.05));
    this.body.add(mk(paint(new THREE.BoxGeometry(0.46, 0.3, 0.5), DARK), 0, 0.24, 0.1)); // dark saddle
    this.body.add(mk(paint(new THREE.BoxGeometry(0.4, 0.42, 0.34), GREY), 0, -0.02, -0.52)); // chest

    this.head = new THREE.Group();
    this.head.add(mk(paint(new THREE.BoxGeometry(0.3, 0.28, 0.32), GREY)));
    this.head.add(mk(paint(new THREE.BoxGeometry(0.14, 0.12, 0.26), DARK), 0, -0.05, -0.26));
    const earGeo = paint(new THREE.ConeGeometry(0.07, 0.18, 4), DARK);
    const earL = mk(earGeo, -0.1, 0.2, 0);
    const earR = mk(earGeo.clone(), 0.1, 0.2, 0);
    this.head.add(earL, earR);
    this.head.position.set(0, 0.16, -0.72);
    this.body.add(this.head);

    // glowing eyes — night readability
    const cnv = document.createElement('canvas');
    cnv.width = cnv.height = 32;
    const ctx = cnv.getContext('2d')!;
    const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
    g.addColorStop(0, 'rgba(255, 190, 90, 1)');
    g.addColorStop(0.35, 'rgba(255, 160, 60, 0.6)');
    g.addColorStop(1, 'rgba(255, 140, 40, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(cnv);
    for (const x of [-0.1, 0.1]) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0.9, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      spr.scale.set(0.3, 0.3, 1);
      spr.position.set(x, 0.02, -0.19);
      this.head.add(spr);
      this.eyeSprites.push(spr);
    }

    const tail = mk(paint(new THREE.BoxGeometry(0.12, 0.12, 0.55), DARK), 0, 0.1, 0.75);
    tail.rotation.x = -0.5;
    this.body.add(tail);

    const legGeo = paint(new THREE.BoxGeometry(0.11, 0.5, 0.12), DARK);
    const mkLeg = (x: number, z: number): THREE.Object3D => {
      const leg = new THREE.Mesh(legGeo.clone(), mat);
      leg.position.set(x, -0.2, z);
      this.body.add(leg);
      return leg;
    };
    this.legs = [mkLeg(-0.16, -0.42), mkLeg(0.16, -0.42), mkLeg(-0.16, 0.42), mkLeg(0.16, 0.42)];

    this.body.position.y = 0.66;
    this.group.add(this.body);
    this.group.scale.setScalar(0.4);
  }

  get threatening(): boolean {
    return this.state === 'stalk' || this.state === 'charge' || this.state === 'drag';
  }

  update(
    dt: number,
    world: World,
    dog: Dog,
    flock: Flock,
    darkness: number,
    cb: WolfCallbacks,
    tmp: THREE.Vector3,
    tmp2: THREE.Vector3,
  ): void {
    this.stateTime += dt;
    const dDog = this.pos.distanceTo(dog.pos);

    // universal responses to the dog (except when already fleeing/gone)
    if (this.state === 'stalk' || this.state === 'charge' || this.state === 'drag') {
      // proximity repel
      const repel = this.state === 'drag' ? WOLF.repelDist : WOLF.repelDist + (this.state === 'charge' ? 1.5 : 0);
      if (dDog < repel) {
        this.startFlee(dog, cb, 'dog');
      } else if (dog.eyeActive && dDog < DOG.eyeWolfRange) {
        // the stare — directional
        tmp.subVectors(this.pos, dog.pos).normalize();
        dog.facingDir(tmp2);
        if (tmp.dot(tmp2) > DOG.eyeCosHalfAngle) {
          this.startFlee(dog, cb, 'eye');
        }
      }
    }

    switch (this.state) {
      case 'emerge': {
        this.fadeIn = Math.min(1, this.fadeIn + dt / 1.1);
        this.group.scale.setScalar(lerp(0.4, 1, this.fadeIn));
        const c = flock.centroid();
        tmp.subVectors(c, this.pos).normalize().multiplyScalar(WOLF.stalkSpeed * 0.7);
        this.vel.lerp(tmp, damp(3, dt));
        if (this.fadeIn >= 1) {
          this.state = 'stalk';
          this.stateTime = 0;
        }
        break;
      }

      case 'stalk': {
        this.stalkTotal += dt;
        this.retargetTimer -= dt;
        if (!this.validTarget() || this.retargetTimer <= 0) {
          this.pickTarget(world, dog, flock);
          this.retargetTimer = 1.6;
        }
        if (!this.target) {
          // nothing hunt-able: slink off after a while
          if (this.stalkTotal > 6) this.state = 'flee';
          break;
        }
        const t = this.target;
        // orbit the target, biased to the side away from the dog
        tmp.subVectors(this.pos, t.pos);
        const d = tmp.length() || 1;
        tmp.divideScalar(d);
        const tangentX = -tmp.z * this.orbitDir;
        const tangentZ = tmp.x * this.orbitDir;
        const radialErr = (d - WOLF.stalkRadius) / WOLF.stalkRadius;
        tmp2.set(
          tangentX - tmp.x * radialErr * 1.6,
          0,
          tangentZ - tmp.z * radialErr * 1.6,
        ).normalize().multiplyScalar(WOLF.stalkSpeed);
        this.vel.lerp(tmp2, damp(2.5, dt));

        // avoid lantern light
        this.avoidLanterns(world, dt);

        // the opening: dog far from target, wolf near enough
        const dogToTarget = dog.pos.distanceTo(t.pos);
        if (dogToTarget > WOLF.dogSafeDist && d < WOLF.chargeMaxDist) {
          this.state = 'charge';
          this.stateTime = 0;
          cb.onCharge(this);
        }
        if (this.stalkTotal > 26) {
          this.state = 'flee';
        }
        break;
      }

      case 'charge': {
        if (!this.validTarget()) {
          this.state = 'stalk';
          this.stateTime = 0;
          break;
        }
        const t = this.target!;
        // abort if prey reaches lantern sanctuary
        if (world.nearestLanternDist(t.pos.x, t.pos.z) < WOLF.lanternAvoid) {
          this.state = 'stalk';
          this.stateTime = 0;
          break;
        }
        tmp.subVectors(t.pos, this.pos);
        const d = tmp.length() || 1;
        tmp.divideScalar(d).multiplyScalar(WOLF.chargeSpeed);
        this.vel.lerp(tmp, damp(6, dt));
        if (d < WOLF.grabDist) {
          t.state = 'taken';
          cb.onGrab(this, t);
          this.state = 'drag';
          this.stateTime = 0;
        }
        if (this.stateTime > 7) this.state = 'stalk';
        break;
      }

      case 'drag': {
        const t = this.target;
        if (!t || t.state !== 'taken') {
          this.state = 'flee';
          break;
        }
        // haul toward the nearest treeline (straight out of the corridor)
        const cx = world.pathCX(this.pos.z);
        const side = this.pos.x >= cx ? 1 : -1;
        const goalX = cx + side * (world.corridorW(this.pos.z) + 30);
        tmp.set(goalX - this.pos.x, 0, (Math.sign(this.pos.z + 260) || 1) * -2 - 0);
        tmp.normalize().multiplyScalar(WOLF.dragSpeed);
        this.vel.lerp(tmp, damp(4, dt));

        // the sheep is carried at the jaws (face dir = (-sin θ, -cos θ))
        t.pos.set(
          this.pos.x - Math.sin(this.group.rotation.y) * 0.95,
          this.pos.y,
          this.pos.z - Math.cos(this.group.rotation.y) * 0.95,
        );

        // escaped into the dark?
        if (Math.abs(this.pos.x - cx) > world.corridorW(this.pos.z) + 24) {
          t.state = 'lost';
          t.group.visible = false;
          cb.onSheepLost(t);
          this.target = null;
          this.state = 'gone';
        }
        break;
      }

      case 'flee': {
        const cx = world.pathCX(this.pos.z);
        const side = this.pos.x >= cx ? 1 : -1;
        tmp.set(side, 0, 0).multiplyScalar(WOLF.fleeSpeed);
        // also away from the dog
        tmp2.subVectors(this.pos, dog.pos).normalize().multiplyScalar(WOLF.fleeSpeed * 0.7);
        tmp.add(tmp2).normalize().multiplyScalar(WOLF.fleeSpeed);
        this.vel.lerp(tmp, damp(5, dt));
        if (this.stateTime > WOLF.fleeTime) this.state = 'gone';
        break;
      }

      case 'gone':
        break;
    }

    // integrate
    const smp = world.sample(this.pos.x, this.pos.z);
    let speedMul = 1;
    if (smp.waterDepth > 0.4) speedMul = 0.45;
    else if (smp.bog) speedMul = 0.55;
    this.pos.x += this.vel.x * speedMul * dt;
    this.pos.z += this.vel.z * speedMul * dt;
    if (world.resolveCircle(this.pos, WOLF.radius, Wolf.pushScratch)) {
      const n = Wolf.pushScratch;
      const nl = Math.hypot(n.x, n.z);
      if (nl > 1e-6) {
        const nx = n.x / nl;
        const nz = n.z / nl;
        const into = this.vel.x * nx + this.vel.z * nz;
        if (into < 0) {
          this.vel.x -= nx * into;
          this.vel.z -= nz * into;
        }
      }
    }
    this.pos.y = smp.h;

    // facing + anim
    const sp = Math.hypot(this.vel.x, this.vel.z) * speedMul;
    if (sp > 0.4) {
      const yaw = Math.atan2(-this.vel.x, -this.vel.z);
      let dy = yaw - this.group.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.group.rotation.y += dy * damp(8, dt);
    }
    this.animPhase += dt * (2.5 + sp * 2.4);
    const swing = clamp(sp / 3, 0, 1) * 0.8;
    for (let i = 0; i < 4; i++) {
      const ph = i % 2 === 0 ? 0 : Math.PI;
      const ph2 = i < 2 ? 0 : Math.PI * 0.9;
      this.legs[i].rotation.x = Math.sin(this.animPhase + ph + ph2) * swing;
    }
    // prowl low while stalking
    const crouch = this.state === 'stalk' ? -0.12 : 0;
    this.body.position.y = 0.66 + crouch;
    this.head.rotation.x = this.state === 'stalk' ? 0.22 : this.state === 'drag' ? 0.3 : 0;
    // eye glow stronger at night
    const glow = 0.35 + darkness * 0.65;
    for (const e of this.eyeSprites) e.material.opacity = glow;

    this.group.position.copy(this.pos);
  }

  private avoidLanterns(world: World, dt: number): void {
    let nearest: THREE.Vector3 | null = null;
    let best = WOLF.lanternAvoid * WOLF.lanternAvoid;
    for (const l of world.lanterns) {
      const dx = this.pos.x - l.x;
      const dz = this.pos.z - l.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) {
        best = d2;
        nearest = l;
      }
    }
    if (nearest) {
      const d = Math.sqrt(best) || 1;
      this.vel.x += ((this.pos.x - nearest.x) / d) * 14 * dt;
      this.vel.z += ((this.pos.z - nearest.z) / d) * 14 * dt;
    }
  }

  private validTarget(): boolean {
    return !!this.target && this.target.state === 'flock';
  }

  private pickTarget(world: World, dog: Dog, flock: Flock): void {
    let best: SheepAgent | null = null;
    let bestScore = -Infinity;
    for (const s of flock.agents) {
      if (s.state !== 'flock') continue;
      // sanctuary
      if (world.nearestLanternDist(s.pos.x, s.pos.z) < WOLF.lanternAvoid) continue;
      // isolation: distance to nearest flockmate
      let nearMate = 60;
      for (const o of flock.agents) {
        if (o === s || o.state !== 'flock') continue;
        const d = s.pos.distanceTo(o.pos);
        if (d < nearMate) nearMate = d;
      }
      const dogD = s.pos.distanceTo(dog.pos);
      const wolfD = s.pos.distanceTo(this.pos);
      const score = nearMate * 1.1 + dogD * 0.62 - wolfD * 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    this.target = best;
  }

  startFlee(dog: Dog, cb: WolfCallbacks, cause: 'bark' | 'eye' | 'dog'): void {
    if (this.state === 'flee' || this.state === 'gone') return;
    const wasDragging = this.state === 'drag';
    if (wasDragging && this.target && this.target.state === 'taken') {
      const s = this.target;
      s.state = 'flock';
      s.fear = 1;
      s.vel.set(
        (s.pos.x - this.pos.x) * 2.2,
        0,
        (s.pos.z - this.pos.z) * 2.2,
      );
      cb.onSheepFreed(s);
    }
    this.target = null;
    this.state = 'flee';
    this.stateTime = 0;
    cb.onDrivenOff(this, cause);
  }
}

export class WolfPack {
  wolves: Wolf[] = [];
  group = new THREE.Group();
  totalDrivenOff = 0;
  private spawnTimer = 14;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  update(
    dt: number,
    world: World,
    dog: Dog,
    flock: Flock,
    darkness: number,
    elapsed: number,
    cb: WolfCallbacks,
  ): void {
    // director
    const centroid = flock.centroid();
    const pastGrace = elapsed > WOLF.graceTime || centroid.z < WOLF.graceZ;
    if (pastGrace && flock.count('flock') > 0) {
      this.spawnTimer -= dt;
      const surge = elapsed > DUSK.duration + DUSK.nightWolfSurgeDelay ? 0.68 : 1;
      const interval = lerp(WOLF.spawnBase, WOLF.spawnMin, darkness) * surge;
      const maxAlive = Math.round(lerp(WOLF.maxAliveBase, WOLF.maxAliveNight, Math.pow(darkness, 1.4)));
      const alive = this.wolves.filter((w) => w.state !== 'gone').length;
      if (this.spawnTimer <= 0 && alive < maxAlive) {
        this.spawnTimer = interval * (0.75 + Math.random() * 0.5);
        this.spawn(world, dog, centroid, cb);
      }
    }

    for (const w of this.wolves) {
      if (w.state === 'gone') continue;
      w.update(dt, world, dog, flock, darkness, cb, this.tmp, this.tmp2);
    }
    // prune
    this.wolves = this.wolves.filter((w) => {
      if (w.state === 'gone') {
        this.group.remove(w.group);
        return false;
      }
      return true;
    });
  }

  private spawn(world: World, dog: Dog, centroid: THREE.Vector3, cb: WolfCallbacks): void {
    for (let tries = 0; tries < 8; tries++) {
      const z = centroid.z + (Math.random() - 0.35) * 46;
      const cx = world.pathCX(z);
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = cx + side * (world.corridorW(z) + WOLF.emergeDist[0] * 0.35 + Math.random() * 14);
      this.tmp.set(x, 0, z);
      if (this.tmp.distanceTo(dog.pos) < 26) continue;
      const smp = world.sample(x, z);
      if (smp.deepWater) continue;
      this.tmp.y = smp.h;
      const w = new Wolf(this.tmp);
      this.wolves.push(w);
      this.group.add(w.group);
      cb.onEmerge(w);
      return;
    }
  }

  applyBark(dogPos: THREE.Vector3, dog: Dog, cb: WolfCallbacks): void {
    for (const w of this.wolves) {
      if (w.state === 'gone' || w.state === 'flee') continue;
      const radius = w.state === 'drag' ? DOG.barkWolfRadius * 0.72 : DOG.barkWolfRadius;
      if (w.pos.distanceTo(dogPos) < radius) {
        w.startFlee(dog, cb, 'bark');
      }
    }
  }

  /** positions the sheep system reads for flee forces */
  threats(): Array<{ pos: THREE.Vector3; threatening: boolean }> {
    return this.wolves;
  }
}
