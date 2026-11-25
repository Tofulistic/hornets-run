// Menu motion: sliding selection indicators, tab transitions, crossfading descriptions, staged entrance.
// All of it is skipped when the device asks for reduced motion.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(.2,.9,.25,1)';

// a pill that glides to the selected option of each segmented control
export function initIndicators(root = document) {
  const segs = [...root.querySelectorAll('.menu .seg[data-key]:not(.maps), .menu .tabs')];
  for (const seg of segs) {
    if (seg.querySelector(':scope > .ind')) continue;
    const ind = document.createElement('span'); ind.className = seg.classList.contains('tabs') ? 'ind line' : 'ind';
    seg.prepend(ind); seg.classList.add('has-ind');
  }
  const place = (instant) => {
    for (const seg of segs) {
      const ind = seg.querySelector(':scope > .ind');
      const on = seg.querySelector(':scope > button.on, :scope > button[aria-selected=true]');
      if (!ind || !on || !on.offsetParent) { if (ind) ind.style.opacity = 0; continue; }
      if (instant || reduce) ind.style.transition = 'none';
      ind.style.opacity = 1;
      const line = ind.classList.contains('line');
      ind.style.transform = `translate(${on.offsetLeft}px, ${line ? on.offsetTop + on.offsetHeight - 2 : on.offsetTop}px)`;
      ind.style.width = on.offsetWidth + 'px'; ind.style.height = (line ? 2 : on.offsetHeight) + 'px';
      if (instant || reduce) { ind.offsetWidth; ind.style.transition = ''; }
    }
  };
  addEventListener('resize', () => place(true));
  return place;
}

// pane switch: the incoming panel eases in from the side of the tab you came from
export function animatePane(pane, dir) {
  if (reduce || !pane) return;
  pane.animate([{ opacity: 0, transform: `translateX(${dir * 14}px)`, filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 300, easing: EASE });
}

// swap text with a quick crossfade
export function swapText(el, text) {
  if (!el || el.textContent === text) return;
  if (reduce || !el.textContent) { el.textContent = text; return; }
  const out = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-3px)' }], { duration: 110, easing: 'ease-in', fill: 'forwards' });
  out.onfinish = () => {
    el.textContent = text; out.cancel();
    el.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: EASE });
  };
}

// staged entrance of the menu (header, flight plan, options)
export function enterMenu() {
  const parts = ['.menu .mhead', '.menu .plan', '.menu .side'].map((s) => document.querySelector(s)).filter(Boolean);
  if (reduce) return;
  parts.forEach((el, i) => el.animate(
    [{ opacity: 0, transform: 'translateY(18px) scale(.985)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
    { duration: 620, delay: 70 + i * 90, easing: EASE, fill: 'backwards' }));
  document.querySelectorAll('.menu .maps .tile').forEach((t, i) => t.animate(
    [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
    { duration: 480, delay: 260 + i * 45, easing: EASE, fill: 'backwards' }));
}

// reveal for a block that appears (phone pairing box, file name, etc.)
export function reveal(el) {
  if (reduce || !el) return;
  el.animate([{ opacity: 0, transform: 'translateY(-6px)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 340, easing: EASE });
}
