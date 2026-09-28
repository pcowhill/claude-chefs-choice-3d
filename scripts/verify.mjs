// GLOAMING automated verification: boots the game headless, walks
// title → howto → gameplay → dusk/wolves → pause → end → replay,
// screenshotting each state and collecting console errors.
import { chromium } from 'playwright-core';

const BASE = process.env.GAME_URL || 'http://127.0.0.1:5173';
const OUT = process.env.OUT_DIR || '.';
const errors = [];
const warnings = [];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (m.type() === 'warning') warnings.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const game = async (expr) => page.evaluate(`window.__game && (${expr})`);

console.log('1) loading title…');
// lowfx: shadows/AA off so the software rasterizer runs near real-time;
// visual-fidelity screenshots are taken separately without it
await page.goto(`${BASE}/?debug&lowfx`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await sleep(3500);
await shot('01-title');

// canvas non-blank check: sample pixels
const px = await page.evaluate(() => {
  const c = document.querySelector('#canvas-root canvas');
  if (!c) return { err: 'no canvas' };
  const gl2 = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl2) return { err: 'no ctx' };
  const buf = new Uint8Array(4 * 64);
  gl2.readPixels(gl2.drawingBufferWidth / 2 - 32, gl2.drawingBufferHeight / 2, 64, 1, gl2.RGBA, gl2.UNSIGNED_BYTE, buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i += 4) sum += buf[i] + buf[i + 1] + buf[i + 2];
  return { sum };
});
console.log('   canvas sample:', JSON.stringify(px));

console.log('2) begin → howto…');
await page.click('text=BEGIN THE RUN');
await sleep(900);
await shot('02-howto');

console.log('3) to the field…');
await page.click('text=TO THE FIELD');
await sleep(2500);
await shot('03-run-start');
console.log('   state:', await game('__game.state()'));
console.log('   dog:', JSON.stringify(await game('__game.dogInfo()')));

console.log('4) drive forward 5s — straight through the flock…');
const flockAtStart = await game('JSON.stringify(__game.flockInfo())');
await page.keyboard.down('w');
await sleep(2500);
await shot('04-driving');
await sleep(2500);
await page.keyboard.up('w');
console.log('   dog:', JSON.stringify(await game('__game.dogInfo()')));
{
  const b = JSON.parse(flockAtStart ?? '[]');
  const a = JSON.parse(await game('JSON.stringify(__game.flockInfo())') ?? '[]');
  const moved = a.filter((s, i) => b[i] && Math.hypot(s.x - b[i].x, s.z - b[i].z) > 1.2).length;
  const maxFear = Math.max(...a.map((s) => s.fear));
  console.log(`   flock scattered by the drive-through: ${moved}/${a.length} moved >1.2m, max fear ${maxFear}`);
}

console.log('5) bark…');
await page.keyboard.press('Space');
await sleep(350);
await shot('05-bark');

console.log('6) the eye…');
await page.keyboard.down('e');
await sleep(1200);
await shot('06-eye');
await page.keyboard.up('e');

console.log('7) sprint into flock, check flock reacts…');
const flockBefore = await game('JSON.stringify(__game.flockInfo())');
await page.keyboard.down('w');
await page.keyboard.down('Shift');
await sleep(2600);
await page.keyboard.up('Shift');
await page.keyboard.up('w');
const flockAfter = await game('JSON.stringify(__game.flockInfo())');
{
  const b = JSON.parse(flockBefore ?? '[]');
  const a = JSON.parse(flockAfter ?? '[]');
  const moved = a.filter((s, i) => b[i] && Math.hypot(s.x - b[i].x, s.z - b[i].z) > 1.2).length;
  const maxFear = Math.max(...a.map((s) => s.fear));
  console.log(`   sheep moved >1.2m: ${moved}/${a.length}, max fear: ${maxFear}`);
}
await shot('07-flock-pushed');

console.log('8) jump to dusk + wolves…');
await game('__game.dark(0.78)');
await game('__game.teleport(-300)');
await sleep(6000);
await shot('08-dusk-wolves');
console.log('   flock:', await game('JSON.stringify(__game.flockInfo().slice(0,4))'));

console.log('9) pause…');
await page.keyboard.press('Escape');
await sleep(700);
await shot('09-pause');

console.log('10) resume via button…');
await page.click('text=RESUME');
await sleep(800);

console.log('11) force win → end screen…');
await game('__game.win()');
await sleep(6500);
await shot('10-end-win');
console.log('   state:', await game('__game.state()'));

console.log('12) run again…');
await page.click('text=RUN AGAIN');
await sleep(2000);
await shot('11-replay');
console.log('   state:', await game('__game.state()'));

console.log('13) pause → quit to title…');
await page.keyboard.press('Escape');
await sleep(400);
await page.click('text=QUIT TO TITLE');
await sleep(1200);
await shot('12-title-again');

console.log('14) begin (howto skipped now) → force lose…');
await page.click('text=BEGIN THE RUN');
await sleep(1500);
console.log('   state after 2nd begin:', await game('__game.state()'));
await game('__game.lose()');
await sleep(6000);
await shot('13-end-lose');
console.log('   state:', await game('__game.state()'));

console.log('\nERRORS:', errors.length ? errors.slice(0, 12) : 'none');
console.log('WARNINGS:', warnings.length ? warnings.slice(0, 6) : 'none');
await browser.close();
