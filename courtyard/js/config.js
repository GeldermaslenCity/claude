// All gameplay tuning lives here so balance changes don't require hunting through modules.

export const CONFIG = {
  mapHalf: 30, // courtyard spans -30..30 on X and Z (metres)

  player: {
    radius: 0.4,
    eye: 1.65,
    walkSpeed: 5.0,
    sprintSpeed: 7.6,
    jumpSpeed: 5.2,
    gravity: 16,
    maxHealth: 100,
    regenDelay: 4.5, // seconds without damage before health regenerates
    regenRate: 10, // hp per second
    spawn: { x: 0, z: 7 },
  },

  weapons: {
    pistol: {
      name: 'M9 Pistol', damage: 34, fireInterval: 0.15, auto: false,
      mag: 10, reserve: 80, reload: 1.45, spread: 0.006, headMult: 2.5,
      recoil: 0.018, sound: 'pistol',
    },
    rifle: {
      name: 'AR-15 Rifle', damage: 30, fireInterval: 0.095, auto: true,
      mag: 30, reserve: 210, reload: 2.1, spread: 0.014, headMult: 2.2,
      recoil: 0.011, sound: 'rifle',
    },
  },

  melee: { damage: 55, range: 2.0, cooldown: 0.55 },

  points: { hit: 10, kill: 60, headshotKill: 100, meleeKill: 130, roundBonusPerRound: 50 },

  zombie: {
    radius: 0.38,
    attackRange: 1.25, // centre-to-centre distance that starts an attack
    hitRange: 1.65, // distance at which the swing still connects
    attackWindup: 0.45,
    attackCooldown: 1.1,
    riseTime: 1.2,
  },

  // Difficulty curve per round (1-based).
  round: {
    count: r => Math.min(6 + (r - 1) * 4 + Math.floor(r * r * 0.25), 90),
    maxAlive: r => Math.min(8 + r * 2, 28),
    health: r => Math.round(55 * Math.pow(1.17, r - 1)),
    walkSpeed: r => Math.min(1.35 + r * 0.14, 3.1),
    runnerChance: r => (r < 3 ? 0 : Math.min(0.12 * (r - 2), 0.6)),
    bruteChance: r => (r < 5 ? 0 : Math.min(0.05 + 0.02 * (r - 5), 0.2)),
    damage: r => Math.min(14 + r, 40),
    spawnInterval: r => Math.max(0.35, 1.9 - r * 0.12),
  },

  intermission: 30, // seconds of shopping / breathing room between rounds
  preRoundDelay: 3, // banner before the first zombie of a round spawns
};

// Shop items. `cost(level)` is the price of the next purchase at the current level.
export const UPGRADES = [
  { id: 'vitality', name: 'Vitality', desc: '+25 max health', max: 4, cost: l => 500 + l * 250 },
  { id: 'damage', name: 'Hollow Points', desc: '+20% weapon damage', max: 5, cost: l => 750 + l * 500 },
  { id: 'reload', name: 'Speed Loader', desc: '-15% reload time', max: 4, cost: l => 500 + l * 300 },
  { id: 'mag', name: 'Extended Mags', desc: '+30% magazine size', max: 3, cost: l => 600 + l * 400 },
  { id: 'speed', name: 'Sneakers', desc: '+8% move speed', max: 3, cost: l => 400 + l * 300 },
  { id: 'rifle', name: 'AR-15 Rifle', desc: 'Full-auto rifle. Press 2 to equip', max: 1, cost: () => 1500 },
  { id: 'ammo', name: 'Ammo Crate', desc: 'Refill reserve ammo for all weapons', max: Infinity, cost: () => 250, consumable: true },
  { id: 'heal', name: 'Medkit', desc: 'Restore full health', max: Infinity, cost: () => 200, consumable: true },
];
