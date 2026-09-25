'use strict';
/* Keyboard + mouse state. Positions are kept in client pixels; Game converts to view space. */

const Input = {
  down: new Set(),
  pressed: new Set(),
  mouse: { cx: 0, cy: 0, left: false, right: false, leftPressed: false, rightPressed: false },

  init(canvas) {
    window.addEventListener('keydown', e => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT') return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', e => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouse.left = this.mouse.right = false;
    });
    window.addEventListener('mousemove', e => { this.mouse.cx = e.clientX; this.mouse.cy = e.clientY; });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  },

  isDown(code) { return this.down.has(code); },
  wasPressed(code) { return this.pressed.has(code); },
  anyDown(...codes) { return codes.some(c => this.down.has(c)); },
  anyPressed(...codes) { return codes.some(c => this.pressed.has(c)); },

  endFrame() {
    this.pressed.clear();
    this.mouse.leftPressed = false;
    this.mouse.rightPressed = false;
  },
};
