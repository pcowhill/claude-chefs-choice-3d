// Full-screen states: title, how-to-herd, pause, end. DOM only —
// the living 3D vale renders behind every screen.

export interface EndStats {
  won: boolean;
  home: number;
  total: number;
  straysRescued: number;
  timeSec: number;
  wolvesDrivenOff: number;
  barks: number;
  distance: number;
  score: number;
  best: number;
  newBest: boolean;
  rank: string;
  homeNames: string[];
  lostNames: Array<{ name: string; cause: string }>;
  leftOut: string[];
}

export interface UICallbacks {
  onStart(): void;
  onResume(): void;
  onRestart(): void;
  onQuitToTitle(): void;
  onVolume(v: number): void;
  onMuteToggle(): boolean;
  onClick(): void;
}

const CONTROLS_ROWS = `
  <div><span>run</span><span class="key">W A S D</span></div>
  <div><span>steer the camera</span><span class="key">mouse</span></div>
  <div><span>sprint</span><span class="key">shift</span></div>
  <div><span>the eye — stare</span><span class="key">hold RMB or E</span></div>
  <div><span>bark</span><span class="key">space</span></div>
  <div><span>gather whistle</span><span class="key">Q</span></div>
  <div><span>shut the fold gate</span><span class="key">F</span></div>
  <div><span>pause</span><span class="key">esc / P</span></div>
  <div><span>mute</span><span class="key">M</span></div>`;

export class UI {
  private root: HTMLElement;
  private cb: UICallbacks;
  private titleEl!: HTMLElement;
  private howtoEl!: HTMLElement;
  private pauseEl!: HTMLElement;
  private endEl!: HTMLElement;
  private faderEl!: HTMLElement;
  private howtoReturnTo: 'title' | 'pause' = 'title';
  private muteButtons: HTMLElement[] = [];
  private volSliders: HTMLInputElement[] = [];

  constructor(root: HTMLElement, cb: UICallbacks) {
    this.root = root;
    this.cb = cb;
    this.build();
  }

  private soundRow(): string {
    return `
      <div class="sound-row">
        <label>SOUND</label>
        <input type="range" class="vol-slider" min="0" max="1" step="0.05" />
        <button class="mute-btn">mute — M</button>
      </div>`;
  }

  private build(): void {
    // ---------- title ----------
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'screen hidden';
    this.titleEl.innerHTML = `
      <div class="scrim"></div>
      <div class="panel title-panel">
        <h1 class="game-title">GLOAMING</h1>
        <div class="rule"><span class="diamond"></span></div>
        <p class="game-subtitle">The light is failing. Bring the flock home.</p>
        <div class="menu">
          <button class="btn primary" data-act="start">BEGIN THE RUN</button>
          <button class="btn" data-act="howto">HOW TO HERD</button>
        </div>
        <p class="best-line"></p>
        ${this.soundRow()}
      </div>
      <div class="title-footer">
        a sheepdog game — <span class="key">W A S D</span> run · <span class="key">hold RMB</span> stare ·
        <span class="key">space</span> bark · <span class="key">Q</span> whistle
      </div>`;
    // center the sound row on the title
    (this.titleEl.querySelector('.sound-row') as HTMLElement).style.justifyContent = 'center';

    // ---------- how to herd ----------
    this.howtoEl = document.createElement('div');
    this.howtoEl.className = 'screen solid hidden';
    this.howtoEl.innerHTML = `
      <div class="scrim"></div>
      <div class="panel">
        <h2 class="howto-title">HOW TO HERD</h2>
        <div class="rule"><span class="diamond"></span></div>
        <div class="verb-grid">
          <div class="verb-card">
            <h3>PRESENCE</h3>
            <div><span class="key">W A S D</span><span class="key">shift</span></div>
            <p>Sheep drift away from you. Walk gently to nudge; sprint to shove. Speed frightens them — a scared sheep is a fast, stupid sheep.</p>
          </div>
          <div class="verb-card">
            <h3>THE EYE</h3>
            <div><span class="key">hold RMB / E</span></div>
            <p>Crouch and stare. Sheep caught in your gaze are pressed firmly where you look — precise, and it barely frightens them. Wolves cannot bear it.</p>
          </div>
          <div class="verb-card">
            <h3>THE BARK</h3>
            <div><span class="key">space</span></div>
            <p>A shockwave of authority. Scatters sheep hard and sends wolves running — but it spikes panic. Panicked sheep bolt blind into bog and river.</p>
          </div>
          <div class="verb-card">
            <h3>THE WHISTLE</h3>
            <div><span class="key">Q</span></div>
            <p>Come-bye. Far-off sheep and new-found strays drift toward you for a moment. The gentlest tool you have — and the slowest to return.</p>
          </div>
        </div>
        <div class="howto-notes">
          <p><b>The task:</b> drive your flock down the vale, through the gates, across the river, and into the stone fold. Stand at the fold gate and press <span class="key">F</span> to shut it — that ends the run, wherever the rest of the flock stands.</p>
          <p><b>The dark:</b> as dusk deepens, wolves slip from the treeline after stragglers. <span class="fear">Glowing eyes mean a hunt has begun.</span> Body-block them, bark, or hold them with the eye. Lantern light is sanctuary — wolves will not enter it.</p>
          <p><b>The strays:</b> three lost sheep graze off the path, marked in gold. Fetch them for a richer fold — if you dare spend the daylight.</p>
        </div>
        <button class="btn primary" data-act="howto-back">TO THE FIELD</button>
      </div>`;

    // ---------- pause ----------
    this.pauseEl = document.createElement('div');
    this.pauseEl.className = 'screen hidden';
    this.pauseEl.innerHTML = `
      <div class="scrim"></div>
      <div class="panel">
        <h2 class="panel-title">A BREATHER</h2>
        <div class="rule"><span class="diamond"></span></div>
        <div class="pause-cols">
          <div class="pause-menu">
            <button class="btn small primary" data-act="resume">RESUME</button>
            <button class="btn small" data-act="restart">RESTART THE RUN</button>
            <button class="btn small" data-act="howto">HOW TO HERD</button>
            <button class="btn small" data-act="quit">QUIT TO TITLE</button>
            ${this.soundRow()}
          </div>
          <div class="controls-recap">${CONTROLS_ROWS}</div>
        </div>
      </div>`;

    // ---------- end ----------
    this.endEl = document.createElement('div');
    this.endEl.className = 'screen solid hidden';
    this.endEl.innerHTML = `
      <div class="scrim"></div>
      <div class="panel">
        <h2 class="verdict"></h2>
        <div class="rank-line"></div>
        <div class="rule"><span class="diamond"></span></div>
        <div class="stats-table"></div>
        <div class="fates"></div>
        <div class="end-buttons">
          <button class="btn primary" data-act="restart">RUN AGAIN</button>
          <button class="btn" data-act="quit">TITLE</button>
        </div>
      </div>`;

    this.faderEl = document.createElement('div');
    this.faderEl.id = 'fader';

    this.root.append(this.titleEl, this.howtoEl, this.pauseEl, this.endEl, this.faderEl);

    // wire actions
    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!btn) return;
      this.cb.onClick();
      switch (btn.dataset.act) {
        case 'start': this.cb.onStart(); break;
        case 'howto': this.showHowto(this.pauseEl.classList.contains('hidden') ? 'title' : 'pause'); break;
        case 'howto-back': this.closeHowto(); break;
        case 'resume': this.cb.onResume(); break;
        case 'restart': this.cb.onRestart(); break;
        case 'quit': this.cb.onQuitToTitle(); break;
      }
    });

    // sound controls (both instances)
    this.volSliders = Array.from(this.root.querySelectorAll('.vol-slider'));
    this.muteButtons = Array.from(this.root.querySelectorAll('.mute-btn'));
    for (const s of this.volSliders) {
      s.addEventListener('input', () => {
        this.cb.onVolume(parseFloat(s.value));
        this.syncSound(parseFloat(s.value), undefined);
      });
    }
    for (const b of this.muteButtons) {
      b.addEventListener('click', () => {
        this.cb.onClick();
        const muted = this.cb.onMuteToggle();
        this.syncSound(undefined, muted);
      });
    }
  }

  syncSound(volume?: number, muted?: boolean): void {
    if (volume !== undefined) for (const s of this.volSliders) s.value = String(volume);
    if (muted !== undefined) {
      for (const b of this.muteButtons) {
        b.classList.toggle('muted', muted);
        b.textContent = muted ? 'muted — M' : 'mute — M';
      }
    }
  }

  private hideAllScreens(): void {
    for (const el of [this.titleEl, this.howtoEl, this.pauseEl, this.endEl]) el.classList.add('hidden');
  }

  showTitle(best: number, bestRank: string): void {
    this.hideAllScreens();
    const line = this.titleEl.querySelector('.best-line') as HTMLElement;
    line.textContent = best > 0 ? `Best run: ${best} — ${bestRank}` : 'No flock has yet come home.';
    this.titleEl.classList.remove('hidden');
  }

  showHowto(returnTo: 'title' | 'pause'): void {
    this.howtoReturnTo = returnTo;
    this.hideAllScreens();
    this.howtoEl.classList.remove('hidden');
  }

  closeHowto(): void {
    this.howtoEl.classList.add('hidden');
    if (this.howtoReturnTo === 'pause') {
      this.pauseEl.classList.remove('hidden');
    } else {
      // returning to title context → begin the run directly (flow: title → howto → play)
      this.cb.onStart();
    }
  }

  get howtoOpen(): boolean {
    return !this.howtoEl.classList.contains('hidden');
  }

  showPause(): void {
    this.hideAllScreens();
    this.pauseEl.classList.remove('hidden');
  }

  hidePause(): void {
    this.pauseEl.classList.add('hidden');
  }

  showEnd(s: EndStats): void {
    this.hideAllScreens();
    const v = this.endEl.querySelector('.verdict') as HTMLElement;
    const rank = this.endEl.querySelector('.rank-line') as HTMLElement;
    const table = this.endEl.querySelector('.stats-table') as HTMLElement;
    const fates = this.endEl.querySelector('.fates') as HTMLElement;

    if (s.won) {
      v.textContent = s.home === s.total ? 'EVERY SHEEP HOME' : 'THE GATE IS SHUT';
      v.className = 'verdict won';
    } else {
      v.textContent = 'THE FOLD STANDS EMPTY';
      v.className = 'verdict lost';
    }
    rank.textContent = s.rank;
    rank.className = `rank-line${s.newBest ? ' newbest' : ''}`;

    const mins = Math.floor(s.timeSec / 60);
    const secs = Math.floor(s.timeSec % 60).toString().padStart(2, '0');
    const rows: Array<[string, string]> = [
      ['sheep brought home', `${s.home} of ${s.total}`],
      ['strays rescued', `${s.straysRescued} of 3`],
      ['wolves driven off', String(s.wolvesDrivenOff)],
      ['barks', String(s.barks)],
      ['ground covered', `${(s.distance / 1000).toFixed(2)} km`],
      ['time on the hill', `${mins}:${secs}`],
    ];
    table.innerHTML =
      rows.map(([l, val]) => `<div class="row"><span class="label">${l}</span><span class="value">${val}</span></div>`).join('') +
      `<div class="row total"><span class="label">score</span><span class="value">${s.score}</span></div>`;

    let fateHtml = '';
    if (s.homeNames.length) {
      fateHtml += `<div class="home-list">Safe in the fold — ${s.homeNames.map((n) => `<b>${n}</b>`).join(', ')}.</div>`;
    }
    if (s.leftOut.length) {
      fateHtml += `<div class="lost-list">Left on the hill — ${s.leftOut.map((n) => `<b>${n}</b>`).join(', ')}.</div>`;
    }
    if (s.lostNames.length) {
      fateHtml += `<div class="lost-list">${s.lostNames.map((f) => `<b>${f.name}</b> ${f.cause}`).join(' · ')}</div>`;
    }
    fates.innerHTML = fateHtml;

    this.endEl.classList.remove('hidden');
  }

  hideAll(): void {
    this.hideAllScreens();
  }

  fade(dark: boolean): void {
    this.faderEl.classList.toggle('dark', dark);
  }
}
