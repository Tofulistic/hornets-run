// Controller mapping wizard
const $ = (id) => document.getElementById(id);

const CHANNELS = [
  { key: 'thr', name: 'Throttle', ask: 'Put the THROTTLE stick at the bottom, then push it all the way UP' },
  { key: 'yaw', name: 'Yaw (rudder)', ask: 'Push the YAW stick (left stick) to the RIGHT' },
  { key: 'pitch', name: 'Pitch (elevator)', ask: 'Push the PITCH stick (right stick) FORWARD / up' },
  { key: 'roll', name: 'Roll (aileron)', ask: 'Push the ROLL stick (right stick) to the RIGHT' },
  { key: 'arm', name: 'Throttle arm', ask: 'Flip your ARM switch to the ARMED position', sw: true },
  { key: 'reset', name: 'Reset button', ask: 'Flip/press the switch you want to use for RESET', sw: true },
  { key: 'fire', name: 'Fire (optional)', ask: 'Flip/press the switch you want to FIRE with', sw: true },
  { key: 'flare', name: 'Flares (optional)', ask: 'Flip/press the switch you want for FLARES', sw: true },
];

export function initSetup(input, onClose) {
  let detecting = null, base = null, baseBtns = null, calib = null, raf = 0;
  const rows = $('mapRows');

  function label(ch) {
    const m = input.map[ch.key];
    if (ch.sw) return m.type === 'none' ? (ch.key === 'arm' ? 'None (auto-arm / Space)' : 'None') : `${m.type === 'axis' ? 'Axis' : 'Button'} ${m.index}`;
    return `Axis ${m.axis}`;
  }
  function render() {
    rows.innerHTML = '';
    for (const ch of CHANNELS) {
      const r = document.createElement('div'); r.className = 'map-row';
      const inv = input.map[ch.key].inv;
      r.innerHTML = `<div>${ch.name}</div><div class="cur">${label(ch)}</div>
        <label style="font-size:13px;color:var(--dim)"><input type="checkbox" ${inv ? 'checked' : ''}> Invert</label>
        <button>${detecting === ch.key ? 'Listening…' : 'Detect'}</button>`;
      r.querySelector('input').onchange = (e) => { input.map[ch.key].inv = e.target.checked; input.save(); };
      r.querySelector('button').onclick = () => startDetect(ch);
      if (ch.sw && input.map[ch.key].type !== 'none') {
        const clr = document.createElement('button'); clr.textContent = 'Clear'; clr.style.gridColumn = '4';
        clr.onclick = () => { input.map[ch.key] = { type: 'none', index: -1, inv: false }; input.save(); render(); };
        r.appendChild(clr);
      }
      rows.appendChild(r);
    }
  }
  function startDetect(ch) {
    const pad = input.pad();
    if (!pad) { $('setupPrompt').textContent = 'No controller yet. Pair "ExpressLRS Joystick" and move a stick.'; return; }
    detecting = ch.key; base = [...pad.axes]; baseBtns = pad.buttons.map((b) => b.pressed);
    $('setupPrompt').textContent = ch.ask + ' …'; render();
  }
  function finishDetect(ch, res) {
    if (ch.sw) {
      input.map[ch.key] = res.type === 'axis' ? { type: 'axis', index: res.index, inv: res.delta < 0 } : { type: 'button', index: res.index, inv: !!baseBtns[res.index] };
    } else {
      const m = input.map[ch.key]; m.axis = res.index; m.inv = res.delta < 0;
      if (ch.key === 'thr') { m.min = Math.min(base[res.index], -1); m.max = Math.max(base[res.index], 1); }
    }
    input.map.padId = input.pad()?.id; input.save();
    $('setupPrompt').textContent = `✓ ${ch.name} set to ${label(ch)}.`;
    detecting = null; render();
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    const pad = input.pad();
    $('setupPad').textContent = pad ? `Connected: ${pad.id}` : 'Waiting for controller… pair “ExpressLRS Joystick” and move a stick.';
    const ax = $('axesLive'), bt = $('btnsLive');
    if (pad) {
      if (ax.children.length !== pad.axes.length) {
        ax.innerHTML = pad.axes.map((_, i) => `<div class="axis">Axis ${i} <span></span><div class="bar"><i></i></div></div>`).join('');
      }
      pad.axes.forEach((v, i) => {
        const el = ax.children[i]; el.querySelector('span').textContent = v.toFixed(2);
        const b = el.querySelector('i'); const w = Math.abs(v) * 50; b.style.width = w + '%'; b.style.left = (v < 0 ? 50 - w : 50) + '%';
      });
      bt.innerHTML = pad.buttons.map((b, i) => `<span class="${b.pressed ? 'on' : ''}">B${i}</span>`).join('');
      if (calib) pad.axes.forEach((v, i) => { calib[i] = calib[i] || [v, v]; calib[i][0] = Math.min(calib[i][0], v); calib[i][1] = Math.max(calib[i][1], v); });
      if (detecting) {
        const ch = CHANNELS.find((c) => c.key === detecting);
        let bi = -1, bd = 0;
        pad.axes.forEach((v, i) => { const d = v - base[i]; if (Math.abs(d) > Math.abs(bd)) { bd = d; bi = i; } });
        if (Math.abs(bd) > 0.6) finishDetect(ch, { type: 'axis', index: bi, delta: bd });
        else if (ch.sw) {
          const k = pad.buttons.findIndex((b, i) => b.pressed !== baseBtns[i]);
          if (k >= 0) finishDetect(ch, { type: 'button', index: k });
        }
      }
    } else { ax.innerHTML = ''; bt.innerHTML = ''; }
    // mapped output
    const st = input.update(1 / 60);
    const out = $('outLive');
    const vals = [['Throttle', st.thr, true], ['Yaw', st.yaw], ['Pitch', st.pitch], ['Roll', st.roll], ['Arm', st.arm ? 1 : 0, true]];
    if (out.children.length !== vals.length) out.innerHTML = vals.map(([n, , u]) => `<div class="axis">${n} <span></span><div class="bar ${u ? 'uni' : ''}"><i></i></div></div>`).join('');
    vals.forEach(([, v, u], i) => {
      const el = out.children[i]; el.querySelector('span').textContent = v.toFixed(2);
      const b = el.querySelector('i');
      if (u) { b.style.width = v * 100 + '%'; } else { const w = Math.abs(v) * 50; b.style.width = w + '%'; b.style.left = (v < 0 ? 50 - w : 50) + '%'; }
    });
  }

  $('btnCal').onclick = () => {
    if (!calib) { calib = []; $('btnCal').textContent = 'Finish calibration'; $('setupPrompt').textContent = 'Move both sticks around their full range (all corners), then click Finish calibration.'; return; }
    for (const k of ['thr', 'yaw', 'pitch', 'roll']) {
      const m = input.map[k]; const c = calib[m.axis];
      if (c && c[1] - c[0] > 0.5) { m.min = c[0]; m.max = c[1]; }
    }
    input.save(); calib = null; $('btnCal').textContent = 'Calibrate ranges'; $('setupPrompt').textContent = '✓ Calibration saved.';
  };
  $('btnDefaults').onclick = () => { input.resetDefaults(); render(); $('setupPrompt').textContent = 'Defaults restored (AETR: roll 0, pitch 1, throttle 2, yaw 3).'; };
  $('btnSetupDone').onclick = () => close();

  function open() { $('setup').classList.remove('hidden'); detecting = null; render(); $('setupPrompt').textContent = 'Tip: click Detect next to each control, then move that stick.'; tick(); }
  function close() { cancelAnimationFrame(raf); $('setup').classList.add('hidden'); detecting = null; calib = null; onClose?.(); }
  return { open, close };
}
