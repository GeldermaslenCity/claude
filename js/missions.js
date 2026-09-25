'use strict';
/* Story mission, recovered logs, procedural contracts and the training sequence. */

const LOGS = {
  rig: {
    title: 'RIG-4 — MAINTENANCE SCRAWL',
    body: `Shift 212. Sonar flagged a contact under the rig again. Big. Bigger than the rig. Survey says it's a thermocline ghost — pressure layers bouncing the ping back.

Fine. Then why did the ghost move against the current?

Shift 214. Pulled the crew topside. Leaving the drill running so the numbers look good. If anyone reads this: keep your ping count low down here. Every time we pinged, the ghost got closer.`,
  },
  kestrel: {
    title: 'DSV KESTREL — CAPTAIN\'S LOG (I. OKAFOR)',
    body: `Day 3. Teo picked up the signal again at 900 metres. Three pulses, a long silence, three pulses. The company says it's a derelict transponder. Transponders don't change their rhythm when you answer them.

Day 4. Mara answered it. Pulsed our sonar in the same pattern. The signal stopped. Then the hull started ringing — not from outside. From below.

Day 5. We're losing the Kestrel. Something opened the aft section like a tin. We're taking the lifepod down to Vesna Station; it's the only pressurised shelter in range.

The black box is in the recorder cradle beside the wreck. Whoever finds this: bring it home. Tell them it wasn't a transponder.`,
  },
  blackbox: {
    title: 'BLACK BOX PLAYBACK — DSV KESTREL',
    body: `[static]

VANCE: The pattern is getting more complex. It's learning our ping.
LINDQVIST: Or it's teaching us something.

[a sound like a whale call slowed to a crawl. It lasts eleven seconds.]

OKAFOR: Kill the lights. Kill everything. Nobody breathe.

[recording ends]

ANCHOR STATION ANALYSIS: Lifepod LP-2 beacon last registered at Vesna Research Station, approx. 1,400 m. Recovery attempt authorised.`,
  },
  vesna1: {
    title: 'VESNA RESEARCH STATION — EVACUATION NOTICE',
    body: `By order of the Halvorsen-Mbeki board, this station is decommissioned. Reason: structural.

Staff are reminded that the deep hydrophone array remains company property and its recordings must not be discussed off-site.

[handwritten underneath, in grease pencil]
The array heard it breathe. That's the structural reason.`,
  },
  vesna2: {
    title: 'LIFEPOD LP-2 — PERSONAL RECORDER (M. LINDQVIST)',
    body: `Okafor didn't make it through the airlock. I won't describe it. Teo and I sealed ourselves in the lab.

Teo's convinced the signal isn't coming from the big one. The old crews called it the Warden — Teo says that's exactly what it is. A guard. Something deeper is calling, and the Warden answers.

We're going down to Deep Relay 7 in the Throat. If we can fix it we can triangulate the source and get a message topside. The relay housing is cracked; we need titanium and copper for the patch and we have neither.

If you're hearing this, we didn't come back. Bring four titanium. Bring two copper. Don't bring lights you can't turn off.`,
  },
  skeleton: {
    title: 'FIELD NOTE — T. VANCE, BIOLOGIST',
    body: `Forty-metre ribs. Vertebrae the size of our lifepod.

It's not the Warden. It's smaller than the Warden.

Something ate this. The bite marks on the spine are from a jaw wider than this cavern. I've stopped taking samples. I don't want to know whether the marks are fresh.`,
  },
  marrow: {
    title: 'DSV MARROW — AUTOMATED DISTRESS LOOP',
    body: `"Mayday, mayday. DSV Marrow. Depth two-one-zero-zero. Hull intact. Crew—"

[the loop restarts]

"Mayday, mayday. DSV Marrow—"

Beneath the loop, faint, something taps against the hull from the inside. Three knocks. A long silence. Three knocks.

The Marrow's manifest lists no crew. It was an unmanned survey drone.`,
  },
  relay: {
    title: 'DEEP RELAY 7 — MAINTENANCE PLATE',
    body: `DEEP RELAY 7. HALVORSEN-MBEKI COMMS. HOUSING RATED TO 2,400 M.
DO NOT OPERATE WITHOUT ACOUSTIC SHIELDING.

[scratched into the paint with something sharp]
T.V. + M.L. — got the dish half aligned. It's close.
It's always close.`,
  },
  relay_online: {
    title: 'RELAY 7 ONLINE — TRIANGULATION COMPLETE',
    body: `The relay wakes. For eleven seconds it only listens.

Then the triangulation resolves: the signal originates beneath the Trench floor, roughly 3,500 metres down, from something with a thermal signature the size of a city block.

The relay also releases one buffered transmission, nine days old.

VANCE: Mara went down alone. She said it was singing the right way now. She said it could finally hear us. I'm going after her. Don't send anyone. Please don't send anyone.

Carry the data back to Anchor Station.`,
  },
  relay_home: {
    title: 'ANCHOR STATION — ENGINEERING ORDER 7741-T',
    body: `The board has reviewed the Relay 7 triangulation.

Effective immediately, the Anchor Station yard is authorised to fit a TRENCH-RATED HULL (rated to 3,700 m) to contract vessel 7741.

Objective: descend into the Trench, locate the source of the signal, and determine whether the Kestrel's crew can be recovered.

The board thanks you for your discretion.`,
  },
  gate: {
    title: 'THE TRENCH GATE',
    body: `Spires of black stone — not rock, not metal — ring the mouth of the Trench.

Their surfaces are carved with the three-pulse pattern, repeated thousands of times, spiralling down into the dark.

They are warm to the hull sensors. When the signal pulses, so do they.`,
  },
};

const ENDING_TEXT = [
  'At 3,500 metres the walls fall away. Your floodlight finds nothing to land on.',
  'Then the sonar returns the shape of the Trench floor — and the floor breathes.',
  'The signal is not a message. It is a heartbeat, slow as tides, and everything in the Kharon Sea has been listening to it for a very long time. The Warden was never hunting you. It was herding you here.',
  'On the company band, perfectly calm, Mara Lindqvist speaks: "You came. Good. Now it can hear us properly."',
  'The heartbeat stops.',
  'For the first time, something enormous answers.',
];

const STORY_STAGES = [
  { title: 'Find the Kestrel', text: 'The survey sub DSV Kestrel went silent in the Shelf Caverns. Its last transponder fix is on your sonar. Find the wreck and read the captain\'s log.', target: 'kestrel' },
  { title: 'Recover the black box', text: 'Recover the Kestrel\'s flight recorder from the wreck site (hold near it and press E).', target: 'blackbox' },
  { title: 'Return the black box', text: 'Bring the black box home to Anchor Station for playback.', target: 'station' },
  { title: 'Find the missing crew', text: 'The lifepod beacon last registered at Vesna Research Station (~1,400 m). Find out what happened to the crew.', target: 'vesna' },
  { title: 'Repair Deep Relay 7', text: 'Reach Relay 7 in the Hadal Throat (~2,250 m, needs Composite Plating) with 4 Titanium and 2 Copper, then hold E to repair it. Repairs are loud.', target: 'relay' },
  { title: 'Bring the data home', text: 'Return to Anchor Station with the triangulation data.', target: 'station' },
  { title: 'Descend into the Trench', text: 'Fit the Trench-Rated Hull and follow the signal to the Trench floor (~3,500 m).', target: 'abyss' },
  { title: 'The signal answered', text: 'Story complete. The Kharon Sea is still yours to mine — for now.', target: null },
];

const SALVAGE_NAMES = ['Survey drone S-14', 'Flight recorder of mining sub PIKE', 'Sensor buoy 22-B', 'Core sample canister', 'Flight recorder of DSV TERN', 'Hydrophone pod H-3'];

const TUTORIAL = [
  { text: 'Welcome aboard, pilot. Review the station menu, then press <b>LAUNCH</b> to undock.', check: g => !g.docked },
  { text: 'Steer with <b>W A S D</b>. Hold <b>SHIFT</b> for silent running — slow, but quiet.', check: g => g.tut.moved > 300 },
  { text: 'It is dark down here. Press <b>SPACE</b> to ping sonar — echoes outline the cave. Pings are loud.', check: g => g.tut.pinged },
  { text: 'Your floodlight follows the mouse. Press <b>F</b> to toggle it. Light shows the way, but some things are drawn to it.', check: g => g.tut.toggled },
  { text: 'Find glinting ore in the walls. Aim with the mouse and hold <b>LEFT CLICK</b> to cut it free.', check: g => g.tut.mined >= 1 },
  { text: 'Mine 5 units of ore. Watch the <b>NOISE</b> meter — mining is loud. <b>Right click</b> launches a decoy flare.', check: g => g.tut.mined >= 5 },
  { text: 'Return to Anchor Station (the diamond on your sonar) and press <b>E</b> near the docking clamp.', check: g => g.docked },
  { text: 'Sell cargo, repair and buy upgrades. The <b>MISSIONS</b> tab has the Kestrel investigation. <b>TAB</b> opens the map.', check: g => !g.docked },
];

const Missions = {
  stage(g) { return g.profile.story.stage; },

  targetPos(g) {
    const P = g.world.pois, st = g.profile.story;
    const s = STORY_STAGES[st.stage];
    if (!s || !s.target) return null;
    switch (s.target) {
      case 'kestrel': return { x: P.kestrel.x, y: P.kestrel.floorY - 20 };
      case 'blackbox': return { x: P.kestrel.x - 57, y: P.kestrel.floorY - 6 };
      case 'station': return { x: P.station.dockX, y: P.station.dockY };
      case 'vesna': return { x: P.vesna.x + 176, y: P.vesna.floorY - 12 };
      case 'relay': return { x: P.relay.x, y: P.relay.floorY - 30 };
      case 'abyss': return { x: P.abyss.x, y: P.abyss.y };
    }
    return null;
  },

  objectiveHtml(g) {
    const st = g.profile.story;
    const s = STORY_STAGES[st.stage];
    let html = s.title;
    if (st.stage === 4) {
      const ti = g.sub.cargo.titanium || 0, cu = g.sub.cargo.copper || 0;
      html += ` <span class="sec">Titanium ${Math.min(ti, 4)}/4 · Copper ${Math.min(cu, 2)}/2</span>`;
    }
    if (st.stage === 6 && g.profile.upgrades.hull < 4) html += '<span class="sec">Requires Trench-Rated Hull</span>';
    const active = g.profile.contracts.filter(c => c.type === 'salvage' && c.carried);
    if (active.length) html += `<span class="sec">Carrying: ${active.map(c => c.name).join(', ')}</span>`;
    if (st.blackBox) html += '<span class="sec">Carrying: Kestrel black box</span>';
    return html;
  },

  interactables(g) {
    const P = g.world.pois, st = g.profile.story;
    const list = [
      { id: 'rig', x: P.rig.x, y: P.rig.floorY - 30, kind: 'log', label: 'Read maintenance scrawl' },
      { id: 'kestrel', x: P.kestrel.x, y: P.kestrel.floorY - 22, kind: 'log', label: 'Access the Kestrel\'s log' },
      { id: 'vesna1', x: P.vesna.x - 108, y: P.vesna.floorY - 22, kind: 'log', label: 'Read evacuation notice' },
      { id: 'vesna2', x: P.vesna.x + 176, y: P.vesna.floorY - 14, kind: 'log', label: 'Play lifepod recorder' },
      { id: 'skeleton', x: P.skeleton.x + 440, y: P.skeleton.floorY - 50, kind: 'log', label: 'Recover field note' },
      { id: 'marrow', x: P.marrow.x, y: P.marrow.floorY - 22, kind: 'log', label: 'Listen to distress loop' },
      { id: 'relay', x: P.relay.x - 36, y: P.relay.floorY - 14, kind: 'log', label: 'Read maintenance plate' },
      { id: 'gate', x: P.gate.x, y: P.gate.y, kind: 'log', label: 'Examine the spires' },
    ];
    if (st.stage <= 1 && !st.blackBox) list.push({ id: 'blackbox', x: P.kestrel.x - 57, y: P.kestrel.floorY - 8, kind: 'pickup', label: 'Recover the black box' });
    if (st.stage === 4) list.push({ id: 'repair', x: P.relay.x + 6, y: P.relay.floorY - 30, kind: 'repair', label: 'Repair Deep Relay 7' });
    for (const c of g.profile.contracts) if (c.type === 'salvage' && !c.carried) list.push({ id: 'salvage:' + c.id, x: c.x, y: c.y, kind: 'salvage', label: 'Recover ' + c.name, contract: c });
    return list;
  },

  interact(g, it) {
    const st = g.profile.story;
    if (it.kind === 'log') {
      g.readLog(it.id);
      if (it.id === 'kestrel' && st.stage === 0) this.setStage(g, 1);
      if (it.id === 'vesna2' && st.stage === 3) this.setStage(g, 4);
    } else if (it.kind === 'pickup' && it.id === 'blackbox') {
      st.blackBox = true;
      if (st.stage < 2) this.setStage(g, 2);
      AudioSys.sfx.collect();
      g.msg('Black box recovered. Bring it home.', 'story');
    } else if (it.kind === 'salvage') {
      it.contract.carried = true;
      AudioSys.sfx.collect();
      g.msg(it.contract.name + ' recovered. Return it to Anchor Station.', 'story');
    }
  },

  canRepair(g) { return (g.sub.cargo.titanium || 0) >= 4 && (g.sub.cargo.copper || 0) >= 2; },

  completeRepair(g) {
    const st = g.profile.story;
    g.sub.cargo.titanium -= 4; g.sub.cargo.copper -= 2;
    if (!g.sub.cargo.titanium) delete g.sub.cargo.titanium;
    if (!g.sub.cargo.copper) delete g.sub.cargo.copper;
    st.relayRepaired = true;
    this.setStage(g, 5);
    AudioSys.sfx.relayOnline();
    g.readLog('relay_online');
  },

  setStage(g, n) {
    g.profile.story.stage = n;
    const s = STORY_STAGES[n];
    if (s) g.msg('Objective: ' + s.title, 'story');
  },

  onDock(g) {
    const st = g.profile.story;
    const out = [];
    if (st.blackBox && st.stage === 2) {
      st.blackBox = false;
      this.setStage(g, 3);
      out.push('blackbox');
    } else if (st.blackBox) {
      st.blackBox = false;
    }
    if (st.stage === 5) {
      st.trenchUnlocked = true;
      this.setStage(g, 6);
      out.push('relay_home');
    }
    for (const c of g.profile.contracts.slice()) {
      if (c.type === 'salvage' && c.carried) {
        g.profile.credits += c.reward;
        g.profile.stats.earned += c.reward;
        g.msg(`Contract complete: ${c.name} — ₵${c.reward}`, 'story');
        this.removeContract(g, c);
      }
    }
    return out;
  },

  onDeath(g) {
    const st = g.profile.story;
    if (st.blackBox) { st.blackBox = false; if (st.stage === 2) st.stage = 1; }
    for (const c of g.profile.contracts) if (c.carried) c.carried = false;
  },

  /* ---------- contracts ---------- */
  ensureContracts(g) {
    const p = g.profile;
    while (p.contracts.length < 3) p.contracts.push(this.makeContract(g));
  },
  removeContract(g, c) {
    const p = g.profile;
    p.contracts = p.contracts.filter(x => x !== c);
    this.ensureContracts(g);
  },
  makeContract(g) {
    const p = g.profile, w = g.world;
    const id = ++p.contractSeq;
    const lvl = p.upgrades.hull;
    const maxZone = lvl >= 2 ? 3 : lvl >= 1 ? 2 : 1;
    if (Math.random() < 0.6) {
      const pool = maxZone >= 3 ? RES_ORDER : maxZone >= 2 ? ['iron', 'copper', 'titanium', 'fuel'] : ['iron', 'copper', 'fuel'];
      const res = pool[randInt(0, pool.length - 1)];
      const qty = res === 'resonite' ? randInt(2, 3) : randInt(4, 9);
      const reward = Math.round(qty * RESOURCES[res].price * 1.7 + 25);
      return { id, type: 'deliver', res, qty, reward, title: `Supply order: ${qty}× ${RESOURCES[res].name}`, text: 'Delivered from your cargo hold while docked. Pays well above market rate.' };
    }
    const zone = randInt(1, maxZone);
    const Z = ZONES[zone];
    let pos = null;
    for (let i = 0; i < 300 && !pos; i++) {
      const pt = w.randomPathPt(Z.y0 + 8, Math.min(Z.y1 - 8, zone === 1 ? 190 : Z.y1 - 8));
      if (!pt) continue;
      const tx = Math.floor(pt[0]), ty = Math.floor(pt[1]);
      if (w.solid(tx, ty)) continue;
      let fy = ty;
      while (fy < ty + 20 && !w.solid(tx, fy + 1)) fy++;
      if (!w.solid(tx, fy + 1)) continue;
      pos = { x: tx * TILE + 8, y: (fy + 1) * TILE - 5 };
    }
    if (!pos) return this.makeContract(g);
    const used = p.contracts.map(c => c.name);
    const free = SALVAGE_NAMES.filter(n => !used.includes(n));
    const name = free[randInt(0, free.length - 1)] || SALVAGE_NAMES[0];
    const depth = Math.round(w.depthM(pos.y) / 10) * 10;
    return { id, type: 'salvage', name, x: pos.x, y: pos.y, carried: false, reward: 110 + zone * 120, title: `Recover: ${name}`, text: `Last known position marked on sonar at ~${depth} m.` };
  },
  deliver(g, c) {
    const sub = g.sub;
    if ((sub.cargo[c.res] || 0) < c.qty) return false;
    sub.cargo[c.res] -= c.qty;
    if (!sub.cargo[c.res]) delete sub.cargo[c.res];
    g.profile.credits += c.reward;
    g.profile.stats.earned += c.reward;
    this.removeContract(g, c);
    return true;
  },

  /* ---------- tutorial ---------- */
  tutorialText(g) {
    const t = g.profile.tutorial;
    if (!t.active || !g.settings.tutorial) return null;
    const step = TUTORIAL[t.step];
    return step ? step.text : null;
  },
  updateTutorial(g) {
    const t = g.profile.tutorial;
    if (!t.active) return;
    const step = TUTORIAL[t.step];
    if (!step) { t.active = false; return; }
    if (step.check(g)) {
      t.step++;
      if (t.step >= TUTORIAL.length) t.active = false;
      else if (g.settings.tutorial) AudioSys.sfx.click();
    }
  },
};
