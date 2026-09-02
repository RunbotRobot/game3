import { createRenderer } from '../engine3d.js';

/**
 * A third-person 3D space you walk through with a thumbstick, instead of a
 * typed sentence or a tapped node. This is the default way to move now: it
 * replaces grid/nodes as the primary travel mechanic (they still exist and
 * still work, but installing them alongside this is redundant and confusing —
 * see the note in prompt()).
 *
 * The model authors geography the same way grid/nodes already author theirs:
 * a delta channel under world.* that this mechanic absorbs into its own
 * mech-state record each turn, then clears.
 *   world.walkPlaces.<place-id> = { floorSize, floorColor, spawn:{x,z}, props:[...], exits:[...] }
 *   world.walkAt = "<place-id>"                 // set to change where the player is
 *
 * The renderer, GL buffers and the RAF loop are NOT JSON-safe, so they live on
 * `g.scene3d` (a plain property on the game object) rather than in g.mech('walk') —
 * exactly the same split stage.js uses for its particle field.
 */
export default {
  id: 'walk',
  name: 'The Walked World',
  blurb: 'You have a body here, and the world has a shape. Move with the stick.',

  install(g) {
    const s = g.mech('walk');
    s.avatar = s.avatar || { x: 0, z: 0, heading: 0 };
    s.places = s.places || {};
    s.current = s.current || null;
    if (!s.current || !s.places[s.current]) {
      s.current = s.current || 'start';
      s.places[s.current] = s.places[s.current] || defaultRoom();
      s.avatar.x = s.places[s.current].spawn.x;
      s.avatar.z = s.places[s.current].spawn.z;
    }

    if (!g.scene3d) g.scene3d = createScene(g);
    if (!g.scene3d) { g.ui.system('⟡ this browser cannot draw the 3D scene — staying with text only.'); return; }
    g.scene3d.setPlace(s.current, s.places[s.current]);
    g.scene3d.show();
    g.scene3d.start();
  },

  uninstall(g) {
    g.scene3d?.hide();
    g.scene3d?.stop();
  },

  prompt(g) {
    const s = g.mech('walk');
    const here = s.places[s.current];
    const propList = (here?.props || []).map((p) => `${p.id}:${p.shape}:"${p.label}"@${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(', ') || '(bare)';
    const exitList = (here?.exits || []).map((e) => `${e.id}→"${e.to}"`).join(', ') || '(none)';
    const otherPlaces = Object.keys(s.places).filter((id) => id !== s.current);
    return `THE WALKED WORLD is the primary way the player moves — a 3D space, not a sentence. `
      + `Current place: "${s.current}". Props here: ${propList}. Exits here: ${exitList}. `
      + `Other places that exist: ${otherPlaces.join(', ') || '(none yet)'}.\n`
      + `Shape or reshape the CURRENT place with {"op":"set","path":"world.walkPlaces.${s.current}","value":`
      + `{"floorSize":40,"floorColor":"#hex","gridColor":"#hex","spawn":{"x":0,"z":0},`
      + `"props":[{"id":"desk","x":3,"z":-2,"w":2,"h":1,"d":1,"color":"#hex","shape":"table","label":"a heavy desk"}],`
      + `"exits":[{"id":"door","x":0,"z":-18,"r":2,"to":"the hallway","label":"the north door"}]}}. `
      + `x/z are metres from the room's own centre; the player is roughly 1.75 units tall. Keep floorSize between 16 and 60. `
      + `2 to 8 props, 1 to 3 exits. w/h/d is the bounding box the shape is built inside, not a literal box — pick `
      + `"shape" for each prop from: box, pillar, table, chest, shelf, lamp, tree, person. Match the shape to the label `
      + `(a desk is a table, a wardrobe is a shelf, a statue or a stranger is a person). Every prop is a small 3D model `
      + `now, and its label is HIDDEN until the player taps it — so the shape and position have to carry the scene on `
      + `their own; don't rely on the label being visible to explain what something is. `
      + `"to" is the plain name of the place an exit leads to — write it as if a sign said it. `
      + `Move the player there with {"op":"set","path":"world.walkAt","value":"<place-id>"} — use the SAME id every time `
      + `you mean the same place, so it doesn't get redrawn as somewhere new. `
      + `The player triggers an exit by walking their avatar into it; that arrives to you as `
      + `"(walk through <label> into <to>)". Build the destination's own world.walkPlaces entry in that same reply. `
      + `Do not also install grid or nodes — they are 2D top-down travel schemes and installing one alongside this `
      + `is the same feature twice, and will read as broken. If you want a moment of pure text, that's fine — you don't `
      + `have to route every beat through the room; but movement itself always belongs here.`;
  },

  afterTurn(g) {
    const s = g.mech('walk');
    const w = g.state.world;
    let touched = false;
    for (const [id, spec] of Object.entries(w.walkPlaces || {})) {
      if (spec === null) { delete s.places[id]; continue; }
      if (!spec || typeof spec !== 'object') continue;
      s.places[id] = sanitizePlace(spec, s.places[id]);
      touched = true;
    }
    w.walkPlaces = {};

    if (w.walkAt && w.walkAt !== s.current) {
      s.current = w.walkAt;
      const here = s.places[s.current];
      if (here) { s.avatar.x = here.spawn.x; s.avatar.z = here.spawn.z; }
      touched = true;
    }
    w.walkAt = '';

    if (touched && g.scene3d) g.scene3d.setPlace(s.current, s.places[s.current]);
  },

  keydown(g, e) {
    return g.scene3d?.keydown?.(e) || false;
  },
};

const SHAPES = ['box', 'pillar', 'table', 'chest', 'shelf', 'lamp', 'tree', 'person'];

function defaultRoom() {
  return {
    floorSize: 24, floorColor: '#23262e', gridColor: '#2f3440',
    spawn: { x: 0, z: 6 },
    props: [{ id: 'pillar', x: 0, z: -4, w: 1.2, h: 3, d: 1.2, color: '#4a4f5c', shape: 'pillar', label: 'a stone pillar' }],
    exits: [{ id: 'out', x: 0, z: -11, r: 2, to: 'the way outside', label: 'a doorway' }],
  };
}

function sanitizePlace(v, prev) {
  const num = (n, d) => (Number.isFinite(+n) ? +n : d);
  return {
    floorSize: Math.min(60, Math.max(12, num(v.floorSize, prev?.floorSize ?? 24))),
    floorColor: isHex(v.floorColor) ? v.floorColor : (prev?.floorColor ?? '#23262e'),
    gridColor: isHex(v.gridColor) ? v.gridColor : (prev?.gridColor ?? '#2f3440'),
    spawn: { x: num(v.spawn?.x, prev?.spawn?.x ?? 0), z: num(v.spawn?.z, prev?.spawn?.z ?? 0) },
    props: Array.isArray(v.props) ? v.props.slice(0, 10).map((p, i) => ({
      id: String(p.id || `p${i}`).slice(0, 24),
      x: num(p.x, 0), z: num(p.z, 0),
      w: Math.min(8, Math.max(0.2, num(p.w, 1))), h: Math.min(8, Math.max(0.2, num(p.h, 1))), d: Math.min(8, Math.max(0.2, num(p.d, 1))),
      ry: num(p.ry, 0),
      color: isHex(p.color) ? p.color : '#5a5f6c',
      shape: SHAPES.includes(p.shape) ? p.shape : 'box',
      label: String(p.label || '').slice(0, 40),
    })) : (prev?.props ?? []),
    exits: Array.isArray(v.exits) ? v.exits.slice(0, 5).map((e, i) => ({
      id: String(e.id || `e${i}`).slice(0, 24),
      x: num(e.x, 0), z: num(e.z, 0), r: Math.min(4, Math.max(1, num(e.r, 2))),
      to: String(e.to || '').slice(0, 40), label: String(e.label || e.to || 'a way out').slice(0, 40),
      _triggered: prev?.exits?.find((pe) => pe.id === e.id)?._triggered ?? false,
    })) : (prev?.exits ?? []),
  };
}

const isHex = (v) => typeof v === 'string' && /^#([0-9a-f]{6})$/i.test(v.trim());

// --- shape kits ---------------------------------------------------------
// Every prop is a small kit of boxes, not one undifferentiated block. Each
// kit takes the sanitized prop (its x/z position, its w/h/d bounding box, its
// color, and an optional rotation ry) and returns fully world-placed boxes —
// the same {x,y,z,w,h,d,color,ry} shape engine3d.js already draws.

function shadeHex(hex, amt) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (shift) => Math.max(0, Math.min(255, ((n >> shift) & 255) + Math.round(amt * 255)));
  return `#${[16, 8, 0].map((shift) => ch(shift).toString(16).padStart(2, '0')).join('')}`;
}

/** dx = the object's own right, dz = the object's own forward. Verified against
 *  the camera's proven eye-offset formula in tick() — do not "simplify" this to
 *  match old code that used a different (unverified) sign convention. */
function localToWorld(cx, cz, ry, dx, dz) {
  return [cx + dx * Math.cos(ry) + dz * Math.sin(ry), cz + dx * Math.sin(ry) - dz * Math.cos(ry)];
}

/** Shared by the player avatar and the "person" prop shape, so an NPC looks
 *  like a smaller, differently-coloured relative of the player, not a stranger
 *  kind of block. Includes the face (front) and hair (back) that make facing
 *  direction readable without a HUD arrow. */
export function humanoidBoxes(cx, cz, heading, scale, bodyColor, headColor) {
  const legColor = shadeHex(bodyColor, -0.22);
  const hairColor = shadeHex(headColor, -0.55);
  const parts = [
    { dy: 0.55, w: 0.5, h: 0.7, d: 0.3, color: bodyColor },
    { dy: 1.05, w: 0.34, h: 0.34, d: 0.34, color: headColor },
    { dy: 0.55, dx: 0.32, w: 0.16, h: 0.6, d: 0.16, color: bodyColor },
    { dy: 0.55, dx: -0.32, w: 0.16, h: 0.6, d: 0.16, color: bodyColor },
    { dy: 0.05, dx: 0.14, w: 0.2, h: 0.5, d: 0.2, color: legColor },
    { dy: 0.05, dx: -0.14, w: 0.2, h: 0.5, d: 0.2, color: legColor },
    // face: two eyes on the side of the head the avatar is walking toward
    { dy: 1.09, dx: 0.08, dz: 0.16, w: 0.06, h: 0.06, d: 0.03, color: '#181a1e' },
    { dy: 1.09, dx: -0.08, dz: 0.16, w: 0.06, h: 0.06, d: 0.03, color: '#181a1e' },
    // hair: a cap over the back of the head — the side that faces the camera
    { dy: 1.15, dz: -0.09, w: 0.33, h: 0.24, d: 0.22, color: hairColor },
  ];
  return parts.map((part) => {
    const [wx, wz] = localToWorld(cx, cz, heading, (part.dx || 0) * scale, (part.dz || 0) * scale);
    return { x: wx, y: part.dy * scale, z: wz, w: part.w * scale, h: part.h * scale, d: part.d * scale, color: part.color, ry: heading };
  });
}

const SHAPE_KITS = {
  box: (p) => [{ x: p.x, y: p.h / 2, z: p.z, w: p.w, h: p.h, d: p.d, color: p.color, ry: p.ry }],

  pillar: (p) => {
    const capH = Math.min(0.3, p.h * 0.14);
    return [
      { x: p.x, y: capH / 2, z: p.z, w: p.w * 1.25, h: capH, d: p.d * 1.25, color: p.color, ry: p.ry },
      { x: p.x, y: capH + (p.h - 2 * capH) / 2, z: p.z, w: p.w, h: p.h - 2 * capH, d: p.d, color: p.color, ry: p.ry },
      { x: p.x, y: p.h - capH / 2, z: p.z, w: p.w * 1.25, h: capH, d: p.d * 1.25, color: p.color, ry: p.ry },
    ];
  },

  table: (p) => {
    const topH = Math.min(0.12, p.h * 0.16);
    const legW = Math.max(0.06, Math.min(p.w, p.d) * 0.08);
    const insetX = p.w / 2 - legW * 1.5, insetZ = p.d / 2 - legW * 1.5;
    const legColor = shadeHex(p.color, -0.18);
    const legs = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => {
      const [wx, wz] = localToWorld(p.x, p.z, p.ry, sx * insetX, sz * insetZ);
      return { x: wx, y: (p.h - topH) / 2, z: wz, w: legW, h: p.h - topH, d: legW, color: legColor, ry: p.ry };
    });
    return [...legs, { x: p.x, y: p.h - topH / 2, z: p.z, w: p.w, h: topH, d: p.d, color: p.color, ry: p.ry }];
  },

  chest: (p) => {
    const lidH = Math.min(0.18, p.h * 0.28);
    return [
      { x: p.x, y: (p.h - lidH) / 2, z: p.z, w: p.w, h: p.h - lidH, d: p.d, color: p.color, ry: p.ry },
      { x: p.x, y: p.h - lidH / 2, z: p.z, w: p.w * 1.03, h: lidH, d: p.d * 1.03, color: shadeHex(p.color, 0.15), ry: p.ry },
    ];
  },

  shelf: (p) => {
    const backW = Math.max(0.06, p.w * 0.08);
    const [bx, bz] = localToWorld(p.x, p.z, p.ry, 0, -(p.d / 2 - backW / 2));
    const boardColor = shadeHex(p.color, -0.1);
    const boards = [0.22, 0.52, 0.82].map((f) => ({
      x: p.x, y: p.h * f, z: p.z, w: p.w, h: Math.max(0.05, p.h * 0.045), d: p.d, color: boardColor, ry: p.ry,
    }));
    return [{ x: bx, y: p.h / 2, z: bz, w: p.w, h: p.h, d: backW, color: p.color, ry: p.ry }, ...boards];
  },

  lamp: (p) => {
    const poleW = Math.max(0.08, Math.min(p.w, p.d) * 0.16);
    const shadeH = Math.min(0.4, p.h * 0.32);
    return [
      { x: p.x, y: (p.h - shadeH) / 2, z: p.z, w: poleW, h: p.h - shadeH, d: poleW, color: shadeHex(p.color, -0.25), ry: p.ry },
      { x: p.x, y: p.h - shadeH / 2, z: p.z, w: p.w, h: shadeH, d: p.d, color: shadeHex(p.color, 0.3), ry: p.ry },
    ];
  },

  tree: (p) => {
    const trunkH = p.h * 0.4;
    const trunkW = Math.max(0.15, Math.min(p.w, p.d) * 0.25);
    return [
      { x: p.x, y: trunkH / 2, z: p.z, w: trunkW, h: trunkH, d: trunkW, color: '#5c4530', ry: p.ry },
      { x: p.x, y: trunkH + (p.h - trunkH) / 2, z: p.z, w: p.w, h: p.h - trunkH, d: p.d, color: p.color, ry: p.ry },
    ];
  },

  person: (p) => humanoidBoxes(p.x, p.z, p.ry, p.h / 1.75, p.color, shadeHex(p.color, 0.4)),
};

function expandProp(p) {
  return (SHAPE_KITS[p.shape] || SHAPE_KITS.box)(p);
}

// --- the live scene: renderer, avatar, camera, joystick, RAF loop -----------

const AVATAR_RADIUS = 0.4;
const SPEED = 4.2;       // metres/second
const TURN_RATE = 2.6;       // radians/second at full stick deflection (move stick, left/right)
const VIEW_TURN_RATE = 3.2;  // radians/second at full stick deflection (view stick)
const REVEAL_MS = 3500;

function createScene(g) {
  const canvas = document.querySelector('#scene3d');
  const renderer = canvas && createRenderer(canvas);
  if (!renderer) return null;

  const overlayEl = document.querySelector('#walk-labels');
  const joystick = createJoystick('#joystick', '#joystick-knob');
  const viewStick = createJoystick('#joystick-view', '#joystick-view-knob');
  const keys = { up: false, down: false, left: false, right: false };

  let running = false;
  let raf = null;
  let last = 0;
  let place = null;            // the live sanitized place spec
  let propBoxes = [];          // expanded shape-kit boxes, rebuilt only on setPlace()
  let exitMarkers = [];        // thin floor discs marking exits, same cadence
  let saveTimer = 0;
  let cameraYaw = 0;           // smoothed, radians — also what movement is relative to

  const marks = new Map();     // id -> { hotspot, label, anchor: [x,y,z], footprint, revealedUntil }

  function setPlace(id, spec) {
    place = spec;
    propBoxes = (place?.props || []).flatMap(expandProp);
    // A thin floor marker so an exit is visible before it's ever tapped —
    // color is resolved at render time from the live --accent, not stored.
    exitMarkers = (place?.exits || []).map((e) => ({
      x: e.x, y: 0.03, z: e.z, w: e.r * 1.5, h: 0.06, d: e.r * 1.5, ry: 0,
    }));
    syncMarks();
  }

  function syncMarks() {
    const wanted = new Map();
    for (const p of place?.props || []) if (p.label) wanted.set(`prop:${p.id}`, { anchor: [p.x, p.h + 0.35, p.z], half: Math.max(p.w, p.d) / 2, text: p.label });
    for (const e of place?.exits || []) if (e.label) wanted.set(`exit:${e.id}`, { anchor: [e.x, 1.5, e.z], half: e.r * 0.9, text: e.label });
    for (const [key, m] of marks) {
      if (wanted.has(key)) continue;
      m.hotspot.remove(); m.label.remove(); marks.delete(key);
    }
    for (const [key, info] of wanted) {
      let m = marks.get(key);
      if (!m) {
        const hotspot = document.createElement('div');
        hotspot.className = 'walk-hotspot';
        const label = document.createElement('div');
        label.className = 'walk-label';
        overlayEl.append(hotspot, label);
        m = { hotspot, label, revealedUntil: 0 };
        wireHotspot(m);
        marks.set(key, m);
      }
      m.anchor = info.anchor;
      m.half = info.half;
      if (m.label.textContent !== info.text) m.label.textContent = info.text;
    }
  }

  function wireHotspot(m) {
    // Same click-through guard as floaters/rig: a touch fires a synthesized
    // click after pointerup, and it must never reach the joystick or scene
    // behind this. Tapping reveals the label; tapping again just refreshes it.
    m.hotspot.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    m.hotspot.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      m.revealedUntil = performance.now() + REVEAL_MS;
    });
  }

  function resolveCollisions(x, z) {
    for (const p of place?.props || []) {
      const hx = p.w / 2 + AVATAR_RADIUS, hz = p.d / 2 + AVATAR_RADIUS;
      const dx = x - p.x, dz = z - p.z;
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
        const pushX = hx - Math.abs(dx), pushZ = hz - Math.abs(dz);
        if (pushX < pushZ) x += Math.sign(dx || 1) * pushX;
        else z += Math.sign(dz || 1) * pushZ;
      }
    }
    return [x, z];
  }

  function tick(t) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    if (!place) return;

    const s = g.mech('walk');
    const a = s.avatar;

    let ix = joystick.vector.x, iz = joystick.vector.z;
    if (keys.up) iz -= 1; if (keys.down) iz += 1; if (keys.left) ix -= 1; if (keys.right) ix += 1;
    const mag = Math.hypot(ix, iz);
    let moved = false;
    if (mag > 0.05 && !g.busy) {
      const clamped = Math.min(1, mag);
      const nix = ix / (mag || 1), niz = iz / (mag || 1);
      // Steering, not "rotate the input by the camera": left/right turns the
      // avatar directly (heading is sticky between pushes); up/down moves
      // along whichever way it's already facing. Deriving heading from a
      // camera-rotated input instead — the first thing tried here — feeds
      // back on itself: the camera chases heading, so rotating input by the
      // camera's own angle turns holding "right" into a runaway spin rather
      // than a turn that settles. Direct steering has no such loop, and it's
      // what "holding up should keep going the way I'm already facing" means.
      a.heading = wrapAngle(a.heading + nix * TURN_RATE * clamped * dt);
      const forwardX = Math.sin(a.heading), forwardZ = -Math.cos(a.heading);
      const dist = -niz * clamped * SPEED * dt;
      const half = place.floorSize / 2 - AVATAR_RADIUS;
      let nx = Math.min(half, Math.max(-half, a.x + forwardX * dist));
      let nz = Math.min(half, Math.max(-half, a.z + forwardZ * dist));
      [nx, nz] = resolveCollisions(nx, nz);
      if (nx !== a.x || nz !== a.z) moved = true;
      a.x = nx; a.z = nz;
    }

    // The view stick is a second way to turn the avatar, not a separate
    // camera-only concept — the two sticks only cohere as a pair once "which
    // way I'm looking" and "which way I'm facing" are the same thing. Same
    // direct-steering math as the move stick's left/right (raw stick input,
    // never derived from the camera's own angle, so this can't reopen the
    // feedback loop a camera-relative turn caused earlier in this file).
    const viewMag = Math.hypot(viewStick.vector.x, viewStick.vector.z);
    if (viewMag > 0.15 && !g.busy) {
      a.heading = wrapAngle(a.heading + (viewStick.vector.x / viewMag) * Math.min(1, viewMag) * VIEW_TURN_RATE * dt);
    }

    // Third-person chase camera: always settles directly behind wherever the
    // avatar is currently facing, smoothed so a turn doesn't snap the view.
    cameraYaw = lerpAngle(cameraYaw, a.heading, Math.min(1, dt * 6));
    const back = 6.5, height = 4.2;
    const eye = [a.x - Math.sin(cameraYaw) * back, height, a.z + Math.cos(cameraYaw) * back];
    const target = [a.x, 1.1, a.z];
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0b0d10';
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7fd1c1';

    renderer.frame({ eye, target }, {
      floorSize: place.floorSize, floorColor: place.floorColor, gridColor: place.gridColor, fogColor: bg,
      boxes: [
        ...exitMarkers.map((m) => ({ ...m, color: accent })),
        ...propBoxes,
        ...humanoidBoxes(a.x, a.z, a.heading, 1, '#e0a83f', '#f2c774'),
      ],
    });

    const now = performance.now();
    for (const m of marks.values()) updateMark(m, now);
    checkExits(a);

    if (moved) {
      saveTimer += dt;
      if (saveTimer > 3) { saveTimer = 0; g.save(); }
    }
  }

  function updateMark(m, now) {
    const revealed = now < m.revealedUntil;
    const p = renderer.project(m.anchor);
    if (!p.visible) { m.hotspot.style.display = 'none'; m.label.style.display = 'none'; return; }

    const rim = renderer.project([m.anchor[0] + m.half, m.anchor[1], m.anchor[2]]);
    const size = rim.visible ? Math.max(34, Math.min(160, Math.hypot(rim.x - p.x, rim.y - p.y) * 2)) : 44;
    m.hotspot.style.display = '';
    m.hotspot.style.width = m.hotspot.style.height = `${size}px`;
    m.hotspot.style.transform = `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`;
    // When two hotspots overlap on screen — a big exit marker behind a small
    // prop, say — the smaller, more precise one should win the tap, not
    // whichever happens to sit later in the DOM. Smaller size -> higher stack.
    m.hotspot.style.zIndex = String(Math.round(2000 - size));

    if (revealed) {
      m.label.style.display = '';
      m.label.style.transform = `translate(-50%, -100%) translate(${p.x}px, ${p.y - size / 2 - 4}px)`;
    } else {
      m.label.style.display = 'none';
    }
  }

  function checkExits(a) {
    if (g.busy) return;
    for (const e of place.exits || []) {
      const d = Math.hypot(a.x - e.x, a.z - e.z);
      if (d < e.r && !e._triggered) {
        e._triggered = true;
        g.submit(`(walk through ${e.label} into ${e.to})`);
      } else if (d > e.r * 1.6) {
        e._triggered = false;
      }
    }
  }

  function start() {
    if (running) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', renderer.resize);
    renderer.resize();
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    window.removeEventListener('resize', renderer.resize);
  }
  function show() {
    document.querySelector('#stage').hidden = true;
    canvas.hidden = false;
    overlayEl.hidden = false;
    document.querySelector('#log-peek').hidden = false;
    joystick.show();
    viewStick.show();
    document.body.classList.add('walk-active');
    // #log-peek just became the status stack's real bottom edge instead of
    // #goal-bar — measure it now, not on whatever render happens to run next.
    g.ui.syncStatusHeight();
  }
  function hide() {
    document.querySelector('#stage').hidden = false;
    canvas.hidden = true;
    overlayEl.hidden = true;
    document.querySelector('#log-peek').hidden = true;
    joystick.hide();
    viewStick.hide();
    // Leaving walk mode with the log drawer open would otherwise strand the
    // player on a "display:none" drawer they have no way to close, since its
    // own toggle only exists in walk-active CSS.
    document.body.classList.remove('walk-active', 'log-open');
    for (const m of marks.values()) { m.hotspot.remove(); m.label.remove(); }
    marks.clear();
  }

  function onKey(e, down) {
    const map = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
      ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
    const k = map[e.key];
    if (!k) return false;
    keys[k] = down;
    return true;
  }
  window.addEventListener('keyup', (e) => onKey(e, false));

  return { setPlace, start, stop, show, hide, keydown: (e) => onKey(e, true) };
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Keeps a heading that steers directly (accumulates every frame) from
 *  drifting into a huge real number over a long session — turning in circles
 *  for an hour would otherwise erode float precision. */
function wrapAngle(a) {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

/** A drag-anywhere-on-the-pad thumbstick. Reports a live, normalized {x,z} —
 *  screen-relative (up/down/left/right on the pad); tick() rotates it into
 *  world space by the current camera yaw. */
function createJoystick(padSel, knobSel) {
  const pad = document.querySelector(padSel);
  const knob = document.querySelector(knobSel);
  const vector = { x: 0, z: 0 };
  const radius = 42;

  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pad.setPointerCapture(e.pointerId);
    update(e);
    const move = (ev) => update(ev);
    const end = () => {
      pad.removeEventListener('pointermove', move);
      pad.removeEventListener('pointerup', end);
      pad.removeEventListener('pointercancel', end);
      vector.x = 0; vector.z = 0;
      knob.style.transition = 'transform .15s ease';
      knob.style.transform = 'translate(-50%, -50%)';
      setTimeout(() => { knob.style.transition = ''; }, 160);
    };
    pad.addEventListener('pointermove', move);
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  });

  function update(e) {
    const r = pad.getBoundingClientRect();
    const cx = e.clientX - (r.left + r.width / 2), cy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(cx, cy) || 1;
    const clamped = Math.min(1, len / radius);
    vector.x = (cx / len) * clamped;
    vector.z = (cy / len) * clamped;
    knob.style.transform = `translate(-50%, -50%) translate(${vector.x * radius}px, ${vector.z * radius}px)`;
  }

  return { vector, show: () => { pad.hidden = false; }, hide: () => { pad.hidden = true; } };
}
