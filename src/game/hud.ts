// In-game HUD: flock tally, dusk arc, score, stamina, verb chips,
// message feed, zone cards, edge pips and overlays. Pure DOM.

const SHEEP_GLYPH = `<svg class="sheep-glyph" viewBox="0 0 21 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
<ellipse cx="11.6" cy="7" rx="7.4" ry="5.2"/>
<circle cx="4.4" cy="6.2" r="2.7"/>
<rect x="7.2" y="10.6" width="1.7" height="4"/>
<rect x="13.8" y="10.6" width="1.7" height="4"/>
</svg>`;

export interface PipInfo {
  x: number; // px
  y: number;
  cls: 'sheep' | 'stray' | 'wolf' | 'fold';
}

export class HUD {
  private root: HTMLElement;
  private el!: HTMLElement;
  private glyphsEl!: HTMLElement;
  private countEl!: HTMLElement;
  private duskDot!: SVGCircleElement;
  private duskArcFill!: SVGPathElement;
  private zoneLabel!: HTMLElement;
  private scoreEl!: HTMLElement;
  private bestEl!: HTMLElement;
  private staminaFill!: HTMLElement;
  private eyeInd!: HTMLElement;
  private barkChip!: HTMLElement;
  private barkFill!: HTMLElement;
  private whistleChip!: HTMLElement;
  private whistleFill!: HTMLElement;
  private eyeChip!: HTMLElement;
  private messagesEl!: HTMLElement;
  private zoneCard!: HTMLElement;
  private interactEl!: HTMLElement;
  private pipsEl!: HTMLElement;
  private eyeOverlay!: HTMLElement;
  private flashOverlay!: HTMLElement;
  private lockHint!: HTMLElement;
  private pipPool: HTMLElement[] = [];
  private lastGlyphKey = '';
  private flashT = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.build();
  }

  private build(): void {
    const el = document.createElement('div');
    el.id = 'hud';
    el.className = 'hidden';
    el.innerHTML = `
      <div class="overlay" id="vignette"></div>
      <div class="overlay" id="eye-overlay"></div>
      <div class="overlay" id="flash-overlay"></div>
      <div id="pips"></div>
      <div class="hud-corner hud-flock">
        <div class="count-line"><span class="n">0</span> <span class="of">of</span> <span class="t">13</span></div>
        <div class="sheep-glyphs"></div>
      </div>
      <div class="hud-corner hud-dusk">
        <svg width="240" height="54" viewBox="0 0 240 54">
          <path d="M 16 50 A 104 104 0 0 1 224 50" fill="none" stroke="rgba(239,227,200,0.22)" stroke-width="1.5"/>
          <path class="arc-fill" d="M 16 50 A 104 104 0 0 1 224 50" fill="none" stroke="rgba(255,160,80,0.85)" stroke-width="1.5"/>
          <circle class="dusk-dot" cx="16" cy="50" r="5" fill="#ffd9a0"/>
        </svg>
        <div class="zone-label">The High Meadow</div>
      </div>
      <div class="hud-corner hud-score">
        <div class="score-value">0</div>
        <div class="score-best"></div>
      </div>
      <div class="hud-corner hud-stamina">
        <div class="stamina-label">LEGS</div>
        <div class="stamina-track"><div class="stamina-fill"></div></div>
        <div class="eye-indicator">holding the eye…</div>
      </div>
      <div class="hud-corner hud-verbs">
        <div class="verb-chip chip-bark"><div class="cooldown-fill"></div><div class="verb-name">BARK</div><div class="verb-key">space</div></div>
        <div class="verb-chip chip-whistle"><div class="cooldown-fill"></div><div class="verb-name">GATHER</div><div class="verb-key">Q — whistle</div></div>
        <div class="verb-chip chip-eye"><div class="cooldown-fill"></div><div class="verb-name">THE EYE</div><div class="verb-key">hold RMB / E</div></div>
      </div>
      <div class="hud-messages"></div>
      <div class="zone-card"><div class="zone-num"></div><div class="zone-name"></div></div>
      <div class="interact-prompt"></div>
      <div class="lock-hint">click to steer with the mouse — or drive with WASD and let the camera follow</div>
    `;
    this.root.appendChild(el);
    this.el = el;
    this.glyphsEl = el.querySelector('.sheep-glyphs')!;
    this.countEl = el.querySelector('.count-line')!;
    this.duskDot = el.querySelector('.dusk-dot')!;
    this.duskArcFill = el.querySelector('.arc-fill')!;
    this.zoneLabel = el.querySelector('.zone-label')!;
    this.scoreEl = el.querySelector('.score-value')!;
    this.bestEl = el.querySelector('.score-best')!;
    this.staminaFill = el.querySelector('.stamina-fill')!;
    this.eyeInd = el.querySelector('.eye-indicator')!;
    this.barkChip = el.querySelector('.chip-bark')!;
    this.barkFill = this.barkChip.querySelector('.cooldown-fill')!;
    this.whistleChip = el.querySelector('.chip-whistle')!;
    this.whistleFill = this.whistleChip.querySelector('.cooldown-fill')!;
    this.eyeChip = el.querySelector('.chip-eye')!;
    this.messagesEl = el.querySelector('.hud-messages')!;
    this.zoneCard = el.querySelector('.zone-card')!;
    this.interactEl = el.querySelector('.interact-prompt')!;
    this.pipsEl = el.querySelector('#pips')!;
    this.eyeOverlay = el.querySelector('#eye-overlay')!;
    this.flashOverlay = el.querySelector('#flash-overlay')!;
    this.lockHint = el.querySelector('.lock-hint')!;

    const arcLen = (this.duskArcFill as unknown as SVGPathElement).getTotalLength?.() ?? 330;
    this.duskArcFill.style.strokeDasharray = `${arcLen}`;
    this.duskArcFill.style.strokeDashoffset = `${arcLen}`;
  }

  show(): void { this.el.classList.remove('hidden'); }
  hide(): void { this.el.classList.add('hidden'); }

  setFlock(states: Array<{ state: string; isStray: boolean }>, withDog: number, total: number): void {
    const key = states.map((s) => s.state + (s.isStray ? 's' : '')).join(',');
    (this.countEl.querySelector('.n') as HTMLElement).textContent = String(withDog);
    (this.countEl.querySelector('.t') as HTMLElement).textContent = String(total);
    if (key === this.lastGlyphKey) return;
    this.lastGlyphKey = key;
    this.glyphsEl.innerHTML = states
      .map((s) => {
        let cls = 'state-with';
        if (s.state === 'home') cls = 'state-home';
        else if (s.state === 'taken') cls = 'state-taken';
        else if (s.state === 'lost') cls = 'state-lost';
        else if (s.state === 'stray') cls = 'state-stray';
        return SHEEP_GLYPH.replace('class="sheep-glyph"', `class="sheep-glyph ${cls}"`);
      })
      .join('');
  }

  setDusk(darkness: number, zoneName: string): void {
    // dot travels the arc
    const ang = Math.PI * (1 - darkness); // PI → 0
    const cx = 120 + Math.cos(ang) * 104;
    const cy = 50 - Math.sin(ang) * 104;
    this.duskDot.setAttribute('cx', String(cx));
    this.duskDot.setAttribute('cy', String(cy));
    const warm = darkness < 0.55;
    this.duskDot.setAttribute('fill', warm ? '#ffce8a' : '#c9d4f2');
    const arcLen = 330;
    this.duskArcFill.style.strokeDashoffset = String(arcLen * (1 - darkness));
    if (this.zoneLabel.textContent !== zoneName) this.zoneLabel.textContent = zoneName;
  }

  setScore(score: number, best: number): void {
    this.scoreEl.textContent = String(Math.round(score));
    this.bestEl.textContent = best > 0 ? `best ${best}` : '';
  }

  setStamina(v: number): void {
    this.staminaFill.style.transform = `scaleX(${v.toFixed(3)})`;
    this.staminaFill.classList.toggle('low', v < 0.28);
  }

  setVerbs(barkCd: number, whistleCd: number, eyeActive: boolean, whistleActive: boolean): void {
    this.barkFill.style.width = `${(barkCd * 100).toFixed(1)}%`;
    this.barkChip.classList.toggle('ready', barkCd <= 0);
    this.whistleFill.style.width = `${(whistleCd * 100).toFixed(1)}%`;
    this.whistleChip.classList.toggle('ready', whistleCd <= 0);
    this.whistleChip.classList.toggle('held', whistleActive);
    this.eyeChip.classList.toggle('held', eyeActive);
    this.eyeInd.classList.toggle('active', eyeActive);
    this.eyeOverlay.style.opacity = eyeActive ? '1' : '0';
  }

  message(text: string, cls: '' | 'good' | 'bad' = ''): void {
    const div = document.createElement('div');
    div.className = `hud-msg ${cls}`;
    div.textContent = text;
    this.messagesEl.appendChild(div);
    while (this.messagesEl.children.length > 4) this.messagesEl.firstChild?.remove();
    setTimeout(() => div.remove(), 5300);
  }

  showZoneCard(num: string, name: string): void {
    (this.zoneCard.querySelector('.zone-num') as HTMLElement).textContent = num;
    (this.zoneCard.querySelector('.zone-name') as HTMLElement).textContent = name;
    this.zoneCard.classList.remove('show');
    void this.zoneCard.offsetWidth; // restart animation
    this.zoneCard.classList.add('show');
  }

  setInteract(text: string | null): void {
    if (text) {
      this.interactEl.textContent = text;
      this.interactEl.classList.add('show');
    } else {
      this.interactEl.classList.remove('show');
    }
  }

  setLockHint(show: boolean): void {
    this.lockHint.classList.toggle('show', show);
  }

  flash(): void {
    this.flashT = 1;
  }

  updateOverlays(dt: number): void {
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 2.4);
      this.flashOverlay.style.opacity = String(this.flashT * 0.9);
    }
  }

  setPips(pips: PipInfo[]): void {
    while (this.pipPool.length < pips.length) {
      const d = document.createElement('div');
      d.className = 'pip';
      this.pipsEl.appendChild(d);
      this.pipPool.push(d);
    }
    for (let i = 0; i < this.pipPool.length; i++) {
      const el = this.pipPool[i];
      if (i < pips.length) {
        const p = pips[i];
        el.style.display = 'block';
        el.style.left = `${p.x.toFixed(0)}px`;
        el.style.top = `${p.y.toFixed(0)}px`;
        el.className = `pip ${p.cls}`;
      } else {
        el.style.display = 'none';
      }
    }
  }

  reset(): void {
    this.lastGlyphKey = '';
    this.messagesEl.innerHTML = '';
    this.setPips([]);
    this.setInteract(null);
  }
}
