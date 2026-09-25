'use strict';
/* Entry point. */
window.addEventListener('load', () => {
  Game.init();
  window.game = Game; // exposed for debugging / automated tests
});
