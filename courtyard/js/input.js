// Keyboard / mouse state with pointer lock.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed since last frame
    this.mouseDown = false;
    this.mouseClicked = false;
    this.dx = 0;
    this.dy = 0;
    this.locked = false;
    this.sensitivity = 1;
    this.onLockChange = null;

    addEventListener('keydown', e => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    addEventListener('mousedown', e => {
      if (e.button === 0) { this.mouseDown = true; this.mouseClicked = true; }
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.mouseDown = false; });
    addEventListener('mousemove', e => {
      if (!this.locked) return;
      // Some browsers report a huge spurious jump right after locking; ignore it.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.mouseDown = false; this.keys.clear(); }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch { /* not allowed right now; the pause screen will offer to retry */ }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // Forget buttons held from menu clicks so they don't fire the gun.
  clearButtons() {
    this.mouseDown = false;
    this.mouseClicked = false;
    this.pressed.clear();
  }

  // Called at the end of each frame.
  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
    this.dx = 0;
    this.dy = 0;
  }
}
