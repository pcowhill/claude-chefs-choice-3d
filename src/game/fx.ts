// Lightweight particle/FX layer: bark shockwaves, running dust,
// grab flashes, gate sparkles, and the golden swirls that mark
// stray sheep. Everything is sprites + a couple of ring meshes.

import * as THREE from 'three';
import type { World } from './world.ts';

interface Particle {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  grow: number;
  fade: THREE.Material & { opacity: number };
  gravity: number;
}

function softTexture(r: number, g: number, b: number): THREE.CanvasTexture {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 32;
  const ctx = cnv.getContext('2d')!;
  const grad = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.95)`);
  grad.addColorStop(0.5, `rgba(${r},${g},${b},0.42)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(cnv);
}

export class FX {
  group = new THREE.Group();
  private particles: Particle[] = [];
  private world: World;

  private dustTex = softTexture(190, 170, 135);
  private goldTex = softTexture(255, 210, 120);
  private redTex = softTexture(255, 110, 70);
  private whiteTex = softTexture(240, 235, 220);

  private ringGeo = new THREE.RingGeometry(0.86, 1, 48);
  private markerSwirls = new Map<number, THREE.Group>();
  private time = 0;

  constructor(world: World) {
    this.world = world;
  }

  private spawnSprite(
    tex: THREE.CanvasTexture,
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    scale: number,
    life: number,
    opacity = 0.8,
    grow = 0,
    gravity = 0,
    blending: THREE.Blending = THREE.NormalBlending,
  ): void {
    if (this.particles.length > 240) return;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity,
      depthWrite: false,
      blending,
    });
    const spr = new THREE.Sprite(mat);
    spr.position.copy(pos);
    spr.scale.setScalar(scale);
    this.group.add(spr);
    this.particles.push({ obj: spr, vel: vel.clone(), life, maxLife: life, grow, fade: mat, gravity });
  }

  barkRing(pos: THREE.Vector3, radius: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe9c2,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(this.ringGeo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, this.world.heightAt(pos.x, pos.z) + 0.25, pos.z);
    ring.scale.setScalar(0.8);
    this.group.add(ring);
    const grow = radius / 0.42;
    this.particles.push({
      obj: ring,
      vel: new THREE.Vector3(),
      life: 0.42,
      maxLife: 0.42,
      grow,
      fade: mat,
      gravity: 0,
    });
  }

  dust(pos: THREE.Vector3, backDir: THREE.Vector3, amount: number): void {
    for (let i = 0; i < amount; i++) {
      const v = new THREE.Vector3(
        backDir.x * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.8,
        0.6 + Math.random() * 0.9,
        backDir.z * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.8,
      );
      const p = pos.clone();
      p.y += 0.15;
      p.x += (Math.random() - 0.5) * 0.4;
      p.z += (Math.random() - 0.5) * 0.4;
      this.spawnSprite(this.dustTex, p, v, 0.35 + Math.random() * 0.4, 0.5 + Math.random() * 0.3, 0.4, 1.6, -0.6);
    }
  }

  splash(pos: THREE.Vector3): void {
    for (let i = 0; i < 5; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, 1.4 + Math.random() * 1.4, (Math.random() - 0.5) * 2);
      this.spawnSprite(this.whiteTex, pos, v, 0.22 + Math.random() * 0.2, 0.45, 0.7, 0.4, -5);
    }
  }

  grabFlash(pos: THREE.Vector3): void {
    for (let i = 0; i < 10; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 4, 1 + Math.random() * 2.4, (Math.random() - 0.5) * 4);
      this.spawnSprite(this.redTex, pos, v, 0.4 + Math.random() * 0.5, 0.5, 0.85, 0.8, -3, THREE.AdditiveBlending);
    }
    for (let i = 0; i < 6; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 3);
      this.spawnSprite(this.whiteTex, pos, v, 0.3, 0.6, 0.65, 0.5, -2);
    }
  }

  freedBurst(pos: THREE.Vector3): void {
    for (let i = 0; i < 8; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, 1.2 + Math.random() * 2, (Math.random() - 0.5) * 3);
      this.spawnSprite(this.goldTex, pos, v, 0.32, 0.7, 0.8, 0.7, -1.6, THREE.AdditiveBlending);
    }
  }

  gateSparkle(pos: THREE.Vector3): void {
    for (let i = 0; i < 7; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.4, 1.4 + Math.random() * 1.6, (Math.random() - 0.5) * 1.4);
      const p = pos.clone();
      p.x += (Math.random() - 0.5) * 1.4;
      p.y += 0.4;
      p.z += (Math.random() - 0.5) * 1.4;
      this.spawnSprite(this.goldTex, p, v, 0.26 + Math.random() * 0.22, 0.9, 0.85, 0.4, -0.7, THREE.AdditiveBlending);
    }
  }

  winBurst(pos: THREE.Vector3): void {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 3), 2.4 + Math.random() * 3.4, Math.sin(a) * (1 + Math.random() * 3));
      this.spawnSprite(this.goldTex, pos, v, 0.3 + Math.random() * 0.4, 1.4 + Math.random() * 0.6, 0.9, 0.5, -2.4, THREE.AdditiveBlending);
    }
  }

  /** golden swirl above a stray sheep */
  addStrayMarker(id: number, pos: THREE.Vector3): void {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.goldTex,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(0.34);
      g.add(s);
    }
    g.position.copy(pos);
    this.group.add(g);
    this.markerSwirls.set(id, g);
  }

  removeStrayMarker(id: number): void {
    const g = this.markerSwirls.get(id);
    if (g) {
      this.group.remove(g);
      this.markerSwirls.delete(id);
    }
  }

  updateStrayMarker(id: number, pos: THREE.Vector3): void {
    const g = this.markerSwirls.get(id);
    if (!g) return;
    g.position.set(pos.x, pos.y + 1.7, pos.z);
    g.children.forEach((c, i) => {
      const a = this.time * 2.2 + (i * Math.PI * 2) / 3;
      c.position.set(Math.cos(a) * 0.5, Math.sin(this.time * 3.1 + i) * 0.16, Math.sin(a) * 0.5);
    });
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.obj);
        (p.obj as THREE.Sprite).material?.dispose?.();
        this.particles.splice(i, 1);
        continue;
      }
      const t = p.life / p.maxLife;
      p.vel.y += p.gravity * dt;
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.grow !== 0) {
        const s = p.obj.scale.x + p.grow * dt * (p.obj.scale.x + 1);
        p.obj.scale.setScalar(s);
      }
      p.fade.opacity = Math.min(p.fade.opacity, t * 0.95);
    }
  }
}
