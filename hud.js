// Green head-up display drawn on a 2D canvas over the 3D view.
import * as THREE from 'three';

const GREEN = '#8dffa8';
const _v = new THREE.Vector3();
export class HUD {
  constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); this.resize(); addEventListener('resize', () => this.resize()); }
  resize() { const d = Math.min(devicePixelRatio, 2); this.d = d; this.c.width = innerWidth * d; this.c.height = innerHeight * d; this.w = innerWidth; this.h = innerHeight; }
  proj(p, cam) { _v.copy(p).project(cam); if (_v.z > 1) return null; return [(_v.x + 1) / 2 * this.w, (1 - _v.y) / 2 * this.h]; }
  draw(S, cam) {
    const g = this.g, w = this.w, h = this.h; g.setTransform(this.d, 0, 0, this.d, 0, 0); g.clearRect(0, 0, w, h);
    if (!S) return;
    if (S.minimal) { // cinematic: no symbology, just a quiet line for what matters
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `500 ${Math.max(15, Math.min(w, h) / 40)}px Barlow, system-ui, sans-serif`;
      g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 10; let y = h * 0.86;
      for (const [txt, red] of S.warn || []) { g.fillStyle = red ? '#ffb0a0' : 'rgba(255,244,230,.92)'; g.fillText(txt, w / 2, y); y -= 30; }
      g.shadowBlur = 0; return;
    }
    const s = Math.min(1.25, Math.max(0.75, Math.min(w, h) / 760));
    g.strokeStyle = GREEN; g.fillStyle = GREEN; g.lineWidth = 1.6 * s; g.shadowColor = 'rgba(80,255,140,0.55)'; g.shadowBlur = 6;
    g.font = `600 ${14 * s}px "Barlow Condensed","Arial Narrow",sans-serif`; g.textBaseline = 'middle';
    const cx = w / 2, cy = h / 2;
    const full = S.full; // full HUD in chase/cockpit; compact telemetry from the ground
    if (full) {
      // pitch ladder
      g.save(); g.translate(cx, cy); g.rotate(-S.bank); const pp = 9 * s; // px per degree
      g.beginPath(); g.rect(-170 * s, -150 * s, 340 * s, 300 * s); g.clip();
      for (let d = -90; d <= 90; d += 10) {
        const y = (S.pitch * 57.3 - d) * pp; if (Math.abs(y) > 160 * s) continue;
        g.setLineDash(d < 0 ? [6 * s, 5 * s] : []);
        g.beginPath(); const L = d === 0 ? 150 * s : 60 * s, gap = 28 * s;
        g.moveTo(-L, y); g.lineTo(-gap, y); g.moveTo(gap, y); g.lineTo(L, y); g.stroke();
        if (d) { g.setLineDash([]); g.textAlign = 'right'; g.fillText(Math.abs(d), -L - 6, y); g.textAlign = 'left'; g.fillText(Math.abs(d), L + 6, y); }
      }
      g.setLineDash([]); g.restore();
      // waterline + flight path marker
      g.beginPath(); g.moveTo(cx - 22 * s, cy); g.lineTo(cx - 9 * s, cy); g.lineTo(cx - 4 * s, cy + 6 * s); g.moveTo(cx + 22 * s, cy); g.lineTo(cx + 9 * s, cy); g.lineTo(cx + 4 * s, cy + 6 * s); g.stroke();
      if (S.fpm) { const [x, y] = S.fpm; g.beginPath(); g.arc(x, y, 6 * s, 0, Math.PI * 2); g.moveTo(x - 16 * s, y); g.lineTo(x - 6 * s, y); g.moveTo(x + 6 * s, y); g.lineTo(x + 16 * s, y); g.moveTo(x, y - 6 * s); g.lineTo(x, y - 12 * s); g.stroke(); }
    }
    // heading tape
    const hy = 34 * s; g.textAlign = 'center';
    g.save(); g.beginPath(); g.rect(cx - 150 * s, hy - 16 * s, 300 * s, 34 * s); g.clip();
    const hd = S.heading;
    for (let d = Math.floor(hd / 5) * 5 - 40; d <= hd + 40; d += 5) {
      const x = cx + (d - hd) * 3.6 * s; g.beginPath(); g.moveTo(x, hy + 8 * s); g.lineTo(x, hy + (d % 10 ? 13 : 16) * s); g.stroke();
      if (d % 10 === 0) { const v = ((d % 360) + 360) % 360; g.fillText(v === 0 ? 'N' : v === 90 ? 'E' : v === 180 ? 'S' : v === 270 ? 'W' : String(v / 10).padStart(2, '0'), x, hy - 2 * s); }
    }
    g.restore(); g.beginPath(); g.moveTo(cx, hy + 18 * s); g.lineTo(cx - 5 * s, hy + 24 * s); g.lineTo(cx + 5 * s, hy + 24 * s); g.closePath(); g.stroke();
    // speed / altitude boxes
    const bx = full ? 210 * s : Math.min(w * 0.36, 300 * s), by = cy;
    const box = (x, label, val, sub, align) => {
      g.strokeRect(x - 38 * s, by - 15 * s, 76 * s, 30 * s); g.textAlign = 'center';
      g.font = `700 ${20 * s}px "Barlow Condensed","Arial Narrow",sans-serif`; g.fillText(val, x, by + 1);
      g.font = `600 ${12 * s}px "Barlow Condensed","Arial Narrow",sans-serif`; g.fillText(label, x, by - 26 * s); if (sub) g.fillText(sub, x, by + 28 * s);
    };
    box(cx - bx, S.units === 'kmh' ? 'KM/H' : 'M/S', S.units === 'kmh' ? Math.round(S.speed * 3.6) : S.speed.toFixed(0), `G ${S.g.toFixed(1)}`);
    box(cx + bx, 'ALT m', S.alt.toFixed(S.alt < 10 ? 1 : 0), `AoA ${Math.round(S.aoa)}°`);
    // bottom-left: throttle, mode, gear/hook, weapons
    g.textAlign = 'left'; g.font = `600 ${14 * s}px "Barlow Condensed","Arial Narrow",sans-serif`;
    const lx = 24 * s, ly = h - 120 * s;
    g.strokeRect(lx, ly, 12 * s, 80 * s); g.fillRect(lx + 2 * s, ly + 2 * s + 76 * s * (1 - S.thr), 8 * s, 76 * s * S.thr);
    g.fillText(`THR ${Math.round(S.thr * 100)}%${S.armed ? '' : '  · SAFE'}`, lx + 22 * s, ly + 8 * s);
    g.fillText(S.mode === 'rc' ? 'RC MODE · RATES ' + S.rates : 'ARCADE · STABILISED', lx + 22 * s, ly + 28 * s);
    g.fillText(`${S.gear ? 'GEAR DN' : 'GEAR UP'}${S.hook ? ' · HOOK' : ''}${S.stall ? '  STALL' : ''}`, lx + 22 * s, ly + 48 * s);
    if (S.weapons) g.fillText(S.weapons, lx + 22 * s, ly + 68 * s);
    // lock marker on targets
    for (const t of S.targets || []) {
      const p = t.screen; if (!p) continue; const [x, y] = p; const r = (t.locked ? 16 : 12) * s;
      g.save(); g.strokeStyle = t.locked ? '#ffdf6a' : GREEN; g.fillStyle = g.strokeStyle;
      g.beginPath(); if (t.locked) { g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); } else g.rect(x - r, y - r, 2 * r, 2 * r); g.stroke();
      if (t.locked) { g.beginPath(); g.arc(x, y, r * 1.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, t.lockT), false); g.stroke(); }
      g.textAlign = 'center'; g.fillText(`${Math.round(t.dist)}m`, x, y + r + 12 * s); if (t.label) g.fillText(t.label, x, y - r - 10 * s);
      g.restore();
    }
    // off-screen arrow to the current objective
    if (S.arrow) { const [x, y, a] = S.arrow; g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(14 * s, 0); g.lineTo(-8 * s, -9 * s); g.lineTo(-8 * s, 9 * s); g.closePath(); g.fill(); g.restore(); }
    // top-right: mission readout
    g.textAlign = 'right'; g.font = `700 ${18 * s}px "Barlow Condensed","Arial Narrow",sans-serif`;
    if (S.timer != null) { g.fillStyle = S.timer < 20 ? '#ff6a5a' : GREEN; g.fillText(fmt(S.timer), w - 24 * s, 34 * s); g.fillStyle = GREEN; }
    g.font = `600 ${14 * s}px "Barlow Condensed","Arial Narrow",sans-serif`;
    (S.lines || []).forEach((l, i) => g.fillText(l, w - 24 * s, 58 * s + i * 18 * s));
    // warnings
    g.textAlign = 'center'; g.font = `800 ${22 * s}px "Barlow Condensed","Arial Narrow",sans-serif`;
    let wy = cy + 110 * s; const blink = Math.floor(performance.now() / 250) % 2;
    for (const [txt, red] of S.warn || []) { if (red && !blink) { wy += 28 * s; continue; } g.fillStyle = red ? '#ff5a4a' : '#ffdf6a'; g.fillText(txt, cx, wy); wy += 28 * s; }
    g.shadowBlur = 0;
  }
}
export const fmt = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60), s = Math.floor(t % 60), d = Math.floor((t * 10) % 10); return `${m}:${String(s).padStart(2, '0')}.${d}`; };
