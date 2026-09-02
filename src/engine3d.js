// A hand-rolled, dependency-free WebGL renderer. No Three.js, no bundler — the
// project's one rule that matters most here. It draws flat-shaded boxes and a
// procedural grid floor, which is enough geometry for a legible, walkable low-poly
// space; it is not trying to be a general engine.

// --- vec3 / mat4 -------------------------------------------------------------

const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = v3.len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

const mat4 = {
  identity: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],

  multiply(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[0 * 4 + r] * b[c * 4 + 0] + a[1 * 4 + r] * b[c * 4 + 1]
          + a[2 * 4 + r] * b[c * 4 + 2] + a[3 * 4 + r] * b[c * 4 + 3];
      }
    }
    return o;
  },

  translate: (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
  scaleXYZ: (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1],

  rotateY(rad) {
    // Sign chosen to agree with walk.js's localToWorld(), not the other
    // "equally valid" rotation direction: a box's ry must spin the same way
    // its position swings around the body's pivot, or a rigid part looks like
    // it's rotating in place against the body instead of with it. Verified
    // against the proven-correct forward vector (sin h, -cos h) the camera
    // itself uses — rotating a box's local front (0,0,-1) by this matrix has
    // to land on that same point, not its mirror.
    const c = Math.cos(rad), s = Math.sin(rad);
    return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];
  },

  perspective(fovyRad, aspect, near, far) {
    const f = 1 / Math.tan(fovyRad / 2);
    const nf = 1 / (near - far);
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ];
  },

  lookAt(eye, target, up) {
    const z = v3.norm(v3.sub(eye, target));
    const x = v3.norm(v3.cross(up, z));
    const y = v3.cross(z, x);
    return [
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -v3.dot(x, eye), -v3.dot(y, eye), -v3.dot(z, eye), 1,
    ];
  },

  /** Multiply a column-major mat4 by a point (x,y,z,1). Returns [x,y,z,w]. */
  apply(m, p) {
    const [x, y, z] = p;
    return [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
      m[3] * x + m[7] * y + m[11] * z + m[15],
    ];
  },
};

// --- geometry ------------------------------------------------------------

/** A unit box (extents ±0.5), 24 verts so every face gets its own flat normal. */
function unitBoxGeometry() {
  const faces = [
    { n: [0, 0, 1], v: [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]] },
    { n: [0, 0, -1], v: [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]] },
    { n: [1, 0, 0], v: [[.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5]] },
    { n: [-1, 0, 0], v: [[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5]] },
    { n: [0, 1, 0], v: [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5]] },
    { n: [0, -1, 0], v: [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5]] },
  ];
  const positions = [], normals = [], indices = [];
  faces.forEach((f, fi) => {
    f.v.forEach((p) => { positions.push(...p); normals.push(...f.n); });
    const base = fi * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return { positions, normals, indices };
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader compile failed: ${log}`);
  }
  return sh;
}

function link(gl, vsSrc, fsSrc) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`program link failed: ${log}`);
  }
  return prog;
}

const BOX_VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNormal = aNormal;
  gl_Position = uProj * uView * world;
}`;

const BOX_FS = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vWorld;
uniform vec3 uColor;
uniform vec3 uLightDir;
uniform vec3 uFogColor;
uniform float uFogDist;
void main() {
  float lit = max(dot(normalize(vNormal), uLightDir), 0.0);
  vec3 shaded = uColor * (0.45 + 0.55 * lit);
  float fog = clamp(length(vWorld) / uFogDist, 0.0, 1.0);
  gl_FragColor = vec4(mix(shaded, uFogColor, fog * fog), 1.0);
}`;

// A single huge quad; the grid is drawn procedurally in the fragment shader so no
// per-tile geometry is needed for what should read as an endless floor.
const GROUND_VS = `
attribute vec2 aPos;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uSize;
varying vec2 vWorld;
void main() {
  vec2 world = aPos * uSize;
  vWorld = world;
  gl_Position = uProj * uView * vec4(world.x, 0.0, world.y, 1.0);
}`;

const GROUND_FS = `
precision mediump float;
varying vec2 vWorld;
uniform vec3 uBaseColor;
uniform vec3 uLineColor;
uniform vec3 uFogColor;
uniform float uFogDist;
void main() {
  vec2 g = abs(fract(vWorld) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.06, min(g.x, g.y));
  vec3 color = mix(uBaseColor, uLineColor, line * 0.5);
  float fog = clamp(length(vWorld) / uFogDist, 0.0, 1.0);
  gl_FragColor = vec4(mix(color, uFogColor, fog * fog), 1.0);
}`;

/**
 * createRenderer(canvas) -> a minimal scene renderer. Call frame(camera, scene)
 * once per animation frame; call project(worldPos) afterward to place DOM
 * billboard labels at the same points the last frame drew them.
 */
export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'low-power' })
    || canvas.getContext('webgl', { antialias: true, powerPreference: 'low-power' });
  if (!gl) return null;

  const boxProgram = link(gl, BOX_VS, BOX_FS);
  const groundProgram = link(gl, GROUND_VS, GROUND_FS);
  const box = unitBoxGeometry();

  const boxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, boxBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(box.positions), gl.STATIC_DRAW);
  const normBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(box.normals), gl.STATIC_DRAW);
  const idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(box.indices), gl.STATIC_DRAW);

  // A quad big enough that at any sane camera distance it still looks infinite.
  const groundBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, groundBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
  const groundIdx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, groundIdx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

  gl.enable(gl.DEPTH_TEST);
  // No face culling: the scene is small enough (a floor quad plus a handful of
  // boxes) that the overdraw cost is nothing, and it sidesteps having to reason
  // about winding order for a ground quad viewed from a downward-tilted camera.

  let lastVP = mat4.identity();
  let w = 0, h = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
  }

  const hexToRgb01 = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return [0.5, 0.5, 0.5];
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  /**
   * frame(camera, scene): camera = {eye:[x,y,z], target:[x,y,z]}
   * scene = { fogColor, floorColor, gridColor, floorSize, boxes: [{x,y,z,w,h,d,ry,color}] }
   */
  function frame(camera, scene) {
    if (!w || !h) resize();
    gl.clearColor(...hexToRgb01(scene.fogColor), 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const proj = mat4.perspective((60 * Math.PI) / 180, w / h, 0.1, 200);
    const view = mat4.lookAt(camera.eye, camera.target, [0, 1, 0]);
    lastVP = mat4.multiply(proj, view);
    const fogColor = hexToRgb01(scene.fogColor);
    const fogDist = Math.max(20, (scene.floorSize || 40) * 0.9);

    // ground
    gl.useProgram(groundProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, groundBuf);
    const gaPos = gl.getAttribLocation(groundProgram, 'aPos');
    gl.enableVertexAttribArray(gaPos);
    gl.vertexAttribPointer(gaPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, groundIdx);
    gl.uniformMatrix4fv(gl.getUniformLocation(groundProgram, 'uView'), false, view);
    gl.uniformMatrix4fv(gl.getUniformLocation(groundProgram, 'uProj'), false, proj);
    gl.uniform1f(gl.getUniformLocation(groundProgram, 'uSize'), 220);
    gl.uniform3fv(gl.getUniformLocation(groundProgram, 'uBaseColor'), hexToRgb01(scene.floorColor));
    gl.uniform3fv(gl.getUniformLocation(groundProgram, 'uLineColor'), hexToRgb01(scene.gridColor || scene.floorColor));
    gl.uniform3fv(gl.getUniformLocation(groundProgram, 'uFogColor'), fogColor);
    gl.uniform1f(gl.getUniformLocation(groundProgram, 'uFogDist'), fogDist);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    // boxes
    gl.useProgram(boxProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, boxBuf);
    const baPos = gl.getAttribLocation(boxProgram, 'aPos');
    gl.enableVertexAttribArray(baPos);
    gl.vertexAttribPointer(baPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    const baNorm = gl.getAttribLocation(boxProgram, 'aNormal');
    gl.enableVertexAttribArray(baNorm);
    gl.vertexAttribPointer(baNorm, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.uniformMatrix4fv(gl.getUniformLocation(boxProgram, 'uView'), false, view);
    gl.uniformMatrix4fv(gl.getUniformLocation(boxProgram, 'uProj'), false, proj);
    gl.uniform3fv(gl.getUniformLocation(boxProgram, 'uLightDir'), v3.norm([0.4, 1, 0.3]));
    gl.uniform3fv(gl.getUniformLocation(boxProgram, 'uFogColor'), fogColor);
    gl.uniform1f(gl.getUniformLocation(boxProgram, 'uFogDist'), fogDist);

    for (const b of scene.boxes || []) {
      const model = mat4.multiply(
        mat4.multiply(mat4.translate(b.x, b.y, b.z), mat4.rotateY(b.ry || 0)),
        mat4.scaleXYZ(b.w, b.h, b.d),
      );
      gl.uniformMatrix4fv(gl.getUniformLocation(boxProgram, 'uModel'), false, model);
      gl.uniform3fv(gl.getUniformLocation(boxProgram, 'uColor'), hexToRgb01(b.color));
      gl.drawElements(gl.TRIANGLES, box.indices.length, gl.UNSIGNED_SHORT, 0);
    }
  }

  /** Project a world point using the matrices from the last frame(). */
  function project(worldPos) {
    const clip = mat4.apply(lastVP, worldPos);
    if (clip[3] <= 0.0001) return { visible: false };
    const ndcX = clip[0] / clip[3], ndcY = clip[1] / clip[3];
    return {
      visible: ndcX > -1.15 && ndcX < 1.15 && ndcY > -1.15 && ndcY < 1.15,
      x: (ndcX * 0.5 + 0.5) * canvas.clientWidth,
      y: (1 - (ndcY * 0.5 + 0.5)) * canvas.clientHeight,
    };
  }

  return { gl, resize, frame, project };
}
