// Full-quality (shadows + AA) staged screenshots for the art pass.
// Slow under SwiftShader — each shot gets generous settle time.
import { chromium } from 'playwright-core';

const BASE = process.env.GAME_URL || 'http://127.0.0.1:5173';
const OUT = process.env.OUT_DIR || '.';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evalg = (x) => page.evaluate(x);

await page.goto(`${BASE}/?debug`, { waitUntil: 'networkidle' });
await evalg('localStorage.setItem("gloaming.howto.v1","1")');
await sleep(4500);
await shot('A1-title');

await page.click('text=BEGIN THE RUN');
await sleep(4000);
await shot('A2-run-start');

// drive to the flock and lean on them
await page.keyboard.down('w');
await sleep(3000);
await page.keyboard.up('w');
await sleep(800);
await shot('A3-at-flock');

await page.keyboard.press('Space');
await sleep(420);
await shot('A4-bark');

await page.keyboard.down('e');
await sleep(1600);
await shot('A5-eye');
await page.keyboard.up('e');

// sunset stage
await evalg('window.__game.dark(0.5)');
await sleep(2500);
await shot('A6-sunset');

// deep dusk at the pinewood with wolves about
await evalg('window.__game.dark(0.85)');
await evalg('window.__game.teleport(-310)');
await sleep(9000);
await shot('A7-night-wolves');

// near the fold, lanterns lit
await evalg('window.__game.teleport(-520)');
await sleep(3500);
await shot('A8-farm');

await page.keyboard.press('Escape');
await sleep(900);
await shot('A9-pause');
await page.click('text=RESUME');
await sleep(1200);

await evalg('window.__game.win()');
await sleep(8000);
await shot('A10-end');

await browser.close();
console.log('art shots done');
