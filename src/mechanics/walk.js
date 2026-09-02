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
    const propList = (here?.props || []).map((p) => `${p.id}:"${p.label}"@${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(', ') || '(bare)';
    const exitList = (here?.exits || []).map((e) => `${e.id}→"${e.to}"`).join(', ') || '(none)';
    const otherPlaces = Object.keys(s.places).filter((id) => id !== s.current);
    return `THE WALKED WORLD is the primary way the player moves — a 3D space, not a sentence. `
      + `Current place: "${s.current}". Props here: ${propList}. Exits here: ${exitList}. `
      + `Other places that exist: ${otherPlaces.join(', ') || '(none yet)'}.\n`
      + `Shape or reshape the CURRENT place with {"op":"set","path":"world.walkPlaces.${s.current}","value":`
      + `{"floorSize":40,"floorColor":"#hex","gridColor":"#hex","spawn":{"x":0,"z":0},`
      + `"props":[{"id":"desk","x":3,"z":-2,"w":2,"h":1,"d":1,"color":"#hex","label":"a heavy desk"}],`
      + `"exits":[{"id":"door","x":0,"z":-18,"r":2,"to":"the hallway","label":"the north door"}]}}. `
      + `x/z are metres from the room's own centre; the player is roughly 0.8 units tall. Keep floorSize between 16 and 60. `
      + `2 to 8 props, 1 to 3 exits. "to" is the plain name of the place an exit leads to — write it as if a sign said it. `
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

function defaultRoom() {
  return {
    floorSize: 24, floorColor: '#23262e', gridColor: '#2f3440',
    spawn: { x: 0, z: 6 },
    props: [{ id: 'pillar', x: 0, z: -4, w: 1.2, h: 3, d: 1.2, color: '#4a4f5c', label: 'a stone pillar' }],
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
      color: isHex(p.color) ? p.color : '#5a5f6c',
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

// --- the live scene: renderer, avatar, camera, joystick, RAF loop -----------

const AVATAR_RADIUS = 0.4;
const SPEED = 4.2;   // metres/second

function createScene(g) {
  const canvas = document.querySelector('#scene3d');
  const renderer = canvas && createRenderer(canvas);
  if (!renderer) return null;

  const labelsEl = document.querySelector('#walk-labels');
  const joystick = createJoystick();
  const keys = { up: false, down: false, left: false, right: false };

  let running = false;
  let raf = null;
  let last = 0;
  let place = null;         // the live sanitized place spec
  let saveTimer = 0;
  let cameraYaw = 0;        // smoothed, radians

  const labelNodes = new Map();   // id -> DOM node, diffed against the current place

  function setPlace(id, spec) {
    place = spec;
    syncLabels();
  }

  function syncLabels() {
    const wanted = new Set();
    for (const p of place?.props || []) if (p.label) wanted.add(`prop:${p.id}`);
    for (const e of place?.exits || []) if (e.label) wanted.add(`exit:${e.id}`);
    for (const [key, node] of labelNodes) if (!wanted.has(key)) { node.remove(); labelNodes.delete(key); }
    for (const key of wanted) {
      if (labelNodes.has(key)) continue;
      const node = document.createElement('div');
      node.className = 'walk-label';
      labelsEl.append(node);
      labelNodes.set(key, node);
    }
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

    let mx = joystick.vector.x, mz = joystick.vector.z;
    if (keys.up) mz -= 1; if (keys.down) mz += 1; if (keys.left) mx -= 1; if (keys.right) mx += 1;
    const mag = Math.hypot(mx, mz);
    let moved = false;
    if (mag > 0.05 && !g.busy) {
      mx /= mag; mz /= mag;
      const half = place.floorSize / 2 - AVATAR_RADIUS;
      let nx = Math.min(half, Math.max(-half, a.x + mx * SPEED * dt));
      let nz = Math.min(half, Math.max(-half, a.z + mz * SPEED * dt));
      [nx, nz] = resolveCollisions(nx, nz);
      if (nx !== a.x || nz !== a.z) moved = true;
      a.x = nx; a.z = nz;
      const targetHeading = Math.atan2(mx, -mz);
      a.heading = lerpAngle(a.heading, targetHeading, Math.min(1, dt * 10));
    }

    // Third-person chase camera, smoothed so quick reversals don't snap-spin it.
    cameraYaw = lerpAngle(cameraYaw, a.heading, Math.min(1, dt * 6));
    const back = 6.5, height = 4.2;
    const eye = [a.x - Math.sin(cameraYaw) * back, height, a.z + Math.cos(cameraYaw) * back];
    const target = [a.x, 1.1, a.z];

    renderer.frame({ eye, target }, {
      floorSize: place.floorSize, floorColor: place.floorColor, gridColor: place.gridColor,
      fogColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0b0d10',
      boxes: [...(place.props || []), ...avatarBoxes(a)],
    });

    for (const p of place.props || []) placeLabel(labelNodes.get(`prop:${p.id}`), p.label, [p.x, p.h + 0.3, p.z]);
    for (const e of place.exits || []) placeLabel(labelNodes.get(`exit:${e.id}`), e.label, [e.x, 1.6, e.z]);

    checkExits(a);

    if (moved) {
      saveTimer += dt;
      if (saveTimer > 3) { saveTimer = 0; g.save(); }
    }
  }

  function placeLabel(node, text, world) {
    if (!node) return;
    const p = renderer.project(world);
    if (!p.visible) { node.style.display = 'none'; return; }
    node.style.display = '';
    node.style.transform = `translate(-50%, -100%) translate(${p.x}px, ${p.y}px)`;
    if (node.textContent !== text) node.textContent = text;
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
    labelsEl.hidden = false;
    joystick.show();
  }
  function hide() {
    document.querySelector('#stage').hidden = false;
    canvas.hidden = true;
    labelsEl.hidden = true;
    joystick.hide();
    for (const node of labelNodes.values()) node.remove();
    labelNodes.clear();
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

function avatarBoxes(a) {
  const { x, z, heading } = a;
  const y = 0;
  const parts = [
    { dy: 0.55, w: 0.5, h: 0.7, d: 0.3, color: '#e0a83f' },   // torso
    { dy: 1.05, w: 0.34, h: 0.34, d: 0.34, color: '#f2c774' }, // head
    { dy: 0.55, dx: 0.32, w: 0.16, h: 0.6, d: 0.16, color: '#e0a83f' },  // arm
    { dy: 0.55, dx: -0.32, w: 0.16, h: 0.6, d: 0.16, color: '#e0a83f' }, // arm
    { dy: 0.05, dx: 0.14, w: 0.2, h: 0.5, d: 0.2, color: '#3a3f4c' },    // leg
    { dy: 0.05, dx: -0.14, w: 0.2, h: 0.5, d: 0.2, color: '#3a3f4c' },   // leg
  ];
  const cos = Math.cos(heading), sin = Math.sin(heading);
  return parts.map((p) => {
    const dx = p.dx || 0;
    return { x: x + dx * cos, y: y + p.dy, z: z - dx * sin, w: p.w, h: p.h, d: p.d, ry: heading, color: p.color };
  });
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** A drag-anywhere-on-the-pad thumbstick. Reports a live, normalized {x,z}. */
function createJoystick() {
  const pad = document.querySelector('#joystick');
  const knob = document.querySelector('#joystick-knob');
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
