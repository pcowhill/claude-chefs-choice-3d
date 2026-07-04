// Wolf cycle probe: force deep dusk, hold the dog away from the flock
// to open a hunting window, wait for a grab, then sprint back and bark
// to force the drop. Verifies grab → drag → rescue (or loss) end-to-end.
import { chromium } from 'playwright-core';

const BASE = process.env.GAME_URL || 'http://127.0.0.1:5173';
const OUT = process.env.OUT_DIR || '.';
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
await ev('window.__game.dark(0.85)');
await ev('window.__game.teleport(-330)');
await sleep(400);

await ev(`window.__w = () => {
  const g = window.__game.game;
  const counts = {}; for (const a of g.flock.agents) counts[a.state] = (counts[a.state]||0)+1;
  return {
    wolves: g.wolves.wolves.map(w => w.state),
    counts, driven: g.wolves.totalDrivenOff,
    dogZ: +g.dog.pos.z.toFixed(0),
  };
}`);

// retreat up-valley and stay there
console.log('— retreating to open a hunting window —');
await page.keyboard.down('s');
await sleep(4500);
await page.keyboard.up('s');

let grabbedAt = -1;
for (let i = 0; i < 90; i++) {
  await sleep(1000);
  const w = await ev('window.__w()');
  if (i % 6 === 0) console.log(`t+${i}s ${JSON.stringify(w)}`);
  if (w.counts.taken > 0) {
    grabbedAt = i;
    console.log(`GRAB at t+${i}s → sprinting to the rescue`);
    break;
  }
  if (w.counts.lost > 0) {
    console.log(`sheep LOST at t+${i}s (no rescue attempted — cycle confirmed through loss)`);
    break;
  }
}

if (grabbedAt >= 0) {
  await page.keyboard.down('w');
  await page.keyboard.down('Shift');
  let rescued = false;
  for (let i = 0; i < 20; i++) {
    await sleep(650);
    await page.keyboard.press('Space');
    const w = await ev('window.__w()');
    if (!w.counts.taken) {
      rescued = true;
      console.log(`OUTCOME after ${((i + 1) * 0.65).toFixed(1)}s: ${w.counts.lost ? 'sheep LOST to the pines' : 'sheep FREED'} — driven off total: ${w.driven}`);
      break;
    }
  }
  await page.keyboard.up('Shift');
  await page.keyboard.up('w');
  if (!rescued) console.log('still taken after pursuit window');
  console.log('final:', JSON.stringify(await ev('window.__w()')));
}
await page.screenshot({ path: `${OUT}/wolf-final.png` });
await browser.close();
console.log('wolf probe done');
