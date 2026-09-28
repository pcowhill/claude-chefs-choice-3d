// Third-person camera: orbits the dog under pointer lock, with a
// gentle auto-follow fallback when lock is unavailable. Spring-damped
// position, terrain clearance, sprint FOV, and a subtle Eye zoom.

import * as THREE from 'three';
import type { World } from './world.ts';
import type { Input } from './input.ts';
import { clamp, damp, lerp } from './rng.ts';

export class DogCamera {
  camera: THREE.PerspectiveCamera;
  yaw = 0; // camera sits up-valley of the dog, looking down-valley (-z)
  pitch = 0.34;
  private dist = 11.5;
  private curDist = 11.5;
  private curFov = 55;
  private target = new THREE.Vector3();
  private curPos = new THREE.Vector3();
  private lookAhead = new THREE.Vector3();
  private shake = 0;
  private initialized = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.3, 1600);
  }

  addShake(a: number): void {
    this.shake = Math.min(1, this.shake + a);
  }

  update(
    dt: number,
    input: Input,
    dogPos: THREE.Vector3,
    dogVel: THREE.Vector3,
    world: World,
    eyeActive: boolean,
    sprinting: boolean,
    allowLook: boolean,
  ): void {
    const look = input.consumeLook();
    if (allowLook) {
      const sens = input.pointerLocked ? 0.0021 : 0.0042;
      this.yaw -= look.dx * sens;
      this.pitch = clamp(this.pitch + look.dy * sens * 0.85, 0.1, 0.72);
    }

    // auto-follow when the mouse isn't steering (no lock, not dragging)
    if (allowLook && !input.pointerLocked && !input.dragging) {
      const sp = Math.hypot(dogVel.x, dogVel.z);
      if (sp > 2.2) {
        // face the camera the way the dog runs: forward = (-sin yaw, -cos yaw)
        const velYaw = Math.atan2(-dogVel.x, -dogVel.z);
        let d = velYaw - this.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.yaw += d * damp(1.15, dt);
      }
    }

    // frame target: above the dog, leading its motion
    this.lookAhead.set(dogVel.x, 0, dogVel.z).multiplyScalar(0.22);
    const la = this.lookAhead.length();
    if (la > 2.4) this.lookAhead.multiplyScalar(2.4 / la);
    const tx = dogPos.x + this.lookAhead.x;
    const tz = dogPos.z + this.lookAhead.z;
    const ty = dogPos.y + 1.5;
    this.target.set(tx, lerp(this.target.y || ty, ty, damp(9, dt)), tz);
    this.target.x = lerp(this.target.x || tx, tx, damp(14, dt));
    this.target.z = lerp(this.target.z || tz, tz, damp(14, dt));

    // distance + fov by stance
    const wantDist = eyeActive ? 8.6 : sprinting ? 12.8 : this.dist;
    this.curDist = lerp(this.curDist, wantDist, damp(4, dt));
    const wantFov = eyeActive ? 48 : sprinting ? 61 : 55;
    this.curFov = lerp(this.curFov, wantFov, damp(5, dt));
    this.camera.fov = this.curFov;
    this.camera.updateProjectionMatrix();

    const cp = Math.cos(this.pitch);
    const desired = new THREE.Vector3(
      this.target.x + Math.sin(this.yaw) * cp * this.curDist,
      this.target.y + Math.sin(this.pitch) * this.curDist,
      this.target.z + Math.cos(this.yaw) * cp * this.curDist,
    );

    // terrain clearance along the boom
    for (const t of [0.35, 0.65, 1]) {
      const px = lerp(this.target.x, desired.x, t);
      const pz = lerp(this.target.z, desired.z, t);
      const gh = world.heightAt(px, pz) + 0.7;
      const py = lerp(this.target.y, desired.y, t);
      if (py < gh) desired.y += (gh - py) * (1 / t) * 0.9;
    }

    if (!this.initialized) {
      this.curPos.copy(desired);
      this.initialized = true;
    } else {
      const k = damp(input.pointerLocked ? 30 : 16, dt);
      this.curPos.lerp(desired, k);
    }

    // shake
    this.shake = Math.max(0, this.shake - dt * 3.2);
    const s = this.shake * this.shake * 0.5;
    const t2 = performance.now() * 0.001;

    this.camera.position.set(
      this.curPos.x + Math.sin(t2 * 51) * s,
      this.curPos.y + Math.sin(t2 * 47 + 2) * s * 0.7,
      this.curPos.z + Math.cos(t2 * 43 + 1) * s,
    );
    this.camera.lookAt(this.target.x, this.target.y + Math.sin(t2 * 38) * s * 0.4, this.target.z);
  }
}
