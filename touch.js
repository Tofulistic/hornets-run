// On-screen sticks for phones/tablets (Mode 2: left = throttle/rudder, right = elevator/aileron). Sticks spring back; throttle holds where you leave it.
export function initTouch(input, { onCam, onPause }) {
  const root = document.getElementById('touch');
  const T = input.touch = { active: false, lx: 0, ly: 0, rx: 0, ry: 0, disarmed: false, reset: false, fire: false, flare: false };
  const R = 62; // stick travel in px
  const mk = (side) => {
    const zone = root.querySelector(`.tz.${side}`);
    const base = zone.querySelector('.tbase'), knob = zone.querySelector('.tknob');
    let id = null, ox = 0, oy = 0;
    const home = () => { base.style.left = ''; base.style.top = ''; base.classList.remove('live'); knob.style.transform = 'translate(-50%,-50%)'; };
    const set = (x, y) => {
      let dx = x - ox, dy = y - oy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const vx = dx / R, vy = -dy / R;
      if (side === 'l') { T.lx = vx; T.ly = vy; } else { T.rx = vx; T.ry = vy; }
    };
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return; id = e.pointerId; zone.setPointerCapture(id);
      const r = zone.getBoundingClientRect(); ox = e.clientX; oy = e.clientY;
      base.style.left = (ox - r.left) + 'px'; base.style.top = (oy - r.top) + 'px'; base.classList.add('live');
      set(e.clientX, e.clientY); e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === id) { set(e.clientX, e.clientY); e.preventDefault(); } });
    const end = (e) => { if (e.pointerId !== id) return; id = null; set(ox, oy); home(); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  };
  mk('l'); mk('r');
  const armBtn = root.querySelector('#tArm');
  armBtn.onclick = () => { T.disarmed = !T.disarmed; armBtn.textContent = T.disarmed ? 'ARM' : 'DISARM'; armBtn.classList.toggle('on', !T.disarmed); };
  for (const [id, k] of [['tFire', 'fire'], ['tFlare', 'flare']]) { const el = root.querySelector('#' + id); if (!el) continue; el.addEventListener('pointerdown', (e) => { T[k] = true; el.classList.add('on'); e.preventDefault(); }); const up = () => { T[k] = false; el.classList.remove('on'); }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up); }
  root.querySelector('#tReset').onclick = () => { T.reset = true; };
  root.querySelector('#tCam').onclick = () => ctl.onCam?.();
  root.querySelector('#tPause').onclick = () => ctl.onPause?.();
  const ctl = {
    onCam, onPause,
    show(on) {
      T.active = on; root.classList.toggle('hidden', !on); document.body.classList.toggle('touchmode', on);
      T.disarmed = false; armBtn.textContent = 'DISARM'; armBtn.classList.add('on');
    },
  };
  return ctl;
}
