// ============================================================
// Everything that dresses the vale: instanced pines, dry grass,
// rocks, waymark cairns, fences and gates, the bridge, the farm,
// the drystone fold, lanterns (gameplay-relevant safety lights),
// and fireflies. All procedural; colliders registered here.
// ============================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { World } from './world.ts';
import { WORLD, FOLD, COLORS } from './config.ts';
import { mulberry32, clamp } from './rng.ts';

export interface SceneryHandles {
  group: THREE.Group;
  lanternLights: THREE.PointLight[];
  lanternGlows: THREE.Sprite[];
  foldGateBar: THREE.Object3D;
  windowMats: THREE.MeshBasicMaterial[];
  grassUniforms: { uTime: { value: number } };
  fireflies: THREE.Points;
  firefliesMat: THREE.PointsMaterial;
  fireflyBase: Float32Array;
}

function paint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function glowTexture(): THREE.CanvasTexture {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 64;
  const ctx = cnv.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255, 196, 110, 0.9)');
  g.addColorStop(0.4, 'rgba(255, 170, 80, 0.35)');
  g.addColorStop(1, 'rgba(255, 150, 60, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cnv);
}

export function buildScenery(world: World): SceneryHandles {
  const group = new THREE.Group();
  group.name = 'scenery';
  const rng = mulberry32(20260704);
  const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  // keep the opening moments unobstructed
  const clearings: Array<{ x: number; z: number; r: number }> = [
    { x: world.dogStart.x, z: world.dogStart.z, r: 13 },
    { x: world.flockStart.x, z: world.flockStart.z, r: 13 },
    ...world.strayStarts.map((s) => ({ x: s.x, z: s.z, r: 7 })),
  ];
  const inClearing = (x: number, z: number): boolean =>
    clearings.some((c) => (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < c.r * c.r);

  // ---------------- pines ----------------
  const trunkGeo = paint(new THREE.CylinderGeometry(0.16, 0.3, 1.6, 5), 0x4a3a2a).translate(0, 0.8, 0);
  const cone1 = paint(new THREE.ConeGeometry(1.5, 2.6, 6), 0x2c3d2a).translate(0, 2.4, 0);
  const cone2 = paint(new THREE.ConeGeometry(1.05, 2.0, 6), 0x33472e).translate(0, 3.7, 0);
  const cone3 = paint(new THREE.ConeGeometry(0.62, 1.4, 5), 0x3a5233).translate(0, 4.8, 0);
  const pineGeo = mergeGeometries([trunkGeo, cone1, cone2, cone3], false)!;

  interface Placement { x: number; z: number; s: number; rot: number; tint: number }
  const pines: Placement[] = [];
  for (let z = WORLD.zEnd + 6; z < WORLD.zStart + 12; z += 3.4) {
    const cx = world.pathCX(z);
    const cw = world.corridorW(z);
    const inWood = z < -252 && z > -436;
    for (let tries = 0; tries < (inWood ? 7 : 4); tries++) {
      const side = rng() < 0.5 ? -1 : 1;
      const margin = WORLD.boundsMargin - 4;
      let off: number;
      if (inWood && rng() < 0.16) {
        off = side * (cw * (0.25 + rng() * 0.6)); // intruders inside the corridor
      } else {
        const edge = inWood ? 1.5 : 4 + rng() * 6;
        off = side * (cw + edge + Math.pow(rng(), 1.6) * margin * 0.8);
      }
      const x = cx + off + (rng() - 0.5) * 3;
      const z2 = z + (rng() - 0.5) * 3.2;
      const d = Math.abs(x - cx) - cw;
      const density = inWood ? 0.86 : clamp(0.16 + d * 0.02, 0.1, 0.62);
      if (rng() > density) continue;
      const s = world.sample(x, z2);
      if (s.waterDepth > 0.05 || s.bog || s.onBridge) continue;
      if (inClearing(x, z2)) continue;
      // keep the farm yard and fold clear
      if (z2 < -498 && Math.abs(x - world.foldCenter.x) < 42) continue;
      // keep gate openings clear
      let nearGate = false;
      for (const g of world.gates) {
        if (Math.abs(z2 - g.z) < 5 && x > g.openLeft - 6 && x < g.openRight + 6) nearGate = true;
      }
      if (nearGate) continue;
      pines.push({ x, z: z2, s: 0.8 + rng() * 0.85, rot: rng() * Math.PI * 2, tint: 0.82 + rng() * 0.36 });
    }
  }

  const pineMesh = new THREE.InstancedMesh(pineGeo, flatMat, pines.length);
  pineMesh.castShadow = true;
  pineMesh.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const scl = new THREE.Vector3();
  const tint = new THREE.Color();
  pines.forEach((p, i) => {
    const y = world.heightAt(p.x, p.z);
    eul.set((rng() - 0.5) * 0.07, p.rot, (rng() - 0.5) * 0.07);
    quat.setFromEuler(eul);
    scl.set(p.s, p.s * (0.9 + rng() * 0.3), p.s);
    m4.compose(new THREE.Vector3(p.x, y - 0.1, p.z), quat, scl);
    pineMesh.setMatrixAt(i, m4);
    tint.setScalar(p.tint);
    pineMesh.setColorAt(i, tint);
    const d = Math.abs(p.x - world.pathCX(p.z)) - world.corridorW(p.z);
    if (d < 16) world.addCircle({ x: p.x, z: p.z, r: 0.4 * p.s + 0.15 });
  });
  if (pineMesh.instanceColor) pineMesh.instanceColor.needsUpdate = true;
  group.add(pineMesh);

  // ---------------- rocks ----------------
  const rockGeo = paint(new THREE.IcosahedronGeometry(0.8, 0), 0x767066);
  const rocks: Placement[] = [];
  for (let i = 0; i < 110; i++) {
    const z = WORLD.zEnd + 12 + rng() * (WORLD.zStart - WORLD.zEnd - 20);
    const cx = world.pathCX(z);
    const cw = world.corridorW(z);
    const off = (rng() - 0.5) * 2 * (cw + 18);
    const x = cx + off;
    if (Math.abs(off) < 3.5) continue; // keep the path clear
    const s = world.sample(x, z);
    if (s.waterDepth > 0.05 || s.onBridge) continue;
    if (inClearing(x, z)) continue;
    if (z < -500 && Math.abs(x - world.foldCenter.x) < 40) continue;
    rocks.push({ x, z, s: 0.35 + Math.pow(rng(), 1.7) * 1.7, rot: rng() * Math.PI * 2, tint: 0.8 + rng() * 0.35 });
  }
  const rockMesh = new THREE.InstancedMesh(rockGeo, flatMat, rocks.length);
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  rocks.forEach((p, i) => {
    const y = world.heightAt(p.x, p.z);
    eul.set(rng() * 0.6, p.rot, rng() * 0.6);
    quat.setFromEuler(eul);
    scl.set(p.s * (0.8 + rng() * 0.5), p.s * (0.5 + rng() * 0.4), p.s * (0.8 + rng() * 0.5));
    m4.compose(new THREE.Vector3(p.x, y + 0.05, p.z), quat, scl);
    rockMesh.setMatrixAt(i, m4);
    tint.setScalar(p.tint);
    rockMesh.setColorAt(i, tint);
    if (p.s > 0.75) world.addCircle({ x: p.x, z: p.z, r: p.s * 0.75 });
  });
  if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true;
  group.add(rockMesh);

  // ---------------- waymark cairns along the path ----------------
  const cairnGeo = mergeGeometries([
    paint(new THREE.IcosahedronGeometry(0.42, 0), 0x8a847a).translate(0, 0.3, 0),
    paint(new THREE.IcosahedronGeometry(0.3, 0), 0x9b948a).translate(0.05, 0.72, 0.02),
    paint(new THREE.IcosahedronGeometry(0.2, 0), 0xa8a296).translate(-0.03, 1.02, 0),
  ], false)!;
  const cairnZs = [-40, -150, -215, -290, -370, -465];
  const cairnMesh = new THREE.InstancedMesh(cairnGeo, flatMat, cairnZs.length);
  cairnMesh.castShadow = true;
  cairnZs.forEach((z, i) => {
    const x = world.pathCX(z) + 4.6;
    const y = world.heightAt(x, z);
    quat.setFromEuler(eul.set(0, rng() * Math.PI, 0));
    m4.compose(new THREE.Vector3(x, y, z), quat, scl.set(1, 1, 1));
    cairnMesh.setMatrixAt(i, m4);
    world.addCircle({ x, z, r: 0.5 });
  });
  group.add(cairnMesh);

  // ---------------- dry grass tufts ----------------
  // white vertex colors: the per-instance tint carries all the hue,
  // otherwise the two multiply and the tufts go muddy-dark
  const tuftPlane = new THREE.PlaneGeometry(0.6, 0.62, 1, 1).translate(0, 0.3, 0);
  const tuftGeo = mergeGeometries([
    paint(tuftPlane.clone(), 0xffffff),
    paint(tuftPlane.clone().rotateY(Math.PI / 2), 0xf2ecdc),
  ], false)!;
  const grassUniforms = { uTime: { value: 0 } };
  const grassMat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    alphaTest: 0,
  });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = grassUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float swayPhase = float(gl_InstanceID) * 1.37;
        transformed.x += sin(uTime * 1.5 + swayPhase) * transformed.y * 0.16;
        transformed.z += cos(uTime * 1.1 + swayPhase * 0.7) * transformed.y * 0.1;`,
      );
  };
  const tufts: Placement[] = [];
  for (let i = 0; i < 3400; i++) {
    const z = WORLD.zEnd + 12 + rng() * (WORLD.zStart + 4 - WORLD.zEnd - 16);
    const cx = world.pathCX(z);
    const cw = world.corridorW(z);
    const off = (rng() - 0.5) * 2 * (cw + 10);
    const x = cx + off + (rng() - 0.5) * 2;
    if (Math.abs(off) < 2.2 && rng() < 0.85) continue; // sparse on the worn path
    const s = world.sample(x, z);
    if (s.waterDepth > 0 || s.onBridge) continue;
    tufts.push({ x, z, s: 0.55 + rng() * 0.75, rot: rng() * Math.PI, tint: 0.75 + rng() * 0.5 });
  }
  const grassMesh = new THREE.InstancedMesh(tuftGeo, grassMat, tufts.length);
  grassMesh.receiveShadow = true;
  tufts.forEach((p, i) => {
    const y = world.heightAt(p.x, p.z);
    quat.setFromEuler(eul.set(0, p.rot, (rng() - 0.5) * 0.18));
    m4.compose(new THREE.Vector3(p.x, y - 0.04, p.z), quat, scl.set(p.s, p.s * (0.75 + rng() * 0.5), p.s));
    grassMesh.setMatrixAt(i, m4);
    tint.setHSL(0.115 + rng() * 0.04, 0.48, 0.42 + rng() * 0.16);
    grassMesh.setColorAt(i, tint);
  });
  if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
  group.add(grassMesh);

  // ---------------- fences at the waypoint gates ----------------
  const woodDark = 0x4c3b28;
  const woodLight = 0x5d4a33;
  const fenceParts: THREE.BufferGeometry[] = [];
  const postGeo = () => paint(new THREE.BoxGeometry(0.22, 1.25, 0.22), woodDark);
  const railGeo = (len: number) => paint(new THREE.BoxGeometry(len, 0.09, 0.07), woodLight);

  for (const g of world.gates) {
    const cw = world.corridorW(g.z);
    const cx = world.pathCX(g.z);
    const spans: Array<[number, number]> = [
      [cx - cw - 16, g.openLeft],
      [g.openRight, cx + cw + 16],
    ];
    for (const [xa, xb] of spans) {
      const len = xb - xa;
      const posts = Math.max(2, Math.round(len / 2.3));
      for (let i = 0; i <= posts; i++) {
        const x = xa + (len * i) / posts;
        const y = world.heightAt(x, g.z);
        fenceParts.push(postGeo().translate(x, y + 0.62, g.z));
      }
      for (let i = 0; i < posts; i++) {
        const x0 = xa + (len * i) / posts;
        const x1 = xa + (len * (i + 1)) / posts;
        const xm = (x0 + x1) / 2;
        const ym = world.heightAt(xm, g.z);
        for (const ry of [0.45, 0.95]) {
          fenceParts.push(railGeo(x1 - x0 + 0.1).translate(xm, ym + ry, g.z));
        }
      }
    }
    // taller gate posts at the opening
    for (const gx of [g.openLeft, g.openRight]) {
      const y = world.heightAt(gx, g.z);
      fenceParts.push(paint(new THREE.BoxGeometry(0.34, 2.6, 0.34), woodDark).translate(gx, y + 1.3, g.z));
    }
  }

  // ---------------- bridge ----------------
  {
    const bc = world.bridgeCenter;
    const deckY = bc.y;
    const halfLen = WORLD.riverHalf + 2.4;
    const planks = Math.round((halfLen * 2) / 0.55);
    for (let i = 0; i < planks; i++) {
      const z = bc.z - halfLen + (i + 0.5) * ((halfLen * 2) / planks);
      fenceParts.push(
        paint(new THREE.BoxGeometry(WORLD.bridgeHalf * 2 + 0.5, 0.12, 0.48), i % 2 ? woodLight : woodDark)
          .translate(bc.x, deckY - 0.05, z),
      );
    }
    // side beams + rails
    for (const side of [-1, 1]) {
      const x = bc.x + side * (WORLD.bridgeHalf + 0.12);
      fenceParts.push(paint(new THREE.BoxGeometry(0.18, 0.3, halfLen * 2 + 0.6), woodDark).translate(x, deckY - 0.1, bc.z));
      fenceParts.push(paint(new THREE.BoxGeometry(0.12, 0.1, halfLen * 2 + 0.4), woodLight).translate(x, deckY + 0.85, bc.z));
      for (let i = 0; i <= 6; i++) {
        const z = bc.z - halfLen + (i * halfLen * 2) / 6;
        fenceParts.push(paint(new THREE.BoxGeometry(0.1, 0.95, 0.1), woodDark).translate(x, deckY + 0.42, z));
      }
    }
  }

  // ---------------- the fold (drystone pen) + funnel walls ----------------
  const stoneParts: THREE.BufferGeometry[] = [];
  const stoneCols = [0x6f6a61, 0x7a746a, 0x655f57, 0x827b70];
  function drystone(ax: number, az: number, bx: number, bz: number): void {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.round(len / 0.85));
    const ang = Math.atan2(bz - az, bx - ax);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = ax + (bx - ax) * t + (rng() - 0.5) * 0.14;
      const z = az + (bz - az) * t + (rng() - 0.5) * 0.14;
      const y = world.heightAt(x, z);
      const rows = 3;
      for (let r = 0; r < rows; r++) {
        const g = paint(
          new THREE.BoxGeometry(0.95 + rng() * 0.3, 0.34 + rng() * 0.1, 0.55 + rng() * 0.18),
          stoneCols[Math.floor(rng() * stoneCols.length)],
        );
        g.rotateY(ang + (rng() - 0.5) * 0.14);
        g.translate(x + (rng() - 0.5) * 0.1, y + 0.2 + r * 0.34, z + (rng() - 0.5) * 0.1);
        stoneParts.push(g);
      }
    }
  }

  const fx = world.foldCenter.x;
  const fz = FOLD.z;
  const hw = FOLD.w / 2;
  const hd = FOLD.d / 2;
  const mouthZ = fz + hd;
  const gw = FOLD.gateWidth / 2;
  drystone(fx - hw, fz - hd, fx + hw, fz - hd);
  drystone(fx - hw, fz - hd, fx - hw, mouthZ);
  drystone(fx + hw, fz - hd, fx + hw, mouthZ);
  drystone(fx - hw, mouthZ, fx - gw, mouthZ);
  drystone(fx + gw, mouthZ, fx + hw, mouthZ);
  // funnel walls
  {
    const funnelStartZ = -498;
    const fcw = world.corridorW(funnelStartZ);
    const fcx = world.pathCX(funnelStartZ);
    drystone(fcx - fcw - 4, funnelStartZ, fx - gw - 3.5, mouthZ + 9);
    drystone(fcx + fcw + 4, funnelStartZ, fx + gw + 3.5, mouthZ + 9);
  }

  // fold gate posts + swinging bar
  for (const p of world.foldGatePosts) {
    fenceParts.push(paint(new THREE.BoxGeometry(0.36, 2.2, 0.36), woodDark).translate(p.x, p.y + 1.1, p.z));
  }
  const foldGateBar = new THREE.Group();
  {
    const barGeo = paint(new THREE.BoxGeometry(FOLD.gateWidth, 0.14, 0.1), woodLight).translate(FOLD.gateWidth / 2, 0, 0);
    const bar1 = new THREE.Mesh(barGeo, flatMat);
    bar1.position.y = 1.0;
    const bar2 = bar1.clone();
    bar2.position.y = 0.55;
    foldGateBar.add(bar1, bar2);
    const hinge = world.foldGatePosts[0];
    foldGateBar.position.set(hinge.x, hinge.y + 0.2, hinge.z);
    foldGateBar.rotation.y = Math.PI / 2 + 0.35; // open, swung up-valley
    foldGateBar.castShadow = true;
    bar1.castShadow = bar2.castShadow = true;
  }

  // ---------------- barn + cottage ----------------
  const windowMats: THREE.MeshBasicMaterial[] = [];
  {
    const bx = fx - 24;
    const bz = fz + 4;
    const by = world.heightAt(bx, bz);
    const barnBody = paint(new THREE.BoxGeometry(14, 5.2, 10), 0x6e3f2e).translate(bx, by + 2.6, bz);
    // prism roof
    const roof = new THREE.CylinderGeometry(0.5, 0.5, 14.8, 3, 1);
    roof.rotateZ(Math.PI / 2);
    roof.rotateX(Math.PI);
    const roofG = paint(roof, 0x3d3026);
    roofG.scale(1, 3.4, 11.6 / 1);
    roofG.translate(bx, by + 5.2, bz);
    const door = paint(new THREE.BoxGeometry(0.2, 3.4, 3.4), 0x4c3b28).translate(bx + 7, by + 1.7, bz);
    stoneParts.push(barnBody, roofG, door);

    const cx2 = fx + 20;
    const cz2 = fz - 2;
    const cy = world.heightAt(cx2, cz2);
    const cottage = paint(new THREE.BoxGeometry(8, 3.6, 6.4), 0x8a7f6c).translate(cx2, cy + 1.8, cz2);
    const cRoof = new THREE.CylinderGeometry(0.5, 0.5, 8.8, 3, 1);
    cRoof.rotateZ(Math.PI / 2);
    cRoof.rotateX(Math.PI);
    const cRoofG = paint(cRoof, 0x46372c);
    cRoofG.scale(1, 2.4, 7.4);
    cRoofG.translate(cx2, cy + 3.6, cz2);
    stoneParts.push(cottage, cRoofG);
    world.addCircle({ x: cx2, z: cz2, r: 4.6 });

    // warm windows (brighten at night)
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffc06a });
    windowMats.push(winMat);
    const win1 = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), winMat);
    win1.position.set(cx2 - 2, cy + 1.9, cz2 + 3.22);
    const win2 = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), winMat);
    win2.position.set(cx2 + 1.6, cy + 1.9, cz2 + 3.22);
    const barnWin = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.4), winMat);
    barnWin.position.set(bx + 7.11, by + 3.8, bz);
    barnWin.rotation.y = Math.PI / 2;
    group.add(win1, win2, barnWin);
  }

  // merge the static wood + stone
  const woodMesh = new THREE.Mesh(mergeGeometries(fenceParts, false)!, flatMat);
  woodMesh.castShadow = true;
  woodMesh.receiveShadow = true;
  group.add(woodMesh);
  const stoneMesh = new THREE.Mesh(mergeGeometries(stoneParts, false)!, flatMat);
  stoneMesh.castShadow = true;
  stoneMesh.receiveShadow = true;
  group.add(stoneMesh);
  group.add(foldGateBar);

  // ---------------- lanterns ----------------
  const lanternLights: THREE.PointLight[] = [];
  const lanternGlows: THREE.Sprite[] = [];
  const glowTex = glowTexture();
  const lanternParts: THREE.BufferGeometry[] = [];
  for (const l of world.lanterns) {
    const groundY = world.heightAt(l.x, l.z);
    lanternParts.push(paint(new THREE.CylinderGeometry(0.07, 0.1, l.y - groundY + 0.3, 5), 0x3a3128).translate(l.x, (l.y + groundY) / 2, l.z));
    lanternParts.push(paint(new THREE.BoxGeometry(0.42, 0.5, 0.42), 0x2e2620).translate(l.x, l.y, l.z));
    lanternParts.push(paint(new THREE.BoxGeometry(0.3, 0.34, 0.3), 0xffb45e).translate(l.x, l.y - 0.02, l.z));
    const light = new THREE.PointLight(COLORS.lantern, 0, 30, 2);
    light.position.set(l.x, l.y + 0.2, l.z);
    group.add(light);
    lanternLights.push(light);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xffb45e,
    }));
    spr.position.copy(light.position);
    spr.scale.set(5, 5, 1);
    group.add(spr);
    lanternGlows.push(spr);
  }
  const lanternMesh = new THREE.Mesh(mergeGeometries(lanternParts, false)!, flatMat);
  lanternMesh.castShadow = true;
  group.add(lanternMesh);

  // ---------------- fireflies ----------------
  const fireflyCount = 130;
  const fireflyBase = new Float32Array(fireflyCount * 3);
  for (let i = 0; i < fireflyCount; i++) {
    const z = -30 - rng() * 480;
    const cx = world.pathCX(z);
    const x = cx + (rng() - 0.5) * (world.corridorW(z) * 2 + 14);
    fireflyBase[i * 3] = x;
    fireflyBase[i * 3 + 1] = world.heightAt(x, z) + 0.5 + rng() * 1.8;
    fireflyBase[i * 3 + 2] = z;
  }
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(fireflyBase.slice(), 3));
  const firefliesMat = new THREE.PointsMaterial({
    color: 0xffd98a,
    size: 0.16,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const fireflies = new THREE.Points(ffGeo, firefliesMat);
  fireflies.frustumCulled = false;
  group.add(fireflies);

  return {
    group,
    lanternLights,
    lanternGlows,
    foldGateBar,
    windowMats,
    grassUniforms,
    fireflies,
    firefliesMat,
    fireflyBase,
  };
}

/** per-frame scenery animation */
export function updateScenery(
  h: SceneryHandles,
  time: number,
  darkness: number,
  camPos: THREE.Vector3,
): void {
  h.grassUniforms.uTime.value = time;

  // lanterns wake as the light dies
  const lit = clamp((darkness - 0.28) / 0.2, 0, 1);
  for (let i = 0; i < h.lanternLights.length; i++) {
    const l = h.lanternLights[i];
    const flick = 1 + Math.sin(time * 9 + i * 2.1) * 0.05 + Math.sin(time * 23 + i) * 0.03;
    const nearCam = l.position.distanceToSquared(camPos) < 150 * 150;
    l.intensity = nearCam ? lit * 26 * flick : 0;
    h.lanternGlows[i].material.opacity = lit * 0.55 * flick;
  }
  for (const w of h.windowMats) {
    const c = 0.35 + lit * 0.65;
    w.color.setRGB(1 * c, 0.75 * c, 0.42 * c);
  }

  // fireflies drift and pulse in the blue hour
  const ffOpacity = Math.sin(Math.PI * clamp((darkness - 0.3) / 0.7, 0, 1)) * 0.95;
  h.firefliesMat.opacity = ffOpacity;
  if (ffOpacity > 0.01) {
    const attr = h.fireflies.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const p = i / 3;
      arr[i] = h.fireflyBase[i] + Math.sin(time * 0.7 + p * 1.3) * 1.4;
      arr[i + 1] = h.fireflyBase[i + 1] + Math.sin(time * 1.1 + p * 2.7) * 0.5;
      arr[i + 2] = h.fireflyBase[i + 2] + Math.cos(time * 0.5 + p * 0.9) * 1.4;
    }
    attr.needsUpdate = true;
  }
}
