import './style.css';
import { Game } from './game/game.ts';

const canvasRoot = document.getElementById('canvas-root')!;
const uiRoot = document.getElementById('ui-root')!;

function fail(msg: string): void {
  uiRoot.innerHTML = `
    <div class="screen solid">
      <div class="scrim"></div>
      <div class="panel">
        <h2 class="panel-title">THE LANTERN WON'T LIGHT</h2>
        <div class="rule"><span class="diamond"></span></div>
        <p style="margin-top:12px; color: var(--parchment-dim); font-style: italic;">${msg}</p>
      </div>
    </div>`;
}

try {
  // WebGL sanity check before we build the whole vale
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
  if (!gl) {
    fail('GLOAMING needs WebGL to render the vale, and your browser refused to provide it. Try a desktop browser with hardware acceleration enabled.');
  } else {
    new Game(canvasRoot, uiRoot);
  }
} catch (err) {
  console.error(err);
  fail(`Something broke while building the vale: ${err instanceof Error ? err.message : String(err)}`);
}
