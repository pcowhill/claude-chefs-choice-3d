// A competent robo-shepherd: stays up-valley of the rearmost sheep,
// strafes to centre on the flock, pulses pressure, and barks when the
// flock stalls. Used to prove the full journey is completable by a
// player of moderate skill. Reports flock progress over time.
import { chromium } from 'playwright-core';

const BASE = process.env.GAME_URL || 'http://127.0.0.1:5173';
const START_Z = process.env.START_Z ? Number(process.env.START_Z) : null; // teleport start
const DURATION_S = Number(process.env.DURATION_S || 120);
const OUT = process.env.OUT_DIR || '.';
const TAG = process.env.TAG || 'bot';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (x) => page.evaluate(x);

await page.goto(`${BASE}/?debug&lowfx`, { waitUntil: 'networkidle' });
await ev('localStorage.setItem("gloaming.howto.v1","1")');
await page.click('text=BEGIN THE RUN');
await sleep(1500);
if (START_Z !== null) {
  await ev(`window.__game.teleport(${START_Z})`);
  await sleep(500);
}

await ev(`window.__bot = () => {
  const g = window.__game.game;
  const flock = g.flock.agents.filter(a => a.state === 'flock');
  if (!flock.length) return null;
  let rearZ = -1e9, cx = 0, cz = 0;
  for (const s of flock) { if (s.pos.z > rearZ) rearZ = s.pos.z; cx += s.pos.x; cz += s.pos.z; }
  cx /= flock.length; cz /= flock.length;
  const counts = {}; for (const a of g.flock.agents) counts[a.state] = (counts[a.state]||0)+1;
  const posts = g.world.foldGatePosts;
  const dPost = Math.min(
    Math.hypot(g.dog.pos.x - posts[0].x, g.dog.pos.z - posts[0].z),
    Math.hypot(g.dog.pos.x - posts[1].x, g.dog.pos.z - posts[1].z),
  );
  return {
    dogX: g.dog.pos.x, dogZ: g.dog.pos.z,
    rearZ, cx, cz,
    frontZ: Math.min(...flock.map(s => s.pos.z)),
    meanFear: flock.reduce((a,s)=>a+s.fear,0)/flock.length,
    counts, gates: g.gateCounts,
    fordX: g.world.fordCenter.x, riverZ: g.world.fordCenter.z,
    dPost, inside: flock.filter(s => g.flock.insideFold(s)).length,
    state: window.__game.state(),
  };
}`);

const keys = { w: false, s: false, a: false, d: false };
async function setKey(k, want) {
  if (keys[k] === want) return;
  keys[k] = want;
  if (want) await page.keyboard.down(k);
  else await page.keyboard.up(k);
}

let lastBark = 0;
let lastReport = 0;
const t0 = Date.now();
console.log(`— shepherd bot for ${DURATION_S}s —`);
while ((Date.now() - t0) / 1000 < DURATION_S) {
  const b = await ev('window.__bot()');
  if (!b) { console.log('no flock left'); break; }
  const now = (Date.now() - t0) / 1000;
  if (b.state === 'end') { console.log(`RUN ENDED (end screen) at t+${now.toFixed(0)}s`); break; }

  // endgame: sheep are in the pen and we're near a gate post → shut it
  if (b.inside > 0 && b.dPost < 4) {
    for (const k of Object.keys(keys)) await setKey(k, false);
    console.log(`t+${now.toFixed(0)}s — ${b.inside} inside, at the post: shutting the gate`);
    await page.keyboard.press('f');
    await sleep(1200);
    continue;
  }
  // if most of the flock is penned, run for the post instead of herding
  if (b.inside > 0 && b.inside >= Math.ceil((b.counts.flock ?? 0) * 0.8)) {
    const px = -0.5; // approx post offset from fold centre; steer via dx below
    void px;
    const dxp = b.dogX - (b.cx);
    const dzp = b.dogZ - (b.cz + 9);
    await setKey('w', dzp > 1);
    await setKey('s', dzp < -2);
    await setKey('a', dxp > 1.5);
    await setKey('d', dxp < -1.5);
    await sleep(240);
    continue;
  }

  // hold position ~6m up-valley of the rearmost sheep. Near the river,
  // flank: stand on the side away from the ford so pressure pushes the
  // flock toward the crossing.
  const holdZ = b.rearZ + 6;
  const dz = b.dogZ - holdZ; // >0 → dog too far up-valley, push down (w)
  const nearRiver = b.cz < b.riverZ + 26 && b.cz > b.riverZ - 6;
  const flank = nearRiver ? -Math.sign(b.fordX - b.cx) * 4.5 : 0;
  const dx = b.dogX - (b.cx + flank);
  await setKey('w', dz > 0.6);
  await setKey('s', dz < -3.5); // overshot past the sheep — back up
  await setKey('a', dx > 2.2);
  await setKey('d', dx < -2.2);

  // if the flock is calm while we're roughly in position, bark them onward
  if (now - lastBark > 6 && b.meanFear < 0.35 && dz > -3.4 && dz < 7) {
    await page.keyboard.press('Space');
    lastBark = now;
  }

  if (now - lastReport >= 10) {
    lastReport = now;
    console.log(`t+${now.toFixed(0)}s front=${b.frontZ.toFixed(0)} rear=${b.rearZ.toFixed(0)} dog=${b.dogZ.toFixed(0)} fear=${b.meanFear.toFixed(2)} gates=${JSON.stringify(b.gates)} states=${JSON.stringify(b.counts)}`);
  }
  await sleep(240);
}
for (const k of Object.keys(keys)) await setKey(k, false);
await page.screenshot({ path: `${OUT}/${TAG}-final.png` });
const final = await ev('window.__bot()');
console.log('final:', JSON.stringify(final));
await browser.close();
console.log('bot done');
