// The background canvas. It carries the mood of the era and hosts whatever the
// active mechanics want to draw on top of it.

import { active } from '../mechanics/index.js';

const MOTION = {
  still:   { speed: 0.02, jitter: 0.00, count: 60,  size: 1.0, trail: 0.06 },
  drift:   { speed: 0.16, jitter: 0.02, count: 90,  size: 1.2, trail: 0.08 },
  pulse:   { speed: 0.30, jitter: 0.04, count: 120, size: 1.6, trail: 0.10 },
  scatter: { speed: 0.75, jitter: 0.35, count: 150, size: 1.0, trail: 0.16 },
  storm:   { speed: 1.60, jitter: 0.70, count: 220, size: 0.9, trail: 0.28 },
};

export function createStage(g, canvas) {
  const ctx = canvas.getContext('2d');
  let dots = [];
  let W = 0, H = 0, dpr = 1;
  let mode = MOTION.drift;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function seed() {
    const n = mode.count;
    dots = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5), vy: (Math.random() - 0.5),
      r: Math.random() * mode.size + 0.3,
      a: 0.05 + Math.random() * 0.2,
    }));
  }

  function setMotion(name) {
    const next = MOTION[name] || MOTION.drift;
    if (next === mode) return;
    mode = next;
    seed();
  }

  function frame(t) {
    if (!W || !H) { requestAnimationFrame(frame); return; }
    const style = getComputedStyle(document.documentElement);
    const bg = style.getPropertyValue('--bg').trim() || '#0b0d10';
    const accent = style.getPropertyValue('--accent').trim() || '#7fd1c1';

    // Trail rather than clear, so motion leaves a smear proportional to its violence.
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = hexAlpha(bg, mode.trail);
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = accent;
    for (const d of dots) {
      d.x += d.vx * mode.speed + (Math.random() - 0.5) * mode.jitter;
      d.y += d.vy * mode.speed + (Math.random() - 0.5) * mode.jitter;
      if (d.x < -10) d.x = W + 10; if (d.x > W + 10) d.x = -10;
      if (d.y < -10) d.y = H + 10; if (d.y > H + 10) d.y = -10;
      ctx.globalAlpha = d.a * (mode === MOTION.pulse ? 0.5 + 0.5 * Math.sin(t / 600 + d.x / 90) : 1);
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
    }

    ctx.globalAlpha = 1;
    for (const m of active(g)) {
      try { m.draw?.(g, ctx, t, W, H); } catch (e) { /* a broken mechanic must not kill the frame */ }
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
  return { setMotion, resize };
}

/** '#rrggbb' + alpha -> rgba(), so the trail works on any era palette. */
function hexAlpha(hex, alpha) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return `rgba(11,13,16,${alpha})`;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
