// ============================================================
// The gloaming itself — sun → sunset → blue hour → moonlit night.
// One directional light plays both sun and moon (only ever one
// shadow caster). Sky dome is a tiny gradient shader; stars and
// moon fade in as darkness rises. Darkness drives wolf pressure.
// ============================================================

import * as THREE from 'three';
import { COLORS, DUSK } from './config.ts';
import { clamp, lerp } from './rng.ts';

interface DuskStop {
  t: number; zenith: number; horizon: number; sun: number;
  hemiSky: number; hemiGround: number; fog: number;
  sunI: number; hemiI: number; fogD: number;
}

export class Sky {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fog: THREE.FogExp2;

  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private starsMat: THREE.PointsMaterial;
  private moon: THREE.Sprite;
  private moonMat: THREE.SpriteMaterial;

  /** 0 = golden hour … 1 = full dark */
  darkness = 0;
  /** true once the sun is below the horizon */
  isNight = false;

  private ca = new THREE.Color();
  private cb = new THREE.Color();
  private sunDirWorld = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene) {
    this.fog = new THREE.FogExp2(0xe8c99a, 0.0035);
    scene.fog = this.fog;

    this.sun = new THREE.DirectionalLight(0xffdca8, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55;
    sc.near = 8; sc.far = 220;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.35;
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xcfe0ee, 0x8a7a52, 0.75);
    this.group.add(this.hemi);

    // gradient dome
    this.domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        zenith: { value: new THREE.Color(0x3f6e9e) },
        horizon: { value: new THREE.Color(0xffd9a0) },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color(0xffdca8) },
        sunGlow: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_Position.z = gl_Position.w * 0.99999; // pin to far plane
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform vec3 zenith;
        uniform vec3 horizon;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        uniform float sunGlow;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(horizon, zenith, pow(h, 0.58));
          float s = max(dot(d, sunDir), 0.0);
          col += sunColor * pow(s, 220.0) * sunGlow * 1.6;
          col += sunColor * pow(s, 7.0) * sunGlow * 0.30;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 28, 16), this.domeMat);
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // stars
    const starCount = 420;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(1 - v * 0.92); // bias upward
      const r = 840;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi) * 0.9 + 30;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starsMat = new THREE.PointsMaterial({
      color: 0xdfe6ff,
      size: 2.4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(starGeo, this.starsMat);
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    // moon — soft radial sprite
    const cnv = document.createElement('canvas');
    cnv.width = cnv.height = 128;
    const ctx = cnv.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(238, 242, 255, 1)');
    grad.addColorStop(0.32, 'rgba(220, 228, 252, 0.95)');
    grad.addColorStop(0.38, 'rgba(190, 202, 238, 0.32)');
    grad.addColorStop(1, 'rgba(170, 185, 230, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const moonTex = new THREE.CanvasTexture(cnv);
    this.moonMat = new THREE.SpriteMaterial({
      map: moonTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.moon = new THREE.Sprite(this.moonMat);
    this.moon.scale.set(120, 120, 1);
    this.group.add(this.moon);

    scene.add(this.group);
  }

  private stopLerp(t: number): DuskStop {
    const stops = COLORS.duskStops;
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i].t && t <= stops[i + 1].t) {
        a = stops[i];
        b = stops[i + 1];
        break;
      }
    }
    const f = a.t === b.t ? 0 : (t - a.t) / (b.t - a.t);
    const mix = (ka: number, kb: number) => lerp(ka, kb, f);
    return {
      t,
      zenith: this.mixHex(a.zenith, b.zenith, f),
      horizon: this.mixHex(a.horizon, b.horizon, f),
      sun: this.mixHex(a.sun, b.sun, f),
      hemiSky: this.mixHex(a.hemiSky, b.hemiSky, f),
      hemiGround: this.mixHex(a.hemiGround, b.hemiGround, f),
      fog: this.mixHex(a.fog, b.fog, f),
      sunI: mix(a.sunI, b.sunI),
      hemiI: mix(a.hemiI, b.hemiI),
      fogD: mix(a.fogD, b.fogD),
    };
  }

  private mixHex(a: number, b: number, f: number): number {
    this.ca.setHex(a);
    this.cb.setHex(b);
    this.ca.lerp(this.cb, f);
    return this.ca.getHex();
  }

  /** elapsedRun — seconds since the run began */
  update(elapsedRun: number, focus: THREE.Vector3, camPos: THREE.Vector3): void {
    const t = clamp(elapsedRun / DUSK.duration, 0, 1);
    this.darkness = t;
    const s = this.stopLerp(t);

    // sun path: starts 24° up in the west, sets; moon takes over
    const sunElev = lerp(0.42, -0.24, t); // radians
    this.isNight = sunElev < 0.02;
    const azim = lerp(-2.25, -2.62, t); // west-southwest drift

    if (!this.isNight) {
      this.sunDirWorld.set(
        Math.cos(azim) * Math.cos(sunElev),
        Math.sin(sunElev),
        Math.sin(azim) * Math.cos(sunElev),
      );
      this.sun.color.setHex(s.sun);
      this.sun.intensity = Math.max(s.sunI, 0.05);
    } else {
      // moonlight — rises opposite the sunset
      const nt = clamp((t - 0.62) / 0.38, 0, 1);
      const moonElev = lerp(0.18, 0.6, nt);
      const moonAzim = 0.7;
      this.sunDirWorld.set(
        Math.cos(moonAzim) * Math.cos(moonElev),
        Math.sin(moonElev),
        Math.sin(moonAzim) * Math.cos(moonElev),
      );
      this.sun.color.setHex(COLORS.moon);
      this.sun.intensity = lerp(0.5, 0.85, nt);
    }

    // position shadow light around the focus point (the dog)
    const dist = 130;
    this.sun.position.set(
      focus.x + this.sunDirWorld.x * dist,
      focus.y + Math.max(this.sunDirWorld.y, 0.12) * dist,
      focus.z + this.sunDirWorld.z * dist,
    );
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();

    this.hemi.color.setHex(s.hemiSky);
    this.hemi.groundColor.setHex(s.hemiGround);
    this.hemi.intensity = s.hemiI;

    this.fog.color.setHex(s.fog);
    this.fog.density = s.fogD;

    const u = this.domeMat.uniforms;
    (u.zenith.value as THREE.Color).setHex(s.zenith);
    (u.horizon.value as THREE.Color).setHex(s.horizon);
    (u.sunColor.value as THREE.Color).setHex(s.sun);
    (u.sunDir.value as THREE.Vector3).copy(this.sunDirWorld).normalize();
    u.sunGlow.value = this.isNight ? 0 : lerp(1.15, 0.4, t);

    this.dome.position.copy(camPos);
    this.stars.position.set(camPos.x, 0, camPos.z);
    this.starsMat.opacity = clamp((t - 0.52) / 0.3, 0, 1) * 0.9;

    // moon sprite mirrors the moon light direction
    const mnt = clamp((t - 0.55) / 0.4, 0, 1);
    this.moonMat.opacity = mnt * 0.95;
    const mElev = lerp(0.14, 0.58, mnt);
    this.moon.position.set(
      camPos.x + Math.cos(0.7) * Math.cos(mElev) * 780,
      Math.sin(mElev) * 780,
      camPos.z + Math.sin(0.7) * Math.cos(mElev) * 780,
    );
  }
}
