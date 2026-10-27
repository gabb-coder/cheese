// Tiny DOM helper. Text always goes in as text nodes, never as HTML, so player names
// can't inject markup.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

let toastTimer = null;
export function toast(text, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// True when the player has asked their phone for less motion.
export const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Replace what `parent` shows with `child`. With `animate`, the new screen slides in over
// the old one: a View Transition where the browser has them, else an entrance animation.
const incoming = new WeakMap();
export function swap(parent, child, animate = false) {
  if (!animate || calm() || document.hidden) {
    incoming.delete(parent);
    parent.replaceChildren(child);
  } else if (document.startViewTransition) {
    // The swap happens a frame later; a newer swap before then wins.
    const waiting = incoming.has(parent);
    incoming.set(parent, child);
    if (!waiting) {
      const transition = document.startViewTransition(() => {
        const next = incoming.get(parent);
        incoming.delete(parent);
        if (next) parent.replaceChildren(next);
      });
      // A skipped transition (say the phone rotated) still swaps; it just doesn't animate.
      transition.ready.catch(() => {});
    }
  } else {
    child.classList.add('enter');
    parent.replaceChildren(child);
  }
}
