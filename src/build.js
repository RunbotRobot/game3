// The build baked into the JavaScript the browser is actually running.
// version.json carries the same string; comparing the two is how the game tells
// "a rewrite has landed" apart from "your browser is still running old code",
// which matters on GitHub Pages, where assets are CDN-cached for ~10 minutes and
// a plain reload can return the same stale modules.
//
// Bump this and version.json together on every push.
export const BUILD = '2026-09-02.9';
