// ============================================================
// The dog — a border collie built from boxes, animated in code.
// Movement is velocity-based and camera-relative. The dog's three
// pressures (presence, the Eye, the bark) are *read* by the flock;
// this class just owns the body, stamina, and cooldowns.
// ============================================================

import * as THREE from 'three';
import { DOG } from './config.ts';
import type { World } from './world.ts';
import type { Input } from './input.ts';
import { clamp, damp, lerp } from './rng.ts';
import { paint, flatMat } from './meshUtil.ts';

const BLACK = 0x232326;
const WHITE = 0xefe8da;
const COLLAR = 0xc4482a;

export class Dog {
  group = new THREE.Group();
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  facing = 0; // yaw; model faces -z at rotation 0, i.e. down-valley
  speed = 0;
  heroLight: THREE.PointLight;

  stamina = DOG.staminaMax;
  private staminaWait = 0;
  eyeActive = false;
  barkCooldown = 0;
  whistleCooldown = 0;
  whistleActiveTimer = 0;

  /** events for the current frame (game routes them to flock/audio/fx) */
  barkedThisFrame = false;
  whistledThisFrame = false;

  swimming = false;
  inBog = false;

  private static pushScratch = new THREE.Vector3();

  // body parts for animation
  private legs: THREE.Object3D[] = [];
  private tail!: THREE.Object3D;
  private head!: THREE.Object3D;
  private earL!: THREE.Object3D;
  private earR!: THREE.Object3D;
  private body!: THREE.Object3D;
  private animPhase = 0;
  private bobAmt = 0;
  private barkKick = 0;

  constructor(world: World) {
    this.buildMesh();
    // a faint cool "hero light" keeps the dog and nearby sheep readable at night
    this.heroLight = new THREE.PointLight(0x93a7e8, 0, 16, 1.8);
    this.heroLight.position.set(0, 2.6, 0);
    this.group.add(this.heroLight);
    this.pos.copy(world.dogStart);
    this.group.position.copy(this.pos);
  }

  /** ramp the night light with darkness */
  setDarkness(darkness: number): void {
    this.heroLight.intensity = Math.max(0, (darkness - 0.42) / 0.58) * 7;
  }

  private buildMesh(): void {
    const mat = flatMat();
    const mk = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      return m;
    };

    this.body = new THREE.Group();
    // torso: black rear, white chest
    this.body.add(mk(paint(new THREE.BoxGeometry(0.42, 0.42, 0.72), BLACK), 0, 0, 0.06));
    this.body.add(mk(paint(new THREE.BoxGeometry(0.44, 0.4, 0.34), WHITE), 0, -0.02, -0.42));
    // haunches
    this.body.add(mk(paint(new THREE.BoxGeometry(0.46, 0.36, 0.3), BLACK), 0, 0.02, 0.36));

    // head
    this.head = new THREE.Group();
    const skull = mk(paint(new THREE.BoxGeometry(0.34, 0.3, 0.3), BLACK));
    const blaze = mk(paint(new THREE.BoxGeometry(0.09, 0.31, 0.31), WHITE), 0, 0.005, -0.004);
    const muzzle = mk(paint(new THREE.BoxGeometry(0.16, 0.14, 0.2), WHITE), 0, -0.06, -0.22);
    const nose = mk(paint(new THREE.BoxGeometry(0.07, 0.06, 0.05), 0x111114), 0, -0.03, -0.32);
    this.head.add(skull, blaze, muzzle, nose);
    this.earL = mk(paint(new THREE.ConeGeometry(0.085, 0.2, 4), BLACK), -0.12, 0.2, 0.02);
    this.earR = mk(paint(new THREE.ConeGeometry(0.085, 0.2, 4), BLACK), 0.12, 0.2, 0.02);
    this.earL.rotation.z = 0.28;
    this.earR.rotation.z = -0.28;
    this.head.add(this.earL, this.earR);
    // collar
    this.head.add(mk(paint(new THREE.BoxGeometry(0.3, 0.09, 0.28), COLLAR), 0, -0.17, 0.1));
    this.head.position.set(0, 0.26, -0.6);
    this.body.add(this.head);

    // tail — white tip
    this.tail = new THREE.Group();
    this.tail.add(mk(paint(new THREE.BoxGeometry(0.1, 0.1, 0.34), BLACK), 0, 0.05, 0.16));
    this.tail.add(mk(paint(new THREE.BoxGeometry(0.09, 0.09, 0.16), WHITE), 0, 0.12, 0.4));
    this.tail.position.set(0, 0.12, 0.5);
    this.body.add(this.tail);

    // legs — white socks
    const mkLeg = (x: number, z: number): THREE.Object3D => {
      const leg = new THREE.Group();
      leg.add(mk(paint(new THREE.BoxGeometry(0.11, 0.24, 0.12), BLACK), 0, -0.1, 0));
      leg.add(mk(paint(new THREE.BoxGeometry(0.1, 0.2, 0.11), WHITE), 0, -0.3, 0));
      leg.position.set(x, -0.16, z);
      this.body.add(leg);
      return leg;
    };
    this.legs = [mkLeg(-0.16, -0.34), mkLeg(0.16, -0.34), mkLeg(-0.16, 0.42), mkLeg(0.16, 0.42)];

    this.body.position.y = 0.58;
    this.group.add(this.body);
  }

  update(dt: number, input: Input, camYaw: number, world: World, canAct: boolean): void {
    this.barkedThisFrame = false;
    this.whistledThisFrame = false;

    this.barkCooldown = Math.max(0, this.barkCooldown - dt);
    this.whistleCooldown = Math.max(0, this.whistleCooldown - dt);
    this.whistleActiveTimer = Math.max(0, this.whistleActiveTimer - dt);

    this.eyeActive = canAct && input.eyeHeld;

    // --- movement ---
    const mx = canAct ? input.moveX : 0;
    const mz = canAct ? input.moveZ : 0;
    const hasMove = mx !== 0 || mz !== 0;

    const sinY = Math.sin(camYaw);
    const cosY = Math.cos(camYaw);
    // camera forward on the ground plane
    const fx = -sinY, fz = -cosY;
    const rx = cosY, rz = -sinY;

    let dirX = fx * mz + rx * mx;
    let dirZ = fz * mz + rz * mx;
    const dl = Math.hypot(dirX, dirZ);
    if (dl > 1e-5) { dirX /= dl; dirZ /= dl; }

    const wantSprint = input.sprintHeld && !this.eyeActive && this.stamina > 0.05 && hasMove;
    let targetSpeed = this.eyeActive ? DOG.eyeSpeed : wantSprint ? DOG.sprintSpeed : DOG.walkSpeed;

    const smp = world.sample(this.pos.x, this.pos.z);
    this.swimming = smp.waterDepth > 0.42;
    this.inBog = smp.bog;
    if (this.swimming) targetSpeed *= DOG.swimFactor;
    else if (this.inBog) targetSpeed *= DOG.bogFactor;

    // steer toward the desired velocity — exact speed caps, crisp stops
    const desX = dirX * (hasMove ? targetSpeed : 0);
    const desZ = dirZ * (hasMove ? targetSpeed : 0);
    const rate = hasMove ? DOG.accel : DOG.decel;
    const dvx = desX - this.vel.x;
    const dvz = desZ - this.vel.z;
    const dv = Math.hypot(dvx, dvz);
    if (dv > 1e-6) {
      const step = Math.min(dv, rate * dt);
      this.vel.x += (dvx / dv) * step;
      this.vel.z += (dvz / dv) * step;
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // stamina
    if (wantSprint && this.speed > 4) {
      this.stamina = Math.max(0, this.stamina - dt);
      this.staminaWait = DOG.staminaRegenDelay;
    } else {
      this.staminaWait -= dt;
      if (this.staminaWait <= 0) {
        this.stamina = Math.min(DOG.staminaMax, this.stamina + DOG.staminaRegen * dt);
      }
    }

    // integrate + collide (slide along obstacles rather than stalling)
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    if (world.resolveCircle(this.pos, DOG.radius, Dog.pushScratch)) {
      const n = Dog.pushScratch;
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
    const ground = world.sample(this.pos.x, this.pos.z);
    const targetY = ground.h + (this.swimming ? -0.12 : 0);
    this.pos.y = lerp(this.pos.y, targetY, damp(18, dt));

    // facing: aim with the camera while staring; otherwise face velocity.
    // (model face = local -z, so θ = atan2(-vx, -vz) points the face along v)
    let targetFacing = this.facing;
    if (this.eyeActive) {
      targetFacing = camYaw;
    } else if (this.speed > 0.6) {
      targetFacing = Math.atan2(-this.vel.x, -this.vel.z);
    }
    let dAng = targetFacing - this.facing;
    while (dAng > Math.PI) dAng -= Math.PI * 2;
    while (dAng < -Math.PI) dAng += Math.PI * 2;
    this.facing += dAng * damp(DOG.turnRate, dt);

    // --- actions ---
    if (canAct && input.barkPressed && this.barkCooldown <= 0) {
      this.barkCooldown = DOG.barkCooldown;
      this.barkedThisFrame = true;
      this.barkKick = 1;
    }
    if (canAct && input.whistlePressed && this.whistleCooldown <= 0) {
      this.whistleCooldown = DOG.whistleCooldown;
      this.whistleActiveTimer = DOG.whistleDuration;
      this.whistledThisFrame = true;
    }

    this.animate(dt, ground.waterDepth);

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.facing;
  }

  /** unit facing vector on the ground plane (where the nose points) */
  facingDir(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.facing), 0, -Math.cos(this.facing));
  }

  private animate(dt: number, waterDepth: number): void {
    const spNorm = clamp(this.speed / DOG.sprintSpeed, 0, 1);
    this.animPhase += dt * (4 + this.speed * 2.6);
    this.bobAmt = lerp(this.bobAmt, spNorm, damp(8, dt));
    this.barkKick = Math.max(0, this.barkKick - dt * 5);

    const swing = spNorm * (this.swimming ? 0.35 : 0.85);
    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? 0 : Math.PI;
      const endPhase = i < 2 ? 0 : Math.PI * 0.9;
      this.legs[i].rotation.x = Math.sin(this.animPhase + side + endPhase) * swing;
    }

    // gallop bob + eye crouch
    const crouch = this.eyeActive ? -0.2 : 0;
    this.body.position.y = 0.58 + crouch + Math.abs(Math.sin(this.animPhase)) * 0.055 * this.bobAmt - waterDepth * 0.35;
    this.body.rotation.x = (this.eyeActive ? 0.1 : 0) + Math.sin(this.animPhase) * 0.035 * this.bobAmt;

    // head: stare low and forward, or bark kick up
    this.head.rotation.x = lerp(this.head.rotation.x, (this.eyeActive ? 0.34 : 0) - this.barkKick * 0.5, damp(12, dt));
    // tail: high and wagging when idle/walking, streaming when running, still when staring
    const wagRate = this.eyeActive ? 0.5 : 7 + spNorm * 6;
    this.tail.rotation.y = Math.sin(this.animPhase * 0.5 * wagRate * 0.3 + performance.now() * 0.002 * wagRate) * (this.eyeActive ? 0.08 : 0.5 - spNorm * 0.25);
    this.tail.rotation.x = lerp(0.5, -0.15, spNorm) + (this.eyeActive ? 0.35 : 0);
    // ears flop with speed
    const flop = Math.sin(this.animPhase * 2) * 0.12 * this.bobAmt;
    this.earL.rotation.z = 0.28 + flop;
    this.earR.rotation.z = -0.28 - flop;
  }
}
