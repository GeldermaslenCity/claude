'use strict';
/* Static game data: world dimensions, zones, resources, upgrades. */

const TILE = 16;              // world pixels per tile
const CHUNK = 32;             // tiles per cached render chunk
const WORLD_W = 320;          // tiles
const WORLD_H = 720;          // tiles
const METERS_PER_TILE = 5;
const SAFE_DEPTH_TILES = 38;  // above this the station keeps creatures away
const WARDEN_CEILING = 185;   // the Warden never rises above this tile row (925 m)

const ZONES = [
  {
    id: 0, key: 'station', name: 'Anchor Station', y0: 0, y1: 34,
    water: [16, 44, 58], rock: [62, 76, 82], edge: [124, 150, 156], dark: 0.5,
    snow: [150, 190, 200], drone: 55, spawns: {},
  },
  {
    id: 1, key: 'shelf', name: 'The Shelf Caverns', y0: 34, y1: 200,
    water: [7, 26, 36], rock: [56, 70, 64], edge: [110, 142, 116], dark: 0.86,
    snow: [130, 170, 160], drone: 49,
    res: { iron: 6, copper: 3.2, fuel: 0.7 }, depositChance: 0.06,
    spawns: { needle: 5, jelly: 4 },
  },
  {
    id: 2, key: 'bone', name: 'The Bone Gardens', y0: 200, y1: 400,
    water: [5, 18, 20], rock: [58, 62, 50], edge: [132, 138, 102], dark: 0.93,
    snow: [150, 160, 130], drone: 41,
    res: { copper: 3, iron: 2, titanium: 3, fuel: 2, resonite: 0.35 }, depositChance: 0.055,
    spawns: { needle: 4, eel: 2, jelly: 3, maw: 1 },
  },
  {
    id: 3, key: 'throat', name: 'The Hadal Throat', y0: 400, y1: 600,
    water: [4, 10, 16], rock: [52, 44, 58], edge: [122, 96, 126], dark: 0.965,
    snow: [130, 120, 150], drone: 36.7,
    res: { titanium: 3, fuel: 2, resonite: 1.6, copper: 1 }, depositChance: 0.055,
    spawns: { needle: 3, eel: 3, maw: 4 },
  },
  {
    id: 4, key: 'trench', name: 'The Trench', y0: 600, y1: 720,
    water: [2, 6, 8], rock: [40, 34, 42], edge: [100, 70, 78], dark: 0.98,
    snow: [120, 100, 110], drone: 27.5,
    spawns: { eel: 2 },
  },
];

function zoneAt(ty) {
  for (let i = ZONES.length - 1; i >= 0; i--) if (ty >= ZONES[i].y0) return ZONES[i];
  return ZONES[0];
}

const RESOURCES = {
  iron:     { name: 'Iron Ore',     color: [128, 134, 142], light: [190, 196, 204], price: 8,  hardness: 1, time: 1.1, glow: null },
  copper:   { name: 'Copper Ore',   color: [184, 110, 60],  light: [236, 160, 100], price: 14, hardness: 1, time: 1.4, glow: null },
  titanium: { name: 'Titanium',     color: [170, 190, 210], light: [228, 240, 255], price: 32, hardness: 2, time: 1.9, glow: null },
  fuel:     { name: 'Fuel Crystal', color: [214, 150, 40],  light: [255, 212, 110], price: 24, hardness: 2, time: 1.7, glow: [255, 170, 50] },
  resonite: { name: 'Resonite',     color: [70, 220, 160],  light: [170, 255, 220], price: 90, hardness: 3, time: 2.6, glow: [90, 255, 190] },
};
const RES_ORDER = ['iron', 'copper', 'titanium', 'fuel', 'resonite'];

/* Each upgrade: costs[level] is the price to BUY that level. Level 0 is the stock part. */
const UPGRADES = {
  hull: {
    name: 'Hull Plating', desc: 'Hull strength and crush-depth rating.',
    costs: [0, 250, 700, 1600, 3000],
    levels: [
      { maxHull: 100, depth: 1100 }, { maxHull: 135, depth: 1650 }, { maxHull: 175, depth: 2300 },
      { maxHull: 220, depth: 3050 }, { maxHull: 280, depth: 3700 },
    ],
    names: ['Stock Plating', 'Reinforced Plating', 'Composite Plating', 'Abyssal Plating', 'Trench-Rated Hull'],
    lockLast: 'trench',
  },
  battery: {
    name: 'Battery Cells', desc: 'Powers floodlight, sonar, laser and shock pulse.',
    costs: [0, 180, 450, 950],
    levels: [{ maxBattery: 100 }, { maxBattery: 150 }, { maxBattery: 210 }, { maxBattery: 290 }],
  },
  oxygen: {
    name: 'Oxygen Reserves', desc: 'Longer dives before the air runs out.',
    costs: [0, 150, 400, 850],
    levels: [{ maxOxygen: 100 }, { maxOxygen: 140 }, { maxOxygen: 190 }, { maxOxygen: 250 }],
  },
  engine: {
    name: 'Engine & Fuel Tanks', desc: 'Thrust, top speed, tank size and efficiency.',
    costs: [0, 220, 560, 1100],
    levels: [
      { thrust: 300, maxSpeed: 130, maxFuel: 100, fuelUse: 0.3 },
      { thrust: 340, maxSpeed: 148, maxFuel: 130, fuelUse: 0.26 },
      { thrust: 385, maxSpeed: 166, maxFuel: 165, fuelUse: 0.23 },
      { thrust: 430, maxSpeed: 186, maxFuel: 210, fuelUse: 0.2 },
    ],
  },
  silent: {
    name: 'Quiet Propulsion', desc: 'Dampened screws and mounts. Less noise from everything.',
    costs: [0, 200, 520, 1000],
    levels: [{ noiseMult: 1 }, { noiseMult: 0.78 }, { noiseMult: 0.6 }, { noiseMult: 0.45 }],
  },
  lights: {
    name: 'Floodlights', desc: 'Longer, wider, more efficient floodlight.',
    costs: [0, 160, 420, 820],
    levels: [
      { lightRange: 190, lightCone: 0.42, lightDrain: 0.22 }, { lightRange: 240, lightCone: 0.48, lightDrain: 0.2 },
      { lightRange: 290, lightCone: 0.54, lightDrain: 0.18 }, { lightRange: 350, lightCone: 0.6, lightDrain: 0.16 },
    ],
  },
  laser: {
    name: 'Mining Laser', desc: 'Higher marks cut harder minerals, faster.',
    costs: [0, 200, 600, 1300],
    levels: [
      { laserPower: 1, laserRate: 1, laserRange: 120 }, { laserPower: 2, laserRate: 1.35, laserRange: 135 },
      { laserPower: 3, laserRate: 1.7, laserRange: 150 }, { laserPower: 3, laserRate: 2.3, laserRange: 170 },
    ],
  },
  cargo: {
    name: 'Cargo Hold', desc: 'Carry more ore per expedition.',
    costs: [0, 180, 480, 1000],
    levels: [{ cargoMax: 18 }, { cargoMax: 28 }, { cargoMax: 42 }, { cargoMax: 60 }],
  },
  sonar: {
    name: 'Sonar Suite', desc: 'Range, contact classification and passive tracking.',
    costs: [0, 200, 500, 950],
    levels: [
      { sonarRange: 520, sonarLevel: 0, sonarCost: 4 }, { sonarRange: 700, sonarLevel: 1, sonarCost: 3.5 },
      { sonarRange: 900, sonarLevel: 2, sonarCost: 3 }, { sonarRange: 1150, sonarLevel: 3, sonarCost: 2.5 },
    ],
  },
  defense: {
    name: 'Countermeasures', desc: 'Decoy flares; from Mk II a shock pulse emitter (R).',
    costs: [0, 220, 550, 1100],
    levels: [{ flares: 3, shock: 0 }, { flares: 5, shock: 1 }, { flares: 7, shock: 1.4 }, { flares: 10, shock: 1.8 }],
  },
};
const UPGRADE_ORDER = ['hull', 'battery', 'oxygen', 'engine', 'silent', 'lights', 'laser', 'cargo', 'sonar', 'defense'];

const STAT_LABELS = {
  maxHull: ['Hull', ''], depth: ['Crush depth', ' m'], maxBattery: ['Battery', ''], maxOxygen: ['Oxygen', ''],
  thrust: ['Thrust', ''], maxSpeed: ['Top speed', ''], maxFuel: ['Fuel tank', ''], fuelUse: ['Fuel use', '/s'],
  noiseMult: ['Noise', 'x'], lightRange: ['Light range', ''], lightCone: ['Beam width', ' rad'], lightDrain: ['Light drain', '/s'],
  laserPower: ['Laser mark', ''], laserRate: ['Cut speed', 'x'], laserRange: ['Laser range', ''],
  cargoMax: ['Cargo', ' units'], sonarRange: ['Sonar range', ''], sonarLevel: ['Classifier', ''], sonarCost: ['Ping cost', ''],
  flares: ['Flares', ''], shock: ['Shock power', ''],
};

const PRICES = {
  repairPerHp: 1.5,
  fuelPerUnit: 0.8,
  flare: 12,
};

const START_CREDITS = 60;
