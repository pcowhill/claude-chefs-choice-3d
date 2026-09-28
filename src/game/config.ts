// ============================================================
// GLOAMING — central tuning table.
// Every gameplay-feel constant lives here so balance passes
// touch one file.
// ============================================================

export const WORLD = {
  // The vale runs from zStart (high meadow) down to zEnd (the farm).
  zStart: 48,
  zEnd: -590,
  halfWidth: 110, // playable strip half-width in x
  gridStep: 2, // heightfield resolution (m)
  descent: 0.085, // metres of drop per metre of -z... h = z * descent
  hillPow: 1.35,
  hillScale: 0.22,
  hillCap: 26,

  riverZ: -188, // river crossing centre
  riverWiggle: 7,
  riverHalf: 6.5, // half-width of the cut
  riverDepth: 2.4,
  fordX: 16, // offset from path centre at river
  fordHalf: 9,
  fordDepth: 0.85,
  bridgeX: -10, // offset from path centre at river
  bridgeHalf: 2.1, // half width of deck (x)

  boundsMargin: 46, // dog clamp beyond corridor
};

export const ZONES = [
  { num: 'I', name: 'The High Meadow', zMin: -112, zMax: 999 },
  { num: 'II', name: 'The Ford', zMin: -248, zMax: -112 },
  { num: 'III', name: 'The Pinewood', zMin: -430, zMax: -248 },
  { num: 'IV', name: 'The Last Field', zMin: -9999, zMax: -430 },
];

// Waypoint gates (fence lines with an opening the flock must pass)
export const GATES = [
  { z: -112, width: 10 },
  { z: -248, width: 9 },
  { z: -430, width: 9 },
];

export const FOLD = {
  z: -548, // pen centre z
  w: 20, // pen inner width (x)
  d: 15, // pen inner depth (z)
  gateWidth: 7.5,
};

export const DOG = {
  radius: 0.55,
  walkSpeed: 7.0,
  sprintSpeed: 10.6,
  eyeSpeed: 2.3,
  accel: 34,
  decel: 26,
  turnRate: 11.5, // facing lerp rate
  staminaMax: 4.4, // seconds of sprint
  staminaRegen: 1.25, // per second
  staminaRegenDelay: 0.7,
  swimFactor: 0.42,
  bogFactor: 0.6,

  barkCooldown: 2.4,
  barkRadius: 15,
  barkPush: 8.5,
  barkFear: 0.34,
  barkWolfRadius: 26,

  whistleCooldown: 7.0,
  whistleMinDist: 20, // sheep further than this get gathered
  whistleDuration: 2.6,
  whistlePull: 4.2,
  whistleFear: 0.04,

  eyeCosHalfAngle: Math.cos((30 * Math.PI) / 180),
  eyeRange: 21,
  eyeWolfRange: 27,
  eyePush: 2.6,
  eyeFearPerSec: 0.012,
  eyeBlend: 0.5, // 0 = push radially from dog, 1 = push along dog facing
};

export const SHEEP = {
  count: 10,
  strayCount: 3,
  radius: 0.62,

  // movement
  baseSpeed: 1.7,
  fearSpeed: 4.5, // added at fear = 1  (max ~6.2, dog walk 7)
  accel: 11,
  drag: 2.6,

  // boids
  sepRadius: 1.9,
  sepForce: 9.0,
  cohRadius: 12,
  cohForce: 1.15,
  alignRadius: 7.5,
  alignForce: 1.15, // strong: pressure at the rear propagates through the flock
  neighborCap: 7,

  // dog pressure
  pressureBase: 7.0, // radius at dog standstill
  pressureSpeedScale: 0.55, // + dog speed * this
  pressureForce: 6.2,
  startleFear: 0.2, // fear floor when the dog steps close (above calmThreshold: heads up, hooves ready)

  wolfFleeRadius: 13,
  wolfFleeForce: 10.5,
  wolfFearPerSec: 0.5,

  // fear
  fearDecay: 0.045, // per second
  panicThreshold: 0.62,
  calmThreshold: 0.16,
  proximityFearPerSec: 0.15, // scaled by dog speed inside the pressure radius
  lanternCalmBoost: 3.0, // fear decay multiplier near lanterns

  grazeWander: 0.5,
  hazardLookahead: 3.2,
  homeAttractRadius: 26, // within this of the fold mouth, slight pull inside
};

export const WOLF = {
  radius: 0.6,
  emergeDist: [30, 44] as const, // spawn distance from flock edge
  stalkRadius: 23,
  stalkSpeed: 3.4,
  chargeSpeed: 9.2,
  chargeMaxDist: 30,
  dogSafeDist: 17, // won't charge a target this close to the dog
  grabDist: 1.1,
  dragSpeed: 3.1,
  fleeSpeed: 10.5,
  fleeTime: 2.8,
  repelDist: 7.5, // dog proximity that forces a flee
  lanternAvoid: 13,
  // director
  graceTime: 120, // no wolves in the first N seconds
  graceZ: -104, // ...or before the flock's lead crosses this line
  spawnBase: 34, // seconds between spawns at darkness 0 (post-grace)
  spawnMin: 11, // seconds between spawns at darkness 1
  maxAliveBase: 1,
  maxAliveNight: 4,
};

export const DUSK = {
  duration: 640, // seconds from first light to full dark
  nightWolfSurgeDelay: 45, // after full dark, spawn cadence tightens further
};

export const SCORING = {
  sheepHome: 120,
  strayBonus: 90, // extra on top of sheepHome for rescued strays
  wolfDrivenOff: 15,
  allHomeBonus: 400,
  daylightBonusPerSec: 1.6, // seconds of remaining dusk at win
};

export const RANKS: Array<{ min: number; title: string }> = [
  { min: 13, title: 'Legend of the Vale' },
  { min: 10, title: 'Trials Champion' },
  { min: 7, title: 'Good Dog' },
  { min: 4, title: 'Farm Hand' },
  { min: 1, title: 'Lost Pup' },
];

export const COLORS = {
  // dusk gradient keyframes: [t, sky zenith, sky horizon, sun, hemi sky, hemi ground, fog]
  duskStops: [
    { t: 0.0, zenith: 0x3f6e9e, horizon: 0xffd9a0, sun: 0xffdca8, hemiSky: 0xd8e4f0, hemiGround: 0x9a8a5e, fog: 0xe8c99a, sunI: 2.9, hemiI: 0.95, fogD: 0.0032 },
    { t: 0.3, zenith: 0x2f4b80, horizon: 0xff9e5a, sun: 0xffb070, hemiSky: 0xb2bede, hemiGround: 0x7d6c4c, fog: 0xd99a6d, sunI: 2.5, hemiI: 0.8, fogD: 0.0038 },
    { t: 0.55, zenith: 0x1d2b56, horizon: 0xd45f4e, sun: 0xff8452, hemiSky: 0x6d7cb4, hemiGround: 0x554a3c, fog: 0x8a5561, sunI: 1.5, hemiI: 0.62, fogD: 0.0048 },
    { t: 0.78, zenith: 0x131a3c, horizon: 0x51365e, sun: 0xb96a4a, hemiSky: 0x47548a, hemiGround: 0x35343c, fog: 0x3c3457, sunI: 0.62, hemiI: 0.52, fogD: 0.0058 },
    { t: 1.0, zenith: 0x0b0e24, horizon: 0x1c2140, sun: 0x8d9fd0, hemiSky: 0x3a4670, hemiGround: 0x242a3c, fog: 0x181c36, sunI: 0.78, hemiI: 0.48, fogD: 0.0066 },
  ],
  moon: 0xaebbde,
  lantern: 0xffb45e,
  sheepWool: [0xf2e8d2, 0xefe0c2, 0xe9dfd0, 0xf5ead6, 0xe5d6b8],
  blackSheep: 0x35302e,
  woolNight: 0x9aa4c0,
};

export const NAMES_POOL = [
  'Bramble', 'Willow', 'Nettle', 'Moss', 'Clover', 'Fern', 'Hazel',
  'Rowan', 'Thistle', 'Petal', 'Bracken', 'Dew', 'Ivy', 'Sorrel',
  'Tansy', 'Heather',
];

export const STORAGE_KEYS = {
  best: 'gloaming.best.v1',
  volume: 'gloaming.volume.v1',
  muted: 'gloaming.muted.v1',
  seenHowto: 'gloaming.howto.v1',
};
