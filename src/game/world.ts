// ============================================================
// The Vale — heightfield terrain, river, bridge, ford, bogs,
// static collision, and the annotated layout (gates, fold, farm)
// that the rest of the game reads from.
// ============================================================

import * as THREE from 'three';
import { WORLD, GATES, FOLD } from './config.ts';
import { fbm, clamp, lerp, smoothstep } from './rng.ts';

export interface WorldSample {
  h: number;
  waterDepth: number; // > 0 → standing in water
  deepWater: boolean; // sheep refuse to enter
  bog: boolean;
  onBridge: boolean;
}

export interface CircleCollider { x: number; z: number; r: number }
export interface SegmentCollider { ax: number; az: number; bx: number; bz: number; r: number }

export interface GateInfo {
  z: number;
  openLeft: number; // x of left edge of opening
  openRight: number;
  center: THREE.Vector3;
  lantern: THREE.Vector3;
}

const BOGS = [
  { dx: 19, z: -158, rx: 11, rz: 7 },
  { dx: -15, z: -332, rx: 12, rz: 8 },
];

export class World {
  // heightfield
  readonly x0 = -WORLD.halfWidth - 4;
  readonly z0 = WORLD.zEnd - 14;
  readonly step = WORLD.gridStep;
  nx = 0;
  nz = 0;
  heights!: Float32Array;

  // colliders in a uniform grid
  private cellSize = 8;
  private circleCells = new Map<number, CircleCollider[]>();
  private segCells = new Map<number, SegmentCollider[]>();

  // layout annotations
  gates: GateInfo[] = [];
  lanterns: THREE.Vector3[] = []; // safety lights (wolves avoid, sheep calm)
  foldCenter = new THREE.Vector3();
  foldMouth = new THREE.Vector3(); // centre of pen opening
  foldGatePosts: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  bridgeCenter = new THREE.Vector3();
  fordCenter = new THREE.Vector3();
  dogStart = new THREE.Vector3();
  flockStart = new THREE.Vector3();
  strayStarts: THREE.Vector3[] = [];

  private riverCX = 0; // path centre x at the river
  private farmCX = 0;

  constructor() {
    this.riverCX = this.pathCX(WORLD.riverZ);
    this.farmCX = this.pathCX(FOLD.z);
    this.buildHeights();
    this.annotateLayout();
  }

  /** winding centre-line of the vale */
  pathCX(z: number): number {
    return 18 * Math.sin(z * 0.012 + 0.4) + 9 * Math.sin(z * 0.033 + 1.9);
  }

  /** corridor half-width at z */
  corridorW(z: number): number {
    const w = 24 + 7 * Math.sin(z * 0.017 + 0.8);
    return clamp(w * this.woodNarrow(z) * this.farmWiden(z), 12.5, 34);
  }

  /** 1 outside the pinewood, narrower deep inside it */
  private woodNarrow(z: number): number {
    const entering = 1 - smoothstep(-300, -258, z); // 0 above z=-258 → 1 below z=-300
    const leaving = smoothstep(-436, -404, z); // 1 above z=-404 → 0 below z=-436
    const inside = clamp(entering * leaving, 0, 1);
    return 1 - 0.38 * inside;
  }

  private farmWiden(z: number): number {
    const t = 1 - smoothstep(-500, -462, z); // 1 below -500
    return 1 + 0.28 * t;
  }

  private riverCZ(x: number): number {
    return WORLD.riverZ + WORLD.riverWiggle * Math.sin(x * 0.045 + 1.2);
  }

  /** terrain height before river carving / flattening */
  private rawH(x: number, z: number): number {
    const cx = this.pathCX(z);
    const cw = this.corridorW(z);
    let h = z * WORLD.descent;
    const d = Math.abs(x - cx) - cw;
    if (d > 0) {
      h += Math.min(WORLD.hillCap, Math.pow(d, WORLD.hillPow) * WORLD.hillScale);
    }
    h += fbm(x * 0.031, z * 0.031, 3) * (d > 0 ? 2.6 : 1.05);
    h += fbm(x * 0.0085, z * 0.0085, 2) * 2.6;
    return h;
  }

  private waterSurfaceH(x: number): number {
    return this.rawH(x, this.riverCZ(x)) - 0.5;
  }

  private carveDepth(x: number, z: number): number {
    const rcz = this.riverCZ(x);
    const dz = Math.abs(z - rcz);
    if (dz >= WORLD.riverHalf) return 0;
    const t = 1 - (dz / WORLD.riverHalf) * (dz / WORLD.riverHalf);
    const fordC = this.riverCX + WORLD.fordX;
    const fordT = 1 - smoothstep(WORLD.fordHalf * 0.55, WORLD.fordHalf, Math.abs(x - fordC));
    const depth = lerp(WORLD.riverDepth, WORLD.fordDepth, fordT);
    return depth * Math.pow(t, 1.15);
  }

  private bridgeRect(x: number, z: number): boolean {
    const bx = this.riverCX + WORLD.bridgeX;
    const rcz = this.riverCZ(bx);
    return Math.abs(x - bx) < WORLD.bridgeHalf && Math.abs(z - rcz) < WORLD.riverHalf + 2.4;
  }

  bridgeDeckH(): number {
    const bx = this.riverCX + WORLD.bridgeX;
    const rcz = this.riverCZ(bx);
    const a = this.rawH(bx, rcz - WORLD.riverHalf - 2.5);
    const b = this.rawH(bx, rcz + WORLD.riverHalf + 2.5);
    return Math.max(a, b) + 0.32;
  }

  /** signed distance in z from the river centre line */
  riverDist(x: number, z: number): number {
    return z - this.riverCZ(x);
  }

  bogFactor(x: number, z: number): number {
    let f = 0;
    for (const b of BOGS) {
      const bx = this.pathCX(b.z) + b.dx;
      const dx = (x - bx) / b.rx;
      const dz = (z - b.z) / b.rz;
      const d = dx * dx + dz * dz;
      if (d < 1) f = Math.max(f, 1 - smoothstep(0.55, 1, d));
    }
    return f;
  }

  /** the authored ground height (with river, bridge, farm flattening) */
  private groundH(x: number, z: number): number {
    let h = this.rawH(x, z) - this.carveDepth(x, z);
    h -= this.bogFactor(x, z) * 0.3;
    // flatten the farm yard + fold
    const fx = (x - this.farmCX) / 42;
    const fz = (z - (FOLD.z + 6)) / 40;
    const ft = 1 - smoothstep(0.55, 1, fx * fx + fz * fz);
    if (ft > 0) h = lerp(h, FOLD.z * WORLD.descent + 0.4, ft * 0.92);
    // flatten the start knoll
    const sx = (x - this.pathCX(30)) / 26;
    const sz = (z - 30) / 22;
    const st = 1 - smoothstep(0.5, 1, sx * sx + sz * sz);
    if (st > 0) h = lerp(h, 30 * WORLD.descent + 0.6, st * 0.8);
    if (this.bridgeRect(x, z)) h = Math.max(h, this.bridgeDeckH());
    return h;
  }

  private buildHeights(): void {
    this.nx = Math.ceil((WORLD.halfWidth * 2 + 8) / this.step) + 1;
    this.nz = Math.ceil((WORLD.zStart + 18 - this.z0) / this.step) + 1;
    this.heights = new Float32Array(this.nx * this.nz);
    for (let iz = 0; iz < this.nz; iz++) {
      const z = this.z0 + iz * this.step;
      for (let ix = 0; ix < this.nx; ix++) {
        const x = this.x0 + ix * this.step;
        this.heights[iz * this.nx + ix] = this.groundH(x, z);
      }
    }
  }

  heightAt(x: number, z: number): number {
    const gx = clamp((x - this.x0) / this.step, 0, this.nx - 1.001);
    const gz = clamp((z - this.z0) / this.step, 0, this.nz - 1.001);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const i = iz * this.nx + ix;
    const a = this.heights[i];
    const b = this.heights[i + 1];
    const c = this.heights[i + this.nx];
    const d = this.heights[i + this.nx + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }

  sample(x: number, z: number): WorldSample {
    const h = this.heightAt(x, z);
    const onBridge = this.bridgeRect(x, z) && h >= this.bridgeDeckH() - 0.05;
    let waterDepth = 0;
    let deepWater = false;
    if (!onBridge) {
      const rcz = this.riverCZ(x);
      if (Math.abs(z - rcz) < WORLD.riverHalf + 1) {
        const w = this.waterSurfaceH(x);
        if (h < w) {
          waterDepth = w - h;
          deepWater = waterDepth > 0.62;
        }
      }
    }
    const bog = !onBridge && this.bogFactor(x, z) > 0.45;
    return { h, waterDepth, deepWater, bog, onBridge };
  }

  slopeAt(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const e = 0.9;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
  }

  // ---------- colliders ----------

  private cellKey(cx: number, cz: number): number {
    return (cx + 512) * 4096 + (cz + 2048);
  }

  addCircle(c: CircleCollider): void {
    const cx = Math.floor(c.x / this.cellSize);
    const cz = Math.floor(c.z / this.cellSize);
    const reach = Math.ceil((c.r + 1.2) / this.cellSize);
    for (let ix = cx - reach; ix <= cx + reach; ix++) {
      for (let iz = cz - reach; iz <= cz + reach; iz++) {
        const k = this.cellKey(ix, iz);
        let arr = this.circleCells.get(k);
        if (!arr) { arr = []; this.circleCells.set(k, arr); }
        arr.push(c);
      }
    }
  }

  addSegment(s: SegmentCollider): void {
    const minX = Math.min(s.ax, s.bx) - s.r - 1.2;
    const maxX = Math.max(s.ax, s.bx) + s.r + 1.2;
    const minZ = Math.min(s.az, s.bz) - s.r - 1.2;
    const maxZ = Math.max(s.az, s.bz) + s.r + 1.2;
    for (let ix = Math.floor(minX / this.cellSize); ix <= Math.floor(maxX / this.cellSize); ix++) {
      for (let iz = Math.floor(minZ / this.cellSize); iz <= Math.floor(maxZ / this.cellSize); iz++) {
        const k = this.cellKey(ix, iz);
        let arr = this.segCells.get(k);
        if (!arr) { arr = []; this.segCells.set(k, arr); }
        arr.push(s);
      }
    }
  }

  /**
   * Push a moving circle out of static geometry. Mutates pos (x/z only).
   * If `pushOut` is given, the accumulated push direction is written to it
   * so callers can cancel velocity into the surface (slide, don't stall).
   * Returns true if a collision was resolved.
   */
  resolveCircle(pos: THREE.Vector3, radius: number, pushOut?: THREE.Vector3): boolean {
    let hit = false;
    if (pushOut) pushOut.set(0, 0, 0);
    const k = this.cellKey(Math.floor(pos.x / this.cellSize), Math.floor(pos.z / this.cellSize));
    const circles = this.circleCells.get(k);
    if (circles) {
      for (const c of circles) {
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const rr = radius + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-9) {
          const d = Math.sqrt(d2);
          const push = (rr - d) / d;
          pos.x += dx * push;
          pos.z += dz * push;
          if (pushOut) { pushOut.x += dx * push; pushOut.z += dz * push; }
          hit = true;
        }
      }
    }
    const segs = this.segCells.get(k);
    if (segs) {
      for (const s of segs) {
        const abx = s.bx - s.ax;
        const abz = s.bz - s.az;
        const len2 = abx * abx + abz * abz;
        let t = len2 > 1e-9 ? ((pos.x - s.ax) * abx + (pos.z - s.az) * abz) / len2 : 0;
        t = clamp(t, 0, 1);
        const px = s.ax + abx * t;
        const pz = s.az + abz * t;
        const dx = pos.x - px;
        const dz = pos.z - pz;
        const rr = radius + s.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          const d = Math.max(Math.sqrt(d2), 1e-5);
          const push = (rr - d) / d;
          pos.x += dx * push;
          pos.z += dz * push;
          if (pushOut) { pushOut.x += dx * push; pushOut.z += dz * push; }
          hit = true;
        }
      }
    }
    // soft world bounds
    const cx = this.pathCX(pos.z);
    const bound = this.corridorW(pos.z) + WORLD.boundsMargin;
    if (pos.x - cx > bound) { pos.x = cx + bound; hit = true; }
    if (pos.x - cx < -bound) { pos.x = cx - bound; hit = true; }
    if (pos.z > WORLD.zStart + 10) { pos.z = WORLD.zStart + 10; hit = true; }
    if (pos.z < WORLD.zEnd + 6) { pos.z = WORLD.zEnd + 6; hit = true; }
    return hit;
  }

  /** distance to nearest lantern (safety light) */
  nearestLanternDist(x: number, z: number): number {
    let best = Infinity;
    for (const l of this.lanterns) {
      const dx = x - l.x;
      const dz = z - l.z;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  // ---------- layout ----------

  private annotateLayout(): void {
    // start positions on the high meadow
    const sx = this.pathCX(26);
    this.dogStart.set(sx - 3, 0, 34);
    this.flockStart.set(sx + 2, 0, 22);
    this.dogStart.y = this.heightAt(this.dogStart.x, this.dogStart.z);
    this.flockStart.y = this.heightAt(this.flockStart.x, this.flockStart.z);

    // strays — risk/reward detours
    const s1x = this.pathCX(-74) + this.corridorW(-74) + 9;
    const s2x = this.pathCX(-205) - this.corridorW(-205) - 7;
    const s3x = this.pathCX(-352) + this.corridorW(-352) + 8;
    this.strayStarts = [
      new THREE.Vector3(s1x, 0, -74),
      new THREE.Vector3(s2x, 0, -205),
      new THREE.Vector3(s3x, 0, -352),
    ];
    for (const s of this.strayStarts) s.y = this.heightAt(s.x, s.z);

    // waypoint gates: fence lines with an opening on the path
    for (const g of GATES) {
      const cx = this.pathCX(g.z);
      const cw = this.corridorW(g.z);
      const openLeft = cx - g.width / 2;
      const openRight = cx + g.width / 2;
      const fenceR = 0.32;
      const reachL = cx - cw - 16;
      const reachR = cx + cw + 16;
      this.addSegment({ ax: reachL, az: g.z, bx: openLeft, bz: g.z, r: fenceR });
      this.addSegment({ ax: openRight, az: g.z, bx: reachR, bz: g.z, r: fenceR });
      const lantern = new THREE.Vector3(openRight + 0.6, 0, g.z);
      lantern.y = this.heightAt(lantern.x, lantern.z) + 2.6;
      this.lanterns.push(lantern);
      this.gates.push({
        z: g.z,
        openLeft,
        openRight,
        center: new THREE.Vector3(cx, this.heightAt(cx, g.z), g.z),
        lantern,
      });
    }

    // the fold (pen) — mouth faces up-valley (+z)
    const fx = this.farmCX;
    const fz = FOLD.z;
    const hw = FOLD.w / 2;
    const hd = FOLD.d / 2;
    this.foldCenter.set(fx, this.heightAt(fx, fz), fz);
    const mouthZ = fz + hd;
    this.foldMouth.set(fx, this.heightAt(fx, mouthZ), mouthZ);
    const wallR = 0.38;
    // back wall
    this.addSegment({ ax: fx - hw, az: fz - hd, bx: fx + hw, bz: fz - hd, r: wallR });
    // side walls
    this.addSegment({ ax: fx - hw, az: fz - hd, bx: fx - hw, bz: mouthZ, r: wallR });
    this.addSegment({ ax: fx + hw, az: fz - hd, bx: fx + hw, bz: mouthZ, r: wallR });
    // front walls with the gate opening
    const gw = FOLD.gateWidth / 2;
    this.addSegment({ ax: fx - hw, az: mouthZ, bx: fx - gw, bz: mouthZ, r: wallR });
    this.addSegment({ ax: fx + gw, az: mouthZ, bx: fx + hw, bz: mouthZ, r: wallR });
    this.foldGatePosts = [
      new THREE.Vector3(fx - gw, this.heightAt(fx - gw, mouthZ), mouthZ),
      new THREE.Vector3(fx + gw, this.heightAt(fx + gw, mouthZ), mouthZ),
    ];
    const penLantern = new THREE.Vector3(fx + gw + 0.8, 0, mouthZ + 0.4);
    penLantern.y = this.heightAt(penLantern.x, penLantern.z) + 2.7;
    this.lanterns.push(penLantern);

    // funnel walls guiding the final drive into the yard
    const funnelStartZ = -498;
    const fcw = this.corridorW(funnelStartZ);
    const fcx = this.pathCX(funnelStartZ);
    this.addSegment({ ax: fcx - fcw - 4, az: funnelStartZ, bx: fx - gw - 3.5, bz: mouthZ + 9, r: 0.4 });
    this.addSegment({ ax: fcx + fcw + 4, az: funnelStartZ, bx: fx + gw + 3.5, bz: mouthZ + 9, r: 0.4 });

    // barn (solid box) west of the pen
    const bx = fx - 24;
    const bz = fz + 4;
    this.addSegment({ ax: bx - 7, az: bz - 5, bx: bx + 7, bz: bz - 5, r: 0.6 });
    this.addSegment({ ax: bx - 7, az: bz + 5, bx: bx + 7, bz: bz + 5, r: 0.6 });
    this.addSegment({ ax: bx - 7, az: bz - 5, bx: bx - 7, bz: bz + 5, r: 0.6 });
    this.addSegment({ ax: bx + 7, az: bz - 5, bx: bx + 7, bz: bz + 5, r: 0.6 });
    const farmLantern = new THREE.Vector3(bx + 8.5, 0, bz);
    farmLantern.y = this.heightAt(farmLantern.x, farmLantern.z) + 3;
    this.lanterns.push(farmLantern);

    // bridge + railings
    const bcx = this.riverCX + WORLD.bridgeX;
    const brcz = this.riverCZ(bcx);
    this.bridgeCenter.set(bcx, this.bridgeDeckH(), brcz);
    const railLen = WORLD.riverHalf + 2.4;
    this.addSegment({ ax: bcx - WORLD.bridgeHalf, az: brcz - railLen, bx: bcx - WORLD.bridgeHalf, bz: brcz + railLen, r: 0.22 });
    this.addSegment({ ax: bcx + WORLD.bridgeHalf, az: brcz - railLen, bx: bcx + WORLD.bridgeHalf, bz: brcz + railLen, r: 0.22 });

    const fordCX = this.riverCX + WORLD.fordX;
    this.fordCenter.set(fordCX, this.heightAt(fordCX, this.riverCZ(fordCX)), this.riverCZ(fordCX));
  }

  // ---------- terrain mesh ----------

  buildTerrainMesh(): THREE.Mesh {
    const nx = this.nx;
    const nz = this.nz;
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array(nx * nz * 3);
    const cols = new Float32Array(nx * nz * 3);
    const idx: number[] = [];

    const cGrassA = new THREE.Color(0xa3a058); // olive
    const cGrassB = new THREE.Color(0xc0a464); // dry ochre
    const cGrassC = new THREE.Color(0x7f8f4d); // greener hollows
    const cDirt = new THREE.Color(0xa08258);
    const cBog = new THREE.Color(0x585444);
    const cStone = new THREE.Color(0x8a847a);
    const cRock = new THREE.Color(0x7d776d);
    const cHigh = new THREE.Color(0x5d6140);
    const tmp = new THREE.Color();

    for (let iz = 0; iz < nz; iz++) {
      const z = this.z0 + iz * this.step;
      for (let ix = 0; ix < nx; ix++) {
        const x = this.x0 + ix * this.step;
        const i = iz * nx + ix;
        const h = this.heights[i];
        verts[i * 3] = x;
        verts[i * 3 + 1] = h;
        verts[i * 3 + 2] = z;

        // base grass with noise variation
        const n = fbm(x * 0.05 + 7, z * 0.05 - 3, 2) * 0.5 + 0.5;
        tmp.copy(cGrassA).lerp(cGrassB, n);
        const hollow = fbm(x * 0.02 - 11, z * 0.02 + 5, 2) * 0.5 + 0.5;
        tmp.lerp(cGrassC, hollow * 0.45);

        const cx = this.pathCX(z);
        const dPath = Math.abs(x - cx);
        // worn path
        const pathT = 1 - smoothstep(1.1, 3.0, dPath + fbm(x * 0.11, z * 0.11, 2) * 1.1);
        if (pathT > 0) tmp.lerp(cDirt, pathT * 0.7);

        // heights fade toward dark scrub
        const d = dPath - this.corridorW(z);
        if (d > 0) tmp.lerp(cHigh, clamp(d / 26, 0, 0.85));

        // slope → rock
        const e = this.step;
        const hx = (this.heights[iz * nx + Math.min(ix + 1, nx - 1)] - this.heights[iz * nx + Math.max(ix - 1, 0)]) / (2 * e);
        const hz2 = (this.heights[Math.min(iz + 1, nz - 1) * nx + ix] - this.heights[Math.max(iz - 1, 0) * nx + ix]) / (2 * e);
        const steep = clamp(Math.sqrt(hx * hx + hz2 * hz2) - 0.55, 0, 1.2);
        if (steep > 0) tmp.lerp(cRock, clamp(steep, 0, 0.8));

        // riverbed
        const carve = this.carveDepth(x, z);
        if (carve > 0.05) tmp.lerp(cStone, clamp(carve / WORLD.riverDepth + 0.25, 0, 0.95));

        // bog
        const bogF = this.bogFactor(x, z);
        if (bogF > 0.05) tmp.lerp(cBog, bogF * 0.9);

        cols[i * 3] = tmp.r;
        cols[i * 3 + 1] = tmp.g;
        cols[i * 3 + 2] = tmp.b;
      }
    }

    for (let iz = 0; iz < nz - 1; iz++) {
      for (let ix = 0; ix < nx - 1; ix++) {
        const a = iz * nx + ix;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        // alternate diagonal for a better faceted look
        if ((ix + iz) % 2 === 0) {
          idx.push(a, c, b, b, c, d);
        } else {
          idx.push(a, c, d, a, d, b);
        }
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  buildWaterMesh(): THREE.Mesh {
    const xs: number[] = [];
    for (let x = this.x0; x <= this.x0 + (this.nx - 1) * this.step; x += this.step * 2) xs.push(x);
    const verts: number[] = [];
    const idx: number[] = [];
    const wHalf = WORLD.riverHalf * 1.25;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i];
      const rcz = this.riverCZ(x);
      const w = this.waterSurfaceH(x) + 0.04;
      verts.push(x, w, rcz - wHalf, x, w, rcz + wHalf);
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({
      color: 0x39566e,
      transparent: true,
      opacity: 0.82,
      emissive: 0x16222e,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'water';
    return mesh;
  }
}
