// Phone-as-controller for the hosted site: browser-to-browser (WebRTC) through PeerJS.
// Free public pairing server, no account or API key. The laptop is peer "toprc-hr-<code>"; the phone connects to it.
export const SITE_URL = location.origin + location.pathname;
const $ = (id) => document.getElementById(id);
const PREFIX = 'toprc-hr-';
const PEER_SRC = ['https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'];
const peerOpts = () => window.__PEER_CFG || { debug: 0 };

function loadPeer() {
  const tryLoad = (i) => new Promise((res) => {
    if (window.Peer) return res(true);
    if (i >= PEER_SRC.length) return res(false);
    const s = document.createElement('script'); s.src = PEER_SRC[i];
    s.onload = () => res(window.Peer ? true : tryLoad(i + 1)); s.onerror = () => res(tryLoad(i + 1));
    document.head.appendChild(s);
  });
  return tryLoad(0);
}
export const newCode = () => Array.from({ length: 4 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');

// ---------------- laptop side
export class PhoneLink {
  constructor() { this.peer = null; this.conn = null; this.state = null; this.seenAt = 0; this.status = 'off'; this.onstatus = null; this.onevent = null; this.counters = {}; this.everConnected = false; this.lastArm = false; }
  get fresh() { return !!this.state && Date.now() - this.seenAt < 1500; }
  set(s) { this.status = s; this.onstatus?.(s); }
  async host(code) {
    this.stopPeer(); this.set('connecting');
    if (!(await loadPeer())) { this.set('unavailable'); return false; }
    const peer = this.peer = new window.Peer(PREFIX + code, peerOpts());
    peer.on('open', () => this.set('waiting'));
    peer.on('error', (e) => { if (this.peer === peer) this.set(e && e.type === 'unavailable-id' ? 'taken' : 'unavailable'); });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
    peer.on('connection', (conn) => {
      try { this.conn?.close(); } catch (e) { /* ignore */ }
      this.conn = conn;
      conn.on('data', (s) => {
        if (!s || s.role !== 'pad') return;
        this.seenAt = Date.now();
        for (const k of ['reset', 'cam', 'pause', 'fly']) {
          const v = +s[k] || 0;
          if (this.counters[k] !== undefined && v !== this.counters[k]) this.onevent?.(k);
          this.counters[k] = v;
        }
        this.state = s; this.everConnected = true; this.lastArm = !!s.arm;
        if (this.status !== 'connected') this.set('connected');
      });
      conn.on('close', () => { if (this.conn === conn) { this.conn = null; this.set('waiting'); } });
    });
    return true;
  }
  tell(info) { try { if (this.conn && this.conn.open) this.conn.send({ role: 'sim', ...info }); } catch (e) { /* ignore */ } }
  stopPeer() { try { this.conn?.close(); this.peer?.destroy(); } catch (e) { /* ignore */ } this.conn = null; this.peer = null; this.counters = {}; }
  async stop() { this.stopPeer(); this.state = null; this.set('off'); }
}

// ---------------- phone side (controller page)
export async function runPadPage(code, input, touchCtl) {
  document.body.classList.add('padpage');
  $('menu').classList.add('hidden'); $('padui').classList.remove('hidden');
  touchCtl.show(true);
  $('padCode').value = code || '';
  let peer = null, conn = null, mode = 'arcade', sim = null; const n = { reset: 0, cam: 0, pause: 0, fly: 0 };
  const status = (t, ok) => { $('padStatus').textContent = t; $('padDot2').classList.toggle('ok', !!ok); };
  const setMode = (m) => { mode = m; document.querySelectorAll('#padModes button').forEach((b) => b.classList.toggle('on', b.dataset.v === m)); };
  setMode('arcade');
  document.querySelectorAll('#padModes button').forEach((b) => (b.onclick = () => setMode(b.dataset.v)));
  $('padFly').onclick = () => { n.fly++; };
  const T = input.touch;
  touchCtl.onCam = () => { n.cam++; }; touchCtl.onPause = () => { n.pause++; };
  let wantCode = '';
  const open = () => {
    if (!peer || peer.destroyed || !wantCode) return;
    try { conn?.close(); } catch (e) { /* ignore */ }
    status('Connecting to the laptop…');
    conn = peer.connect(PREFIX + wantCode, { reliable: false, serialization: 'json' });
    conn.on('open', () => status('Connected · press FLY here or on the laptop', true));
    conn.on('data', (d) => {
      if (!d || d.role !== 'sim') return; sim = d;
      status(sim.flying ? `Connected · flying · ${sim.armed ? 'ARMED' : 'disarmed'}` : 'Connected · press FLY here or on the laptop', true);
      $('padFly').classList.toggle('hidden', !!sim.flying);
    });
    conn.on('close', () => { status('Lost the laptop. Reconnecting…'); setTimeout(open, 1500); });
  };
  const connect = async () => {
    const c = $('padCode').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (c.length < 4) { status('Type the 4-character code shown on the laptop'); return; }
    wantCode = c; status('Starting…');
    if (!(await loadPeer())) { status('Couldn’t load the connection library. Check the internet connection.'); return; }
    if (!peer || peer.destroyed) {
      peer = new window.Peer(peerOpts());
      peer.on('open', open);
      peer.on('error', (e) => {
        if (e && e.type === 'peer-unavailable') { status('Laptop not found. Check the code and that the laptop page is open.'); setTimeout(open, 2500); }
        else status('Connection problem. Retrying…');
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
    } else open();
  };
  $('padConnect').onclick = connect;
  if (code) connect();
  // stream sticks ~60/s plus a keep-alive
  let lastTick = 0;
  const loop = () => {
    requestAnimationFrame(loop);
    if (T.reset) { n.reset++; T.reset = false; }
    const now = performance.now();
    if (conn && conn.open && now - lastTick > 15) {
      lastTick = now;
      const q = (v) => Math.round(v * 100) / 100;
      try { conn.send({ role: 'pad', lx: q(T.lx), ly: q(T.ly), rx: q(T.rx), ry: q(T.ry), arm: !T.disarmed, fire: !!T.fire, flare: !!T.flare, mode, ...n }); } catch (e) { /* ignore */ }
    }
  };
  loop();
}
