// Quantitative probe of the core herding loop, run headless:
//  1. walk into the flock from up-valley → flock should flow down-valley
//  2. bark → fear spike + scatter
//  3. the Eye → directional push
//  4. whistle → distant sheep drift back toward the dog
import { chromium } from 'playwright-core';

const BASE = process.env.GAME_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${BASE}/?debug&lowfx`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('gloaming.howto.v1', '1'));
await page.click('text=BEGIN THE RUN');
await page.waitForTimeout(1500);

const flock = async () => JSON.parse(await page.evaluate('JSON.stringify(window.__game.flockInfo())'));
const dog = async () => page.evaluate('window.__game.dogInfo()');
const stats = (list) => {
  const f = list.filter((s) => s.state === 'flock');
  const cx = f.reduce((a, s) => a + s.x, 0) / f.length;
  const cz = f.reduce((a, s) => a + s.z, 0) / f.length;
  const meanFear = f.reduce((a, s) => a + s.fear, 0) / f.length;
  return { cx: +cx.toFixed(1), cz: +cz.toFixed(1), meanFear: +meanFear.toFixed(2), n: f.length };
};

console.log('— initial —');
const s0 = stats(await flock());
console.log(JSON.stringify(s0), JSON.stringify(await dog()));

console.log('— walk into flock 6s (dog starts up-valley of them) —');
await page.keyboard.down('w');
await page.waitForTimeout(6000);
await page.keyboard.up('w');
const s1 = stats(await flock());
console.log(JSON.stringify(s1), JSON.stringify(await dog()));
console.log(`   flock drift dz = ${(s1.cz - s0.cz).toFixed(1)} (negative = herded down-valley ✓), fear ${s0.meanFear} → ${s1.meanFear}`);

console.log('— bark —');
await page.keyboard.press('Space');
await page.waitForTimeout(1200);
const s2 = stats(await flock());
console.log(JSON.stringify(s2));
console.log(`   fear after bark: ${s2.meanFear} (spike expected)`);

console.log('— the Eye for 3s —');
await page.keyboard.down('e');
await page.waitForTimeout(3000);
await page.keyboard.up('e');
const s3 = stats(await flock());
console.log(JSON.stringify(s3));
console.log(`   eye drift dz = ${(s3.cz - s2.cz).toFixed(1)}, fear ${s2.meanFear} → ${s3.meanFear} (should rise only a little)`);

console.log('— let them settle 6s, then whistle —');
await page.waitForTimeout(6000);
const s4 = stats(await flock());
const dogPos = await dog();
const meanDistBefore = (list, d) => {
  const f = list.filter((s) => s.state === 'flock');
  return +(f.reduce((a, s) => a + Math.hypot(s.x - d.x, s.z - d.z), 0) / f.length).toFixed(1);
};
const before = meanDistBefore(await flock(), dogPos);
await page.keyboard.press('q');
await page.waitForTimeout(3200);
const after = meanDistBefore(await flock(), await dog());
console.log(`   mean dist to dog: ${before} → ${after} (whistle gathers if > 20m away)`);
console.log(JSON.stringify(stats(await flock())));

await browser.close();
console.log('done');
