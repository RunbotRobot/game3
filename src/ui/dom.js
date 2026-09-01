/** Minimal element builder: el('div.hud-block', {title:'x'}, child, child) */
export function el(spec, props = {}, ...children) {
  const [tag, ...classes] = String(spec).split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function block(title, ...children) {
  return el('div.hud-block', {}, el('div.hud-title', { text: title }), ...children);
}

export function row(label, value) {
  return el('div.hud-row', {}, el('span', { text: label }), el('span', { text: String(value) }));
}

export function meter(fraction) {
  const bar = el('div.meter', {}, el('i'));
  bar.firstChild.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  return bar;
}

export const $ = (sel) => document.querySelector(sel);
