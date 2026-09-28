// Keyboard + mouse. Pointer lock drives the camera; when lock is
// unavailable (denied, or headless), LMB-drag and camera auto-follow
// keep the game fully playable.

export class Input {
  private keys = new Set<string>();

  // edge-triggered (consumed each frame by the game)
  barkPressed = false;
  whistlePressed = false;
  interactPressed = false;
  pausePressed = false;
  mutePressed = false;
  anyPressed = false;

  // held
  eyeKeyHeld = false;
  eyeMouseHeld = false;
  dragging = false;

  pointerLocked = false;
  lockFailed = false;

  private lookDX = 0;
  private lookDY = 0;
  private lastClientX = 0;
  private lastClientY = 0;

  private el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return this.swallow(e);
      const c = e.code;
      this.keys.add(c);
      this.anyPressed = true;
      if (c === 'Space') this.barkPressed = true;
      if (c === 'KeyQ') this.whistlePressed = true;
      if (c === 'KeyF') this.interactPressed = true;
      if (c === 'KeyE') this.eyeKeyHeld = true;
      if (c === 'Escape' || c === 'KeyP') this.pausePressed = true;
      if (c === 'KeyM') this.mutePressed = true;
      this.swallow(e);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE') this.eyeKeyHeld = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.eyeKeyHeld = false;
      this.eyeMouseHeld = false;
      this.dragging = false;
    });

    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.eyeMouseHeld = true;
      if (e.button === 0 && !this.pointerLocked) {
        this.dragging = true;
        this.lastClientX = e.clientX;
        this.lastClientY = e.clientY;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.eyeMouseHeld = false;
      if (e.button === 0) this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      } else if (this.dragging) {
        this.lookDX += e.clientX - this.lastClientX;
        this.lookDY += e.clientY - this.lastClientY;
        this.lastClientX = e.clientX;
        this.lastClientY = e.clientY;
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.el;
    });
    document.addEventListener('pointerlockerror', () => {
      this.pointerLocked = false;
      this.lockFailed = true;
    });
  }

  private swallow(e: KeyboardEvent): void {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
      e.preventDefault();
    }
  }

  requestLock(): void {
    if (this.pointerLocked) return;
    try {
      const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => { this.lockFailed = true; });
    } catch {
      this.lockFailed = true;
    }
  }

  releaseLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  get moveX(): number {
    return (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
  }
  get moveZ(): number {
    return (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
  }
  get sprintHeld(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }
  get eyeHeld(): boolean {
    return this.eyeKeyHeld || this.eyeMouseHeld;
  }

  consumeLook(): { dx: number; dy: number } {
    const r = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return r;
  }

  /** clear all edge flags — call at the END of each frame */
  endFrame(): void {
    this.barkPressed = false;
    this.whistlePressed = false;
    this.interactPressed = false;
    this.pausePressed = false;
    this.mutePressed = false;
    this.anyPressed = false;
  }
}
