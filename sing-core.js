/* sing-core.js: the shared engine for the newer singing exercises
   (harmony.html, chord-tones.html, and whatever comes next).

   What's in here:
     - note names and small maths helpers
     - sounds: real piano and guitar recordings (with their tuning checked on
       load), a sustained pad for drones, the old built-in tones as a fallback
     - chord voicings (real guitar shapes, a simple piano spread)
     - microphone, Safari's settle wait, pitch detection
     - a "trainer": the live card (meter, trace), prompt by prompt scoring,
       the session summary and the History tab

   Lab mode: opening any page with ?lab (or the lab home page) turns it on for
   this device; ?lab=0 turns it off. Pages show their extra settings when
   SC.lab is true. Students never see lab/ unless given the link.

   notes.html, one-five-one.html and vowels.html still carry their own copies
   of the older code; they can be moved onto this one at a quiet moment. */
(function () {
  "use strict";
  const SC = window.SC = {};
  const $ = id => document.getElementById(id);
  SC.$ = $;

  // ---------- Lab mode ----------
  SC.lab = (() => {
    const q = new URLSearchParams(location.search);
    try {
      if (q.has('lab')) { if (q.get('lab') === '0') localStorage.removeItem('sing-lab'); else localStorage.setItem('sing-lab', '1'); }
      return localStorage.getItem('sing-lab') === '1';
    } catch (e) { return q.has('lab') && q.get('lab') !== '0'; }
  })();
  const inLabFolder = /\/lab\/?(index\.html)?$/.test(location.pathname);
  SC.home = SC.lab ? (inLabFolder ? './' : 'lab/') : (inLabFolder ? '../' : 'index.html');

  // ---------- The exercises ----------
  // One list for both home pages. students: true puts it on the student home
  // (index.html); everything shows on the lab home (lab/). To give students a
  // beta exercise, flip students to true. lab: what's still being tried out.
  SC.EXERCISES = [
    { href: 'notes.html', name: 'Single notes', blurb: 'Hear a note, sing it, hold it. Walk up or down your range.', students: true,
      lab: 'Lab: real piano and guitar recordings in the Sound menu.' },
    { href: 'one-five-one.html', name: '1–5–1', blurb: 'Sing the root, up to the 5th, and back down to the root.', students: true },
    { href: 'vowels.html', name: 'Vowels', blurb: 'Sing each note on a list of vowels and see which ones pull you flat or sharp.', students: false },
    { href: 'harmony.html', name: 'Harmony', blurb: 'A melody note rings out; sing a 3rd above, a 3rd below or a 6th below it, all in one key.', students: false, beta: true,
      lab: 'Lab: minor keys, 4ths, 5ths and 6th above, the key chord before every one, and the interval you\'re singing shown live.' },
    { href: 'chord-tones.html', name: 'Sing from a chord', blurb: 'A real guitar or piano plays a chord; sing its root, 3rd or 5th in tune over it.', students: false, beta: true,
      lab: 'Lab: 7th chords, the 7th as a note to sing, more open chords, and the choice to stop it strumming.' },
  ];

  // ---------- Notes ----------
  const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const FLATKEY = new Set([5, 10, 3, 8, 1]);   // F, B♭, E♭, A♭, D♭ keys spell with flats
  const SHARPS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const FLATS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  SC.pcName = (pc, keyPc) => (keyPc == null ? NAMES : FLATKEY.has(keyPc) ? FLATS : SHARPS)[((pc % 12) + 12) % 12];
  SC.noteName = (m, keyPc) => SC.pcName(m, keyPc) + (Math.floor(m / 12) - 1);
  SC.KEYS = NAMES.map((n, i) => ({ pc: i, name: FLATKEY.has(i) ? FLATS[i] : (i === 6 ? 'F♯' : SHARPS[i]) }));
  SC.midiHz = m => 440 * Math.pow(2, (m - 69) / 12);
  SC.hzToMidi = f => 69 + 12 * Math.log2(f / 440);
  SC.avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  SC.median = a => { const s = [...a].sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  SC.sdev = a => { const m = SC.avg(a); return Math.sqrt(SC.avg(a.map(x => (x - m) * (x - m)))); };
  SC.lean = c => Math.abs(c) < 3 ? 'centred' : `${Math.abs(Math.round(c))}¢ ${c < 0 ? 'flat' : 'sharp'}`;
  SC.sgn = c => (c > 0 ? '+' : c < 0 ? '−' : '') + Math.abs(Math.round(c));
  SC.zone = c => Math.abs(c) <= 10 ? 'g' : Math.abs(c) <= 25 ? 'w' : 'b';
  SC.esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  SC.ddmm = iso => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
  SC.fullDate = iso => { const d = new Date(iso); return `${SC.ddmm(iso)}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  SC.shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const { noteName, midiHz, hzToMidi, avg, median, sdev, lean, sgn, zone, esc, ddmm, fullDate } = SC;

  const INTERVAL_NAMES = ['unison', 'minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th', 'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th', 'octave'];
  SC.intervalName = semis => {
    const a = Math.abs(semis), o = Math.floor(a / 12), r = a % 12;
    if (a === 0) return 'unison';
    if (r === 0) return o === 1 ? 'octave' : `${o} octaves`;
    return INTERVAL_NAMES[r] + (o ? ' + octave' : '');
  };

  // ---------- Storage ----------
  SC.store = function (key, defaults) {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(key)); } catch (e) {}
    s = s && s.sessions ? s : { sessions: [] };
    s.settings = Object.assign({}, defaults, s.settings || {});
    s.sessions.forEach(x => { x.done = true; });
    const write = () => {
      try { const { save, ...rest } = s; localStorage.setItem(key, JSON.stringify(rest)); return true; }
      catch (e) { return false; }
    };
    // Every pitch reading (about 33 a second) is kept so the stats can be worked
    // out again, and all the apps on this site share one small storage allowance.
    // When it's full, swap the readings of the oldest finished sessions for their
    // worked-out stats (the history shows the same numbers), one session at a
    // time, until it fits. The newest sessions keep their readings longest.
    s.save = () => {
      if (write()) return true;
      for (const x of s.sessions) {
        if (!x.done || !x.items.some(n => n.f)) continue;
        x.items.forEach(n => { if (n.f) { n.st = SC.noteStats(n.f); delete n.f; } });
        x.items = x.items.filter(n => n.st);
        if (write()) return true;
      }
      return false;
    };
    return s;
  };

  // ---------- Note volume ----------
  // The "Note volume" slider: 100 = how loud the notes always were, 115 by
  // default (students found them quiet on iPhone and iPad), up to 150. Every
  // sound goes out through outFor(its context): the volume, then a soft ceiling
  // that leaves anything below 0.9 untouched and rounds off the loudest peaks
  // instead of letting them crack.
  SC.VOL_DEFAULT = 115;
  SC.MAKEUP = 2;
  let vol = SC.VOL_DEFAULT / 100;
  const outs = new Map();   // AudioContext -> its volume node
  let ceiling = null;
  SC.outFor = function (ctx) {
    if (!outs.has(ctx)) {
      if (!ceiling) {
        ceiling = new Float32Array(4097);
        for (let i = 0; i < ceiling.length; i++) {
          const x = (i / 2048 - 1) * 1.6, a = Math.abs(x);   // curve spans -1.6..1.6
          ceiling[i] = (a < 0.9 ? x : Math.sign(x) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1))) / 1.6;
        }
      }
      // The notes are normalised by their loudest instant, the strike, and then
      // die away, so the part you actually hear averaged about -18 dB (piano)
      // and -24 dB (guitar): far quieter than music on the same phone. The
      // compressor evens out strike and ring, then makeup gain lifts the
      // whole note to roughly -11 dB at the default setting. Measured 19/11/2026.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -30; comp.knee.value = 6; comp.ratio.value = 12;
      comp.attack.value = 0.003; comp.release.value = 0.25;
      const makeup = ctx.createGain(); makeup.gain.value = SC.MAKEUP;
      const g = ctx.createGain(), pre = ctx.createGain(), shaper = ctx.createWaveShaper(), post = ctx.createGain();
      g.gain.value = vol;
      pre.gain.value = 1 / 1.6; shaper.curve = ceiling; post.gain.value = 1.6;   // the shaper takes -1..1
      comp.connect(makeup).connect(g).connect(pre).connect(shaper).connect(post).connect(ctx.destination);
      outs.set(ctx, { input: comp, g });
    }
    return outs.get(ctx).input;
  };
  SC.setVolume = function (pct) {
    vol = (+pct || SC.VOL_DEFAULT) / 100;
    outs.forEach(({ g }, ctx) => { try { g.gain.setTargetAtTime(vol, ctx.currentTime, 0.02); } catch (e) { g.gain.value = vol; } });
  };

  // ---------- Audio ----------
  let actx = null, out = null;
  SC.audio = async function () {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      out = actx.createGain(); out.gain.value = 0.9;
      const comp = actx.createDynamicsCompressor();   // chords and drones stacked up shouldn't clip
      comp.threshold.value = -10; comp.ratio.value = 4;
      out.connect(comp).connect(SC.outFor(actx));   // volume after the compressor, so it isn't squashed back down
    }
    await SC.resume(actx);
    return actx;
  };
  SC.now = () => actx ? actx.currentTime : 0;

  // ---------- Real instrument recordings ----------
  // Piano: Salamander Grand (Alexander Holm, CC-BY 3.0), as hosted for Tone.js,
  //   one recording every three semitones, the rest pitched from the nearest.
  // Guitar: acoustic steel-string from nbrosowsky/tonejs-instruments (CC-BY 3.0),
  //   every semitone from D2 to D5.
  // Each recording's own tuning is measured when it loads and corrected, so the
  // reference you sing against is exact even if the recording was a few cents out.
  const FILE = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
  const SETS = {
    piano: { base: 'https://tonejs.github.io/audio/salamander/', have: [], name: 'Piano' },
    guitar: { base: 'https://nbrosowsky.github.io/tonejs-instruments/samples/guitar-acoustic/', have: [], name: 'Guitar' },
  };
  for (let m = 24; m <= 93; m += 3) SETS.piano.have.push(m);          // C1 .. A6
  for (let m = 38; m <= 74; m++) SETS.guitar.have.push(m);           // D2 .. D5
  const sampleCache = new Map();   // "piano:60" -> Promise<{buf, tune}|null>
  SC.tuning = {};                  // "piano:60" -> cents the recording was out (for the lab page)
  function nearestSample(kind, m) {
    const have = SETS[kind].have;
    return have.reduce((b, x) => Math.abs(x - m) < Math.abs(b - m) ? x : b, have[0]);
  }
  function loadSample(kind, sm) {
    const k = kind + ':' + sm;
    if (!sampleCache.has(k)) sampleCache.set(k, (async () => {
      const url = SETS[kind].base + FILE[sm % 12] + (Math.floor(sm / 12) - 1) + '.mp3';
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      const ab = await res.arrayBuffer();
      const buf = await new Promise((ok, no) => actx.decodeAudioData(ab, ok, no));
      const tune = measureTuning(buf, sm);
      SC.tuning[k] = tune;
      return { buf, tune };
    })().catch(() => null));
    const p = sampleCache.get(k);
    if (!('done' in p)) { p.done = null; p.then(v => { p.done = v; }); }   // lets SC.note check it without waiting
    return p;
  }
  function measureTuning(buf, sm) {
    const d = buf.getChannelData(0), sr = buf.sampleRate;
    const n = sm < 48 ? 8192 : 4096, readings = [];
    for (const at of [0.2, 0.45, 0.7]) {
      const s = Math.floor(sr * at);
      if (s + n > d.length) break;
      const r = SC.detectPitch(d.subarray(s, s + n), sr, 30, 2500);
      if (!r || r.clarity < 0.85) continue;
      let c = 1200 * Math.log2(r.freq / midiHz(sm));
      c -= 1200 * Math.round(c / 1200);
      if (Math.abs(c) <= 40) readings.push(c);
    }
    return readings.length ? median(readings) : 0;
  }
  // Load everything a session will need before it starts. Returns false if the
  // recordings couldn't be fetched (offline), in which case the built-in tones play.
  SC.prepare = async function (kind, midis) {
    await SC.audio();
    if (!SETS[kind]) return true;
    const need = [...new Set(midis.map(m => nearestSample(kind, m)))];
    const got = await Promise.all(need.map(sm => loadSample(kind, sm)));
    return got.every(Boolean);
  };

  // ---------- Built-in tones (fallback, and the old "simple" sounds) ----------
  const synthCache = new Map();
  function shape(d, sr, attack) {
    const a = Math.floor(sr * attack), r = Math.floor(sr * 0.2);
    for (let i = 0; i < a; i++) d[i] *= i / a;
    for (let i = 0; i < r; i++) d[d.length - 1 - i] *= i / r;
    let peak = 0; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < d.length; i++) d[i] *= 0.7 / peak;
  }
  function synthPiano(midi) {
    const sr = actx.sampleRate, f = midiHz(midi), len = Math.floor(sr * 4), b = actx.createBuffer(1, len, sr), d = b.getChannelData(0);
    const B = 0.00008, nP = Math.max(4, Math.min(16, Math.floor(7000 / f))), tauSlow = 3.2 * Math.pow(2, -(midi - 48) / 24);
    for (let k = 1; k <= nP; k++) {
      const fk = k * f * Math.sqrt(1 + B * k * k) / Math.sqrt(1 + B), a = (k === 2 ? 0.7 : 1) / Math.pow(k, 1.25);
      const r = (1 / tauSlow) * (1 + 0.45 * Math.pow(k - 1, 1.2));
      for (const det of [-0.0004, 0.0004]) {
        const w = 2 * Math.PI * fk * (1 + det) / sr, ph = Math.random() * 6.28;
        for (let i = 0; i < len; i++) { const t = i / sr; d[i] += a * (0.55 * Math.exp(-t * r * 5) + 0.45 * Math.exp(-t * r)) * Math.sin(w * i + ph); }
      }
    }
    shape(d, sr, 0.004);
    return { buf: b, rate: 1 };
  }
  function synthGuitar(midi) {
    const sr = actx.sampleRate, f = midiHz(midi), len = Math.floor(sr * 4), b = actx.createBuffer(1, len, sr), d = b.getChannelData(0);
    const N = Math.max(3, Math.round(sr / f + 0.5)), f0 = sr / (N - 0.5), ring = new Float32Array(N);
    let lp = 0;
    for (let i = 0; i < N; i++) { lp += 0.5 * ((Math.random() * 2 - 1) - lp); ring[i] = lp; }
    const pick = Math.max(1, Math.floor(N * 0.18)), ex = ring.slice();
    for (let i = 0; i < N; i++) ring[i] = ex[i] - 0.6 * ex[(i - pick + N) % N];
    const rho = Math.pow(0.001, 1 / (f0 * 7));
    let idx = 0;
    for (let i = 0; i < len; i++) { const y = ring[idx], nx = (idx + 1) % N; d[i] = y; ring[idx] = rho * 0.5 * (y + ring[nx]); idx = nx; }
    shape(d, sr, 0.002);
    return { buf: b, rate: f / f0 };
  }

  // One note. kind: 'piano' | 'guitar' (real) | 'tone-piano' | 'tone-guitar' (built-in).
  // Returns a handle with stop(fadeSeconds). Real recordings must have been prepare()d,
  // otherwise the built-in tone plays.
  SC.note = function (kind, midi, opt = {}) {
    const t = opt.when || actx.currentTime, gain = opt.gain == null ? 1 : opt.gain;
    let buf, rate;
    const real = SETS[kind] ? sampleCache.get(kind + ':' + nearestSample(kind, midi)) : null;
    const loaded = real && real.done;
    if (loaded) {
      const sm = nearestSample(kind, midi);
      buf = loaded.buf;
      rate = Math.pow(2, (midi - sm) / 12 - loaded.tune / 1200);
    } else {
      const base = /guitar/.test(kind) ? 'g' : 'p', k = base + midi;
      if (!synthCache.has(k)) synthCache.set(k, (base === 'g' ? synthGuitar : synthPiano)(midi));
      ({ buf, rate } = synthCache.get(k));
    }
    const src = actx.createBufferSource(), g = actx.createGain();
    src.buffer = buf; src.playbackRate.value = rate;
    // real recordings are quieter than the normalised built-in ones
    const level = gain * (loaded ? (kind === 'guitar' ? 1.6 : 1.3) : 0.8);
    g.gain.setValueAtTime(level, t);
    src.connect(g).connect(out);
    src.start(t);
    if (opt.dur) { g.gain.setValueAtTime(level, t + opt.dur); g.gain.linearRampToValueAtTime(0, t + opt.dur + 0.25); src.stop(t + opt.dur + 0.3); }
    return {
      stop(fade = 0.08) {
        try { const n = actx.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + fade); src.stop(n + fade + 0.05); } catch (e) {}
      },
    };
  };

  // Several notes, strummed low to high.
  SC.strum = function (kind, midis, opt = {}) {
    const t = opt.when || actx.currentTime, spread = opt.spread == null ? (/guitar/.test(kind) ? 0.03 : 0.012) : opt.spread;
    const per = (opt.gain == null ? 1 : opt.gain) / Math.sqrt(midis.length);
    const hs = [...midis].sort((a, b) => a - b).map((m, i) => SC.note(kind, m, { when: t + i * spread, gain: per, dur: opt.dur }));
    return { stop(f) { hs.forEach(h => h.stop(f)); } };
  };

  // A soft sustained tone that holds as long as needed: two slightly detuned
  // saws and a triangle through a gentle low-pass, slow to come in.
  SC.pad = function (midis, opt = {}) {
    midis = [].concat(midis);
    const t = actx.currentTime, gain = (opt.gain == null ? 1 : opt.gain) * 0.32 / Math.sqrt(midis.length);
    const g = actx.createGain(), lp = actx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.4;
    lp.frequency.value = Math.min(3500, midiHz(Math.max(...midis)) * 5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + (opt.attack || 0.35));
    lp.connect(g).connect(out);
    const oscs = [];
    for (const m of midis) for (const [type, det, a] of [['sawtooth', -4, 0.35], ['sawtooth', 4, 0.35], ['triangle', 0, 1]]) {
      const o = actx.createOscillator(), og = actx.createGain();
      o.type = type; o.frequency.value = midiHz(m); o.detune.value = det; og.gain.value = a;
      o.connect(og).connect(lp); o.start(t); oscs.push(o);
    }
    return { stop(fade = 0.3) { const n = actx.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + fade); oscs.forEach(o => o.stop(n + fade + 0.05)); } };
  };

  // Something that keeps sounding until stopped. sound: 'pad' | 'piano' | 'guitar'
  // | 'piano+pad' | 'guitar+pad'. Plucked sounds are struck again every few
  // seconds so they never die away completely.
  SC.ring = function (sound, midis, opt = {}) {
    midis = [].concat(midis);
    const gain = opt.gain == null ? 1 : opt.gain, parts = [], timers = [];
    const [inst, withPad] = sound === 'pad' ? [null, true] : [sound.replace('+pad', ''), /\+pad/.test(sound)];
    if (withPad) parts.push(SC.pad(midis, { gain: gain * (inst ? 0.55 : 1), attack: inst ? 0.6 : 0.35 }));
    if (inst) {
      const every = (opt.every || (inst === 'guitar' ? 4 : 3)) * 1000;
      let last = null;
      const hit = first => {
        if (last) last.stop(0.9);
        last = midis.length > 1 ? SC.strum(inst, midis, { gain: gain * (first ? 1 : 0.8) }) : SC.note(inst, midis[0], { gain: gain * (first ? 1 : 0.8) });
      };
      hit(true);
      if (opt.restrike !== false) timers.push(setInterval(() => hit(false), every));
      parts.push({ stop: f => last && last.stop(f) });
    }
    return { stop(f = 0.25) { timers.forEach(clearInterval); parts.forEach(p => p.stop(f)); } };
  };

  // ---------- Chords ----------
  SC.QUALITIES = {
    maj: { iv: [0, 4, 7], name: '' , long: 'major' },
    min: { iv: [0, 3, 7], name: 'm', long: 'minor' },
    dim: { iv: [0, 3, 6], name: 'dim', long: 'diminished' },
    7: { iv: [0, 4, 7, 10], name: '7', long: 'dominant 7th' },
    maj7: { iv: [0, 4, 7, 11], name: 'maj7', long: 'major 7th' },
    m7: { iv: [0, 3, 7, 10], name: 'm7', long: 'minor 7th' },
    m7b5: { iv: [0, 3, 6, 10], name: 'm7♭5', long: 'half-diminished' },
  };
  SC.chordName = (pc, q, keyPc) => SC.pcName(pc, keyPc == null ? pc : keyPc) + SC.QUALITIES[q].name;
  const STRINGS = [40, 45, 50, 55, 59, 64];   // E A D G B E
  const x = null;
  const OPEN = {   // frets low E to high E, x = not played
    '0maj': [x, 3, 2, 0, 1, 0], '07': [x, 3, 2, 3, 1, 0], '0maj7': [x, 3, 2, 0, 0, 0],
    '2maj': [x, x, 0, 2, 3, 2], '2min': [x, x, 0, 2, 3, 1], '27': [x, x, 0, 2, 1, 2], '2maj7': [x, x, 0, 2, 2, 2], '2m7': [x, x, 0, 2, 1, 1],
    '4maj': [0, 2, 2, 1, 0, 0], '4min': [0, 2, 2, 0, 0, 0], '47': [0, 2, 0, 1, 0, 0], '4m7': [0, 2, 2, 0, 3, 0], '4maj7': [0, 2, 1, 1, 0, 0],
    '5maj': [1, 3, 3, 2, 1, 1], '5maj7': [x, x, 3, 2, 1, 0],
    '7maj': [3, 2, 0, 0, 0, 3], '77': [3, 2, 0, 0, 0, 1], '7maj7': [3, 2, 0, 0, 0, 2],
    '9maj': [x, 0, 2, 2, 2, 0], '9min': [x, 0, 2, 2, 1, 0], '97': [x, 0, 2, 0, 2, 0], '9m7': [x, 0, 2, 0, 1, 0], '9maj7': [x, 0, 2, 1, 2, 0],
    '117': [x, 2, 1, 2, 0, 2], '11dim': [x, 2, 3, 4, 3, x], '11m7b5': [x, 2, 3, 2, 3, x],
  };
  const E_SHAPE = { maj: [0, 2, 2, 1, 0, 0], min: [0, 2, 2, 0, 0, 0], 7: [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0], maj7: [0, x, 1, 1, 0, x] };
  const A_SHAPE = { maj: [x, 0, 2, 2, 2, 0], min: [x, 0, 2, 2, 1, 0], 7: [x, 0, 2, 0, 2, 0], m7: [x, 0, 2, 0, 1, 0], maj7: [x, 0, 2, 1, 2, 0], dim: [x, 0, 1, 2, 1, x], m7b5: [x, 0, 1, 0, 1, x] };
  SC.guitarShape = function (pc, q) {
    if (OPEN[pc + q]) return { frets: OPEN[pc + q], open: true };
    const opts = [];
    if (E_SHAPE[q]) opts.push({ r: (pc - 4 + 12) % 12, s: E_SHAPE[q] });
    if (A_SHAPE[q]) opts.push({ r: (pc - 9 + 12) % 12, s: A_SHAPE[q] });
    const o = opts.sort((a, b) => a.r - b.r)[0];
    return { frets: o.s.map(f => f == null ? null : f + o.r), open: false, fret: o.r };
  };
  SC.guitarVoicing = (pc, q) => SC.guitarShape(pc, q).frets.map((f, i) => f == null ? null : STRINGS[i] + f).filter(m => m != null);
  SC.pianoVoicing = function (pc, q) {
    const bass = 36 + pc + (pc > 6 ? 0 : 12);           // root between F♯2 and F♯3
    const rh = 55 + ((pc - 7 + 12) % 12);               // right hand from G3 up
    return [bass, ...SC.QUALITIES[q].iv.map(i => rh + i)];
  };
  // Diatonic chords for a key. scale: 'major' | 'minor' (natural).
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
  SC.SCALES = SCALES;
  SC.diatonic = function (keyPc, scale = 'major', sevenths = false) {
    const st = SCALES[scale], out = [];
    for (let d = 0; d < 7; d++) {
      const tone = k => st[(d + k) % 7] + 12 * Math.floor((d + k) / 7);
      const iv = [0, 2, 4, 6].map(k => tone(k) - st[d]);
      const tri = iv.slice(0, 3).join(), sev = iv[3];
      let q = tri === '0,4,7' ? 'maj' : tri === '0,3,7' ? 'min' : 'dim';
      if (sevenths) q = q === 'maj' ? (sev === 11 ? 'maj7' : '7') : q === 'min' ? 'm7' : 'm7b5';
      out.push({ pc: (keyPc + st[d]) % 12, q, degree: d });
    }
    return out;
  };
  SC.ROMAN = (d, q) => { const r = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][d]; return (/^(min|m7|dim|m7b5)$/.test(q) ? r.toLowerCase() : r) + ({ dim: '°', m7b5: 'ø7', 7: '7', maj7: 'maj7', m7: '7' }[q] || ''); };

  // ---------- Pitch detection (McLeod normalised square difference) ----------
  SC.detectPitch = function (buf, sr, fMin = 65, fMax = 1100) {
    const n = buf.length, maxTau = Math.min(n >> 1, Math.floor(sr / fMin)), minTau = Math.floor(sr / fMax);
    const nsdf = new Float32Array(maxTau);
    let sq = 0; for (let i = 0; i < n; i++) sq += buf[i] * buf[i];
    let m = 2 * sq;
    for (let tau = 0; tau < maxTau; tau++) {
      let acf = 0;
      for (let i = 0; i < n - tau; i++) acf += buf[i] * buf[i + tau];
      nsdf[tau] = m > 0 ? 2 * acf / m : 0;
      m -= buf[tau] * buf[tau] + buf[n - 1 - tau] * buf[n - 1 - tau];
    }
    const peaks = [];
    let tau = 1;
    while (tau < maxTau - 1 && nsdf[tau] > 0) tau++;
    while (tau < maxTau - 1) {
      while (tau < maxTau - 1 && nsdf[tau] <= 0) tau++;
      let best = -1;
      while (tau < maxTau - 1 && nsdf[tau] > 0) { if (best < 0 || nsdf[tau] > nsdf[best]) best = tau; tau++; }
      if (best > 0 && best >= minTau && nsdf[best] > nsdf[best - 1] && nsdf[best] >= nsdf[best + 1]) peaks.push(best);
    }
    if (!peaks.length) return null;
    let maxVal = 0; for (const p of peaks) maxVal = Math.max(maxVal, nsdf[p]);
    const pick = peaks.find(p => nsdf[p] >= 0.9 * maxVal);
    const a = nsdf[pick - 1], b = nsdf[pick], c = nsdf[pick + 1];
    const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
    return { freq: sr / (pick + shift), clarity: b };
  };

  // ---------- Microphone ----------
  // Safari (and every iPhone browser) can run a newly opened mic about 5% fast for
  // up to 20s, which reads nearly a semitone sharp. The first session waits it out.
  const isWebKit = /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent);
  const MIC_SETTLE = 20000;
  let analyser = null, abuf = null, stream = null, micOpenedAt = 0;
  SC.micOn = () => !!stream;
  SC.openMic = async function () {
    await SC.audio();
    if (stream) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser can\'t reach the microphone from here. Try Chrome or Safari.');
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
    const src = actx.createMediaStreamSource(stream);
    analyser = actx.createAnalyser(); analyser.fftSize = 4096;
    src.connect(analyser);
    abuf = new Float32Array(analyser.fftSize);
    micOpenedAt = performance.now();
    return true;
  };
  SC.closeMic = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
  SC.settleLeft = () => isWebKit && stream ? Math.max(0, MIC_SETTLE - (performance.now() - micOpenedAt)) : 0;
  const hist3 = [];
  // One reading: { rms, midi } with midi null when there's no clear pitch.
  SC.read = function (sensitivity) {
    analyser.getFloatTimeDomainData(abuf);
    let s = 0; for (let i = 0; i < abuf.length; i++) s += abuf[i] * abuf[i];
    const rms = Math.sqrt(s / abuf.length), gate = 0.02 * Math.pow(0.035, sensitivity / 100);
    let midi = null;
    if (rms >= gate) {
      const r = SC.detectPitch(abuf, actx.sampleRate);
      if (r && r.clarity >= 0.8 && r.freq >= 65 && r.freq <= 1100) midi = hzToMidi(r.freq);
    }
    if (midi == null) { hist3.length = 0; return { rms, midi: null }; }
    hist3.push(midi); if (hist3.length > 3) hist3.shift();
    return { rms, midi: median(hist3) };
  };
  SC.resetReadings = () => { hist3.length = 0; };

  // ---------- Stats ----------
  // First 0.3s of each sung stretch is the onset (scoops); the rest is "held", which
  // accuracy and lean are measured on. Frames over 50¢ out count against accuracy
  // but are left out of the lean.
  SC.noteStats = function (f) {
    if (!f || f.length < 10) return null;
    const held = [], onset = [];
    let segStart = 0, prev = -1e9, secs = 0;
    for (const [ms, c] of f) {
      if (ms - prev > 160) segStart = ms; else secs += (ms - prev) / 1000;
      prev = ms;
      (ms - segStart < 300 ? onset : held).push(c);
    }
    const H = held.length >= 5 ? held : f.map(x => x[1]);
    const near = H.filter(c => Math.abs(c) <= 50), ons = onset.filter(c => Math.abs(c) <= 100);
    const pct = k => Math.round(100 * H.filter(c => Math.abs(c) <= k).length / H.length);
    let find = null;
    for (let i = 0; i + 2 < f.length; i++) {
      if (Math.abs(f[i][1]) <= 25 && Math.abs(f[i + 1][1]) <= 25 && Math.abs(f[i + 2][1]) <= 25 && f[i + 2][0] - f[i][0] < 200) { find = f[i][0] / 1000; break; }
    }
    return {
      secs, on: pct(25), spot: pct(10), off: Math.round(100 * (1 - near.length / H.length)),
      mean: near.length >= 3 ? avg(near) : null, sd: near.length >= 3 ? sdev(near) : null,
      onset: ons.length >= 3 ? avg(ons) : null, find,
    };
  };

  // ---------- Charts ----------
  SC.leanChart = function (el, items) {
    if (!items.length) { el.innerHTML = '<p class="empty">Nothing to show yet.</p>'; return; }
    const W = Math.max(280, el.clientWidth || 600), H = 200, L = 40, Rp = 8, T = 12, B = 24, max = 50;
    const y = v => T + (H - T - B) / 2 * (1 - Math.max(-max, Math.min(max, v)) / max);
    const slot = (W - L - Rp) / items.length, bw = Math.max(3, Math.min(26, slot * 0.6));
    const every = Math.max(1, Math.ceil(items.length * 32 / (W - L)));
    let s = `<rect x="${L}" y="${y(25)}" width="${W - L - Rp}" height="${y(-25) - y(25)}" fill="var(--band)" opacity="0.5"/>`;
    s += `<rect x="${L}" y="${y(10)}" width="${W - L - Rp}" height="${y(-10) - y(10)}" fill="var(--band)"/>`;
    for (const v of [50, 25, -25, -50]) s += `<line x1="${L}" x2="${W - Rp}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${sgn(v)}¢</text>`;
    s += `<text x="${L - 6}" y="${y(0) + 4}" text-anchor="end">0</text>`;
    items.forEach((it, i) => {
      const cx = L + slot * (i + 0.5);
      if (it.v != null) {
        const y0 = y(0), y1 = y(it.v), h = Math.max(1.5, Math.abs(y1 - y0));
        s += `<rect x="${cx - bw / 2}" y="${Math.min(y0, y1)}" width="${bw}" height="${h}" rx="2" fill="${it.v < 0 ? 'var(--flat)' : 'var(--sharp)'}"/>`;
      } else s += `<text x="${cx}" y="${y(0) - 4}" text-anchor="middle">×</text>`;
      if (i % every === 0) s += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${esc(it.label)}</text>`;
      s += `<rect x="${cx - slot / 2}" y="0" width="${slot}" height="${H}" fill="transparent" data-tip="${esc(it.tip)}"/>`;
    });
    s += `<line x1="${L}" x2="${W - Rp}" y1="${y(0)}" y2="${y(0)}" stroke="var(--mute)" stroke-width="1"/>`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Average lean in cents">${s}</svg>`;
  };
  SC.lineChart = function (el, pts) {
    if (!pts.length) { el.innerHTML = '<p class="empty">Nothing to show yet.</p>'; return; }
    const W = Math.max(280, el.clientWidth || 600), H = 180, L = 40, Rp = 22, T = 12, B = 24;
    const xx = i => pts.length === 1 ? (L + W - Rp) / 2 : L + (W - L - Rp) * i / (pts.length - 1), y = v => T + (H - T - B) * (1 - v / 100);
    let s = '';
    for (const v of [0, 50, 100]) s += `<line x1="${L}" x2="${W - Rp}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`;
    s += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + xx(i) + ' ' + y(p.v)).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>`;
    const every = Math.max(1, Math.ceil(pts.length * 44 / (W - L))), slot = pts.length > 1 ? (W - L - Rp) / (pts.length - 1) : 40;
    pts.forEach((p, i) => {
      s += `<circle cx="${xx(i)}" cy="${y(p.v)}" r="4" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/>`;
      if (i % every === 0 || i === pts.length - 1) s += `<text x="${xx(i)}" y="${H - 6}" text-anchor="middle">${esc(p.label)}</text>`;
      s += `<rect x="${xx(i) - slot / 2}" y="0" width="${slot}" height="${H}" fill="transparent" data-tip="${esc(p.tip)}"/>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="On pitch percentage per session">${s}</svg>`;
  };
  document.addEventListener('pointermove', e => {
    const t = e.target.closest && e.target.closest('[data-tip]'), tip = $('tip');
    if (!tip) return;
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.getAttribute('data-tip'); tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - r.width - 8, e.clientX + 12) + 'px';
    tip.style.top = Math.max(8, e.clientY - r.height - 10) + 'px';
  });

  // ---------- Header ----------
  // Fills <div id="topline"> with the way back to all the exercises, and a Lab
  // marker on Matthew's devices.
  SC.header = function () {
    if (!document.getElementById('sc-head-css')) {   // the older pages don't load sing.css
      const st = document.createElement('style'); st.id = 'sc-head-css';
      st.textContent = '.topline{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:6px;font-size:14px}.topline a{text-decoration:none}.labpill{font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid var(--accent);color:var(--accent);margin-left:8px;vertical-align:3px}';
      document.head.appendChild(st);
    }
    const el = $('topline');
    if (el) el.innerHTML = `<a href="${SC.home}">← All singing exercises</a>${SC.lab ? '<span class="labpill">Lab</span>' : ''}`;
    document.querySelectorAll('[data-lab]').forEach(e => { e.hidden = !SC.lab; });
    document.querySelectorAll('[data-student]').forEach(e => { e.hidden = SC.lab; });
  };

  // ---------- What Start is doing, right under the Start button ----------
  // Every page writes its messages to #msg, at the bottom of the live card. On a
  // phone that's off the bottom of the screen, so a student pressing Start and
  // being refused the mic (or waiting on the permission box, or on Safari's
  // settle wait) saw nothing happen. Until a session is running, whatever #msg
  // says is repeated under the Start button, with help when the mic is refused.
  const MIC_HELP = 'If you opened this from an email or chat app, open it in Safari or Chrome instead. ' +
    'If you tapped Don\'t Allow: on iPhone or iPad, tap the aA or ⋯ button by the address, then Website Settings › Microphone › Allow; ' +
    'on Android, tap the icon left of the address, then Permissions › Microphone. Then reload the page.';
  function startStatus() {
    const btn = $('startBtn'), msg = $('msg'), row = btn && btn.parentElement;
    if (!btn || !msg || !row || $('startMsg')) return;
    const p = document.createElement('p');
    p.id = 'startMsg'; p.className = 'msg'; p.setAttribute('role', 'status');
    p.style.cssText = 'margin:10px 0 0;font-weight:600';
    row.after(p);
    let wasRunning = false;
    const sync = () => {
      const running = $('controls') && !$('controls').hidden;
      // on a phone the note to sing starts near the bottom of the screen: bring it up
      if (running && !wasRunning && $('live') && $('live').getBoundingClientRect().top > window.innerHeight * 0.4) {
        $('live').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      wasRunning = running;
      // the rest of the setup locks during a session; the note volume never does
      if ($('vol')) $('vol').disabled = false;
      let t = running ? '' : msg.textContent.trim();
      if (t === 'Listening.' || t === 'Mic off.') t = '';
      if (/AudioSession/i.test(t)) t = 'The microphone didn\'t start this time. Tap Start session again.';
      else if (/^Couldn't use the microphone|can't reach the microphone/.test(t)) t += ' ' + MIC_HELP;
      p.textContent = t; p.hidden = !t;
    };
    new MutationObserver(sync).observe(msg, { childList: true, characterData: true, subtree: true });
    if ($('controls')) new MutationObserver(sync).observe($('controls'), { attributes: true, attributeFilter: ['hidden'] });
    // anything that breaks while starting shows here rather than failing silently
    window.addEventListener('unhandledrejection', e => {
      const r = e.reason;
      msg.textContent = 'Something went wrong starting (' + ((r && (r.message || r.name)) || r) + '). Reload the page and try again.';
    });
    sync();
  }
  document.addEventListener('DOMContentLoaded', startStatus);
  // louder or quieter as the slider moves, not only when it's let go
  document.addEventListener('DOMContentLoaded', () => {
    if ($('vol')) $('vol').addEventListener('input', () => SC.setVolume($('vol').value));
  });

  // Say so the moment the mic is asked for, and nudge if the permission box
  // hasn't been answered after a few seconds.
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const gum = md.getUserMedia.bind(md);
    md.getUserMedia = function (c) {
      if (!(c && c.audio)) return gum(c);
      let waiting = true;
      if ($('msg')) $('msg').textContent = 'Asking to use the microphone…';
      const t = setTimeout(() => { if (waiting && $('msg')) $('msg').textContent = 'Waiting for the microphone. Look for a box asking to use it and tap Allow.'; }, 4000);
      // If Safari still says its audio setting can't record, hand the setting
      // back to Safari and ask once more before telling the student anything.
      return gum(c).catch(err => {
        if (!/AudioSession/i.test((err && err.message) || '')) throw err;
        try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch (e) {}
        return new Promise(r => setTimeout(r, 300)).then(() => gum(c));
      }).finally(() => { waiting = false; clearTimeout(t); });
    };
  }
  // Safari can leave resume() unanswered (after a call, or another app took the
  // sound). Never wait on it for more than a moment: the next tap retries it.
  SC.resume = ctx => ctx.state === 'running' ? Promise.resolve()
    : Promise.race([ctx.resume().catch(() => {}), new Promise(r => setTimeout(r, 1500))]);

  // ---------- Trainer ----------
  // A session is a list of prompts. Each prompt has a note to sing (target, midi)
  // and something it plays. The page supplies:
  //   key, defaults                         storage
  //   readSettings(S)                       copy the setup controls into S
  //   build(S)                              -> [prompt]  { group, target, title, ref, ask, sub, keyPc, data }
  //   sounds(S, prompts)                    -> { kind, midis } to load first (optional)
  //   play(p, S)                            -> { stop(), gateMs }  start the prompt's sound
  //   ignore(p, midi, S)                    -> true to drop a reading (sound bleeding into the mic)
  //   heard(p, midi, S)                     -> extra text under "You", e.g. the interval being sung
  //   intro(S, prompts)                     -> Promise, plays before the first prompt (optional)
  //   groupName(g)                          label for a group in summaries
  //   describe(rec)                         one-line description of a session
  //   leadIn                                ms after a prompt starts before singing is scored
  SC.trainer = function (cfg) {
    const store = SC.store(cfg.key, Object.assign({ phones: false, gate: 60, vol: SC.VOL_DEFAULT, anyOct: true, showName: true, count: 12 }, cfg.defaults));
    const S = store.settings;
    const save = () => { if (!store.save()) $('msg').textContent = 'Couldn\'t save (browser storage full or blocked). Export your sessions to keep them.'; };
    const T = { store, S, save };

    // live card
    $('live').innerHTML = `
      <div class="progress" id="progress">Not started.</div>
      <div class="strip" id="strip"></div>
      <div class="notes three">
        <div><div class="lbl" id="refLbl">Hearing</div><div class="target ref" id="refNote">–</div><div class="reftxt" id="refTxt"></div><div class="playing" id="playing"></div></div>
        <div><div class="lbl">Sing</div><div class="target" id="target">–</div><div class="ask" id="ask"></div></div>
        <div><div class="lbl">You</div><div class="heard" id="heard">–</div><div class="cents" id="cents"></div></div>
      </div>
      <div class="meter" id="meter">
        <div class="z" style="left:25%;width:50%;background:color-mix(in srgb,var(--warn) 22%,transparent)"></div>
        <div class="z" style="left:40%;width:20%;background:color-mix(in srgb,var(--good) 30%,transparent)"></div>
        <div class="tick" style="left:10%"></div><div class="tick" style="left:30%"></div><div class="tick" style="left:70%"></div><div class="tick" style="left:90%"></div>
        <div class="mid"></div><div id="needle"></div>
      </div>
      <div class="meterlbl"><span>♭ flat</span><span id="verdict"></span><span>sharp ♯</span></div>
      <canvas id="trace"></canvas>
      <div class="notestat" id="noteStat"></div>
      <div class="controls" id="controls" hidden>
        <button id="replayBtn">Hear again<kbd>R</kbd></button>
        <button class="primary big" id="nextBtn">Next<kbd>Space</kbd></button>
        <button id="finishBtn">Finish</button>
      </div>
      <div class="level"><div id="level"></div></div>
      <p class="msg" id="msg"></p>`;

    // common setup controls
    $('phones').checked = S.phones; $('gate').value = S.gate;
    if ($('vol')) { $('vol').value = S.vol; SC.setVolume(S.vol); }
    if ($('anyoct')) $('anyoct').checked = S.anyOct;
    if ($('showName')) $('showName').checked = S.showName;
    if ($('count')) $('count').value = S.count;
    const hint = () => { if ($('phonesHint')) $('phonesHint').textContent = cfg.phonesHint ? cfg.phonesHint(S) : ''; };
    const readAll = () => {
      S.phones = $('phones').checked; S.gate = +$('gate').value;
      if ($('vol')) { S.vol = +$('vol').value; SC.setVolume(S.vol); }
      if ($('anyoct')) S.anyOct = $('anyoct').checked;
      if ($('showName')) S.showName = $('showName').checked;
      if ($('count')) S.count = +$('count').value;
      cfg.readSettings(S); hint(); save();
    };
    $('setup').addEventListener('change', readAll);
    hint();

    let sess = null, playing = null, wake = null, live = { c: null, m: null }, needle = 0, lastRun = 0, lastStat = 0;
    const trace = [], marks = [], WINDOW = 10000;

    async function start() {
      if (T.settling) { T.cancel = true; return; }
      readAll();
      const prompts = cfg.build(S);
      if (!prompts.length) { $('msg').textContent = cfg.emptyMsg || 'Nothing fits those settings. Try a wider range.'; return; }
      $('startBtn').disabled = true; $('msg').textContent = 'Opening the microphone…';
      try { await SC.openMic(); } catch (e) {
        $('startBtn').disabled = false;
        $('msg').textContent = 'Couldn\'t use the microphone: ' + (e.message || e.name) + '. Allow it in the browser and try again.';
        return;
      }
      // load the recordings while Safari's mic settles
      const need = cfg.sounds ? cfg.sounds(S, prompts) : [];
      $('msg').textContent = 'Loading the instrument recordings…';
      const loads = Promise.all(need.map(n => SC.prepare(n.kind, n.midis)));
      $('startBtn').disabled = false;
      if (SC.settleLeft() > 0 && !(await settle())) return;
      const ok = (await loads).every(Boolean);
      $('msg').textContent = ok ? '' : 'Couldn\'t load the real instrument recordings (offline?), so the built-in tones will play instead.';
      const rec = { id: Date.now().toString(36), start: new Date().toISOString(), settings: JSON.parse(JSON.stringify(S)), items: [], done: false, lab: SC.lab };
      store.sessions.push(rec); save();
      sess = { rec, prompts, i: -1, cur: null };
      $('setup').querySelectorAll('select,input,button').forEach(e => { if (e.id !== 'startBtn') e.disabled = true; });
      $('startBtn').disabled = true;
      $('controls').hidden = false; $('summary').hidden = true;
      try { wake = await navigator.wakeLock.request('screen'); } catch (e) {}
      if (cfg.intro) { $('progress').textContent = 'Setting the key…'; await cfg.intro(S, prompts); }
      if (sess) next();
    }
    function settle() {
      return new Promise(resolve => {
        T.settling = true; $('skipBtn').hidden = false;
        const done = ok => { T.settling = false; T.skip = false; $('skipBtn').hidden = true; $('startBtn').textContent = 'Start session'; if (!ok) $('msg').textContent = 'Cancelled.'; resolve(ok); };
        const tick = () => {
          if (T.skip) return done(true);
          if (T.cancel) { T.cancel = false; return done(false); }
          const left = SC.settleLeft();
          if (left <= 0) return done(true);
          $('startBtn').textContent = `Mic settling… ${Math.ceil(left / 1000)}s`;
          $('msg').textContent = 'Safari can read about a semitone sharp just after the mic opens, so this gives it time. Tap Start again to cancel, or Skip the wait to begin now.';
          setTimeout(tick, 250);
        };
        tick();
      });
    }
    function stopSound() { if (playing) { playing.stop(); playing = null; } }
    function next() {
      if (!sess) return;
      if (sess.i + 1 >= sess.prompts.length) return finish();
      sess.i++;
      const p = sess.prompts[sess.i];
      sess.cur = { p, g: p.group, t: p.target, title: p.title, ask: p.ask, ref: p.ref, keyPc: p.keyPc, data: p.data, r: 0, f: [], t0: null };
      sess.rec.items.push(sess.cur);
      save();
      SC.resetReadings();
      $('refLbl').textContent = p.refLabel || 'Hearing';
      $('refNote').textContent = p.ref;
      $('refTxt').textContent = p.refSub || '';
      $('ask').textContent = p.ask;
      $('target').textContent = S.showName ? noteName(p.target, p.keyPc) : '?';
      $('noteStat').textContent = '';
      const last = sess.i + 1 >= sess.prompts.length;
      $('nextBtn').innerHTML = (last ? 'Finish ✓' : 'Next') + '<kbd>Space</kbd>';
      renderStrip();
      sound(p);
    }
    function sound(p) {
      stopSound();
      const h = cfg.play(p, S);
      playing = h;
      const now = performance.now(), quiet = h.gateMs || 0;
      sess.gateUntil = now + quiet;
      sess.cur.t0 = now + Math.max(quiet, cfg.leadIn || 0);
      marks.push({ t: now, label: p.ref, play: quiet });
    }
    function replay() { if (!sess || !sess.cur) return; sess.cur.r++; sound(sess.cur.p); }
    function renderStrip() {
      if (!sess) { $('strip').innerHTML = ''; return; }
      $('progress').textContent = `${sess.i + 1} of ${sess.prompts.length}` + (cfg.progressNote ? ' · ' + cfg.progressNote(S) : '');
      $('strip').innerHTML = sess.prompts.map((p, i) => {
        let cls = i === sess.i ? 'cur' : '';
        if (i < sess.i) { const st = SC.noteStats(sess.rec.items[i].f); cls = st ? (st.on >= 75 ? 'g' : st.on >= 45 ? 'w' : 'b') : ''; }
        return `<span class="${cls}">${esc(p.short || p.ask)}</span>`;
      }).join('');
    }
    function finish() {
      if (!sess) return;
      stopSound();
      const rec = sess.rec;
      rec.done = true; rec.end = new Date().toISOString();
      rec.items = rec.items.filter(n => n.f.length).map(({ p, ...rest }) => rest);
      sess = null;
      $('setup').querySelectorAll('select,input,button').forEach(e => { e.disabled = false; });
      $('controls').hidden = true;
      ['target', 'refNote', 'heard'].forEach(id => $(id).textContent = '–');
      ['ask', 'refTxt', 'playing', 'noteStat', 'cents'].forEach(id => $(id).textContent = '');
      $('strip').innerHTML = '';
      if (wake) { wake.release().catch(() => {}); wake = null; }
      if (cfg.readSettings) cfg.readSettings(S);   // re-enable any page-specific disabled state
      const st = sessionStats(rec);
      if (!st) {
        store.sessions = store.sessions.filter(x => x !== rec); save();
        $('progress').textContent = 'Session ended. Nothing was sung, so it wasn\'t saved.';
        return;
      }
      save();
      $('progress').textContent = 'Session saved.';
      renderSummary(rec);
    }

    // ---- live loop ----
    function analyse(now) {
      const r = SC.read(S.gate);
      $('level').style.width = Math.min(100, Math.sqrt(r.rms) * 220) + '%';
      const C = sess && sess.cur;
      let m = r.midi;
      if (m != null && C && cfg.ignore && cfg.ignore(C.p, m, S)) m = null;
      if (m == null) { live = { c: null, m: null }; trace.push({ t: now, c: null }); return; }
      let c;
      if (C) { c = (m - C.t) * 100; if (S.anyOct) c -= Math.round(c / 1200) * 1200; }
      else c = (m - Math.round(m)) * 100;
      live = { c, m };
      const gated = C && now < sess.gateUntil, listening = C && !gated && now >= C.t0;
      trace.push({ t: now, c, quiet: !listening && !!C });
      if (listening) C.f.push([Math.round(now - C.t0), Math.round(c * 10) / 10]);
    }
    function loop() {
      requestAnimationFrame(loop);
      const now = performance.now();
      if (SC.micOn() && analyser && now - lastRun >= 30) { lastRun = now; analyse(now); }
      const C = sess && sess.cur, gated = C && now < sess.gateUntil;
      $('playing').textContent = gated ? 'listen…' : C ? (now < C.t0 ? 'listen…' : 'sing') : '';
      if (live.c != null && !gated) {
        const z = zone(live.c);
        $('heard').textContent = noteName(Math.round(live.m), C ? C.keyPc : undefined);
        $('heard').className = 'heard ' + (Math.abs(live.c) <= 50 ? z : 'b');
        const extra = C && cfg.heard ? cfg.heard(C.p, live.m, S) : '';
        $('cents').textContent = (Math.abs(live.c) <= 50 ? `${sgn(live.c)}¢` : (C ? `${(live.c / 100).toFixed(1)} semitones off` : '')) + (extra ? ' · ' + extra : '');
        needle += (Math.max(-50, Math.min(50, live.c)) - needle) * 0.35;
        $('needle').style.left = (50 + needle) + '%'; $('needle').style.opacity = 1;
        $('needle').style.background = `var(--${{ g: 'good', w: 'warn', b: 'bad' }[z]})`;
        const a = Math.abs(live.c), dir = live.c < 0 ? 'flat' : 'sharp';
        $('verdict').textContent = a <= 10 ? 'Spot on' : a <= 25 ? `A touch ${dir}` : a <= 50 ? (dir[0].toUpperCase() + dir.slice(1)) : (C ? 'Off the note' : '');
      } else {
        $('heard').textContent = '–'; $('heard').className = 'heard'; $('cents').textContent = '';
        $('needle').style.opacity = 0; $('verdict').textContent = '';
      }
      if (C && now - lastStat > 250) {
        lastStat = now;
        const st = SC.noteStats(C.f);
        $('noteStat').innerHTML = st
          ? `This one: held <b>${st.secs.toFixed(1)}s</b> · <b>${st.on}%</b> on pitch${st.mean != null ? ` · leaning <b>${lean(st.mean)}</b>` : ''}${st.find != null ? ` · found in ${st.find.toFixed(1)}s` : ''}`
          : (C.f.length ? 'Keep holding…' : '');
      }
      drawTrace(now);
    }
    function drawTrace(now) {
      const cv = $('trace'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
      if (!W) return;
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      const css = getComputedStyle(document.documentElement), col = k => css.getPropertyValue('--' + k).trim();
      const R = 60, y = c => H / 2 - Math.max(-R, Math.min(R, c)) / R * (H / 2 - 8), xx = t => W - (now - t) / WINDOW * W;
      while (trace.length && now - trace[0].t > WINDOW) trace.shift();
      while (marks.length > 1 && now - marks[0].t - marks[0].play > WINDOW) marks.shift();
      g.fillStyle = col('band'); g.fillRect(0, y(25), W, y(-25) - y(25));
      g.globalAlpha = 0.35; g.fillStyle = col('good'); g.fillRect(0, y(10), W, y(-10) - y(10)); g.globalAlpha = 1;
      g.strokeStyle = col('mute'); g.globalAlpha = 0.5; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y(0)); g.lineTo(W, y(0)); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = col('mute'); g.font = '11px -apple-system,sans-serif';
      g.fillText('sharp', 6, 14); g.fillText('flat', 6, H - 6); g.fillText('+25¢', W - 34, y(25) - 3); g.fillText('−25¢', W - 34, y(-25) + 12);
      for (const mk of marks) {
        const x0 = xx(mk.t);
        if (mk.play) { g.globalAlpha = 0.12; g.fillStyle = col('accent'); g.fillRect(x0, 0, xx(mk.t + mk.play) - x0, H); g.globalAlpha = 1; }
        g.strokeStyle = col('accent'); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0, H); g.stroke(); g.setLineDash([]);
        g.fillStyle = col('accent'); g.fillText(mk.label, x0 + 4, 26);
      }
      g.lineWidth = 2.5; g.lineCap = 'round';
      for (let i = 1; i < trace.length; i++) {
        const a = trace[i - 1], b = trace[i];
        if (a.c == null || b.c == null || b.t - a.t > 160) continue;
        const z = Math.abs(b.c) > 50 ? 'b' : zone(b.c);
        g.strokeStyle = col({ g: 'good', w: 'warn', b: 'bad' }[z]); g.globalAlpha = b.quiet ? 0.25 : 1;
        g.beginPath(); g.moveTo(xx(a.t), y(a.c)); g.lineTo(xx(b.t), y(b.c)); g.stroke();
      }
      g.globalAlpha = 1;
    }
    requestAnimationFrame(loop);

    // ---- stats ----
    function sessionStats(s) {
      const items = s.items.map(n => ({ ...n, st: n.f ? SC.noteStats(n.f) : n.st })).filter(n => n.st);
      if (!items.length) return null;
      const withMean = items.filter(n => n.st.mean != null);
      return {
        items, withMean,
        on: Math.round(avg(items.map(n => n.st.on))), spot: Math.round(avg(items.map(n => n.st.spot))),
        lean: withMean.length ? avg(withMean.map(n => n.st.mean)) : null,
        secs: items.reduce((x, n) => x + n.st.secs, 0),
      };
    }
    function byGroup(items) {
      const per = new Map();
      for (const n of items) {
        if (!per.has(n.g)) per.set(n.g, { means: [], on: [], k: 0 });
        const p = per.get(n.g); p.k++; p.on.push(n.st.on); if (n.st.mean != null) p.means.push(n.st.mean);
      }
      const order = cfg.groupOrder || [...per.keys()];
      return order.filter(g => per.has(g)).map(g => { const p = per.get(g); return { g, v: p.means.length ? avg(p.means) : null, on: Math.round(avg(p.on)), k: p.k }; });
    }
    T.sessionStats = sessionStats;

    function renderSummary(rec) {
      const st = sessionStats(rec), el = $('summary');
      const finds = st.items.map(n => n.st.find).filter(x => x != null);
      const groups = byGroup(st.items);
      const ins = [];
      if (st.lean != null) ins.push(Math.abs(st.lean) < 5 ? `No overall lean: on average you were centred (${sgn(st.lean)}¢).` : `Overall you leaned <b>${lean(st.lean)}</b>.`);
      const good = groups.filter(g => g.k >= 2).sort((a, b) => b.on - a.on);
      if (good.length >= 2 && good[0].on - good[good.length - 1].on >= 5) ins.push(`Easiest: <b>${esc(cfg.groupName(good[0].g))}</b> (${good[0].on}% on pitch). Hardest: <b>${esc(cfg.groupName(good[good.length - 1].g))}</b> (${good[good.length - 1].on}%).`);
      const lost = st.items.filter(n => n.st.find == null);
      if (lost.length) ins.push(`Never settled within 25¢ on ${lost.length} of ${st.items.length}: ${lost.slice(0, 6).map(n => esc(n.title + ', ' + n.ask)).join('; ')}.`);
      const sds = st.items.map(n => n.st.sd).filter(x => x != null);
      if (sds.length) ins.push(`Held notes wavered by about ±${Math.round(median(sds))}¢ (vibrato counts here).`);
      el.innerHTML = `
        <h2>Session · ${fullDate(rec.start)} · ${esc(cfg.describe(rec))}</h2>
        <div class="tiles">
          <div class="tile"><b>${st.on}%</b><span>on pitch (within 25¢)</span></div>
          <div class="tile"><b>${st.spot}%</b><span>spot on (within 10¢)</span></div>
          <div class="tile"><b>${st.lean == null ? '–' : sgn(st.lean) + '¢'}</b><span>average lean (${st.lean == null ? 'n/a' : st.lean < 0 ? 'flat' : 'sharp'})</span></div>
          <div class="tile"><b>${finds.length ? median(finds).toFixed(1) + 's' : '–'}</b><span>to find the note (median)</span></div>
        </div>
        <h2>What stood out</h2><ul class="ins">${ins.map(x => `<li>${x}</li>`).join('')}</ul>
        <h2 style="margin-top:14px">Lean by ${esc(cfg.groupWord || 'type')}</h2><div id="sumChart"></div>
        <div class="legend"><span><i style="background:var(--flat)"></i>flat</span><span><i style="background:var(--sharp)"></i>sharp</span><span><i style="background:var(--band)"></i>±10¢ (inner) / ±25¢</span></div>
        <h2 style="margin-top:14px">What I tried</h2>
        <textarea id="sessNote" rows="2" style="width:100%;font:inherit;font-size:15px;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink)" placeholder="e.g. heard the harmony before singing it">${esc(rec.note || '')}</textarea>
        <details style="margin-top:12px"><summary style="cursor:pointer;color:var(--mute);font-size:14px">One by one</summary>
          <div style="overflow-x:auto"><table style="margin-top:8px"><tr><th>Heard</th><th>Asked</th><th>Note</th><th>On pitch</th><th>Lean</th><th>Found in</th></tr>
          ${st.items.map(n => `<tr><td>${esc(n.title)}</td><td>${esc(n.ask)}</td><td>${noteName(n.t, n.keyPc)}</td><td>${n.st.on}%</td><td>${n.st.mean == null ? '–' : sgn(n.st.mean) + '¢'}</td><td>${n.st.find == null ? 'not found' : n.st.find.toFixed(1) + 's'}</td></tr>`).join('')}
          </table></div></details>
        <div class="row" style="margin:14px 0 0"><button id="discardBtn">Discard this session</button></div>`;
      el.hidden = false;
      SC.leanChart($('sumChart'), groups.map(g => ({ label: cfg.groupShort ? cfg.groupShort(g.g) : cfg.groupName(g.g), v: g.v, tip: `${cfg.groupName(g.g)}: ${g.v == null ? 'mostly off the note' : lean(g.v)} · ${g.on}% on pitch · ${g.k} time${g.k === 1 ? '' : 's'}` })));
      $('sessNote').onchange = () => { rec.note = $('sessNote').value.trim(); save(); };
      $('discardBtn').onclick = () => {
        if (!confirm('Discard this session? It won\'t count in your history.')) return;
        store.sessions = store.sessions.filter(x => x !== rec); save();
        el.hidden = true; $('progress').textContent = 'Session discarded.';
      };
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ---- history ----
    $('history').innerHTML = `
      <div class="card" id="histTop"></div>
      <div class="card"><h2>On pitch, session by session</h2><div id="chOn"></div><p class="hint" style="margin:6px 0 0">Share of held singing within 25¢ of the note.</p></div>
      <div class="card"><h2 id="grpTitle">Lean by type</h2>
        <div class="row" style="margin:0 0 8px"><div class="tabs" id="grpPreset" style="margin:0"><button data-days="14">Last 2 weeks</button><button data-days="30">Last month</button><button data-days="0" class="on">All dates</button></div></div>
        <div id="chGrp"></div><div class="legend"><span><i style="background:var(--flat)"></i>flat</span><span><i style="background:var(--sharp)"></i>sharp</span><span><i style="background:var(--band)"></i>±10¢ (inner) / ±25¢</span></div></div>
      <div class="card"><h2>Sessions</h2><div id="sessList"></div>
        <div class="row" style="margin:12px 0 6px"><button id="exportBtn">Export sessions</button><label class="btn">Import…<input type="file" id="importFile" accept=".json,application/json" hidden></label></div>
        <p class="hint" style="margin:0">Sessions are saved in this browser only. Export now and then to keep a copy, or to move them to another device.</p></div>`;
    let grpDays = 0;
    function renderHistory() {
      const rows = store.sessions.filter(s => s.done).map(s => ({ s, st: sessionStats(s) })).filter(r => r.st);
      if (!rows.length) {
        $('histTop').innerHTML = '<h2>Your progress</h2><p class="empty">No sessions yet. Sing one and it will show up here.</p>';
        ['chOn', 'chGrp', 'sessList'].forEach(id => $(id).innerHTML = '<p class="empty">Nothing to show yet.</p>');
        return;
      }
      const ins = [], mins = Math.round(rows.reduce((x, r) => x + r.st.secs, 0) / 60);
      ins.push(`${rows.length} session${rows.length === 1 ? '' : 's'}, ${mins < 1 ? 'under a minute' : mins + ' min'} of held singing measured.`);
      if (rows.length >= 4) {
        const k = Math.min(3, Math.floor(rows.length / 2));
        const a = avg(rows.slice(-k).map(r => r.st.on)), b = avg(rows.slice(-2 * k, -k).map(r => r.st.on)), d = Math.round(a - b);
        ins.push(`Your last ${k} sessions averaged <b>${Math.round(a)}%</b> on pitch, against ${Math.round(b)}% for the ${k} before${Math.abs(d) >= 3 ? ` (<b>${d > 0 ? 'up' : 'down'} ${Math.abs(d)}</b>)` : ', about the same'}.`);
      }
      const leans = rows.map(r => r.st.lean).filter(x => x != null);
      if (leans.length) ins.push(`All-time average lean: <b>${lean(avg(leans))}</b>.`);
      $('histTop').innerHTML = `<h2>Your progress</h2><ul class="ins">${ins.map(x => `<li>${x}</li>`).join('')}</ul>`;
      SC.lineChart($('chOn'), rows.map(r => ({ v: r.st.on, label: ddmm(r.s.start), tip: `${fullDate(r.s.start)}: ${r.st.on}% on pitch, ${r.st.spot}% spot on` })));
      const since = grpDays ? Date.now() - grpDays * 864e5 : 0;
      const inRange = rows.filter(r => new Date(r.s.start).getTime() >= since);
      $('grpTitle').textContent = `Lean by ${cfg.groupWord || 'type'}, ${grpDays === 14 ? 'last 2 weeks' : grpDays === 30 ? 'last month' : 'all dates'}`;
      document.querySelectorAll('#grpPreset button').forEach(b => b.classList.toggle('on', +b.dataset.days === grpDays));
      const groups = byGroup(inRange.flatMap(r => r.st.items));
      SC.leanChart($('chGrp'), groups.map(g => ({ label: cfg.groupShort ? cfg.groupShort(g.g) : cfg.groupName(g.g), v: g.v, tip: `${cfg.groupName(g.g)}: ${g.v == null ? 'mostly off the note' : lean(g.v)}, ${g.on}% on pitch, ${g.k} time${g.k === 1 ? '' : 's'}` })));
      $('sessList').innerHTML = `<div style="overflow-x:auto"><table class="sl"><tr><th>When</th><th>On pitch</th><th>Spot on</th><th>Lean</th><th></th></tr>${
        [...rows].reverse().map(({ s, st }) => `<tr><td><a href="#" data-open="${s.id}">${ddmm(s.start)} ${fullDate(s.start).slice(-5)}</a><br><span style="font-size:11.5px;color:var(--mute)">${esc(cfg.describe(s))}</span>${s.note ? `<br><span style="font-size:12.5px">${esc(s.note)}</span>` : ''}</td><td>${st.on}%</td><td>${st.spot}%</td><td>${st.lean == null ? '–' : sgn(st.lean) + '¢'}</td><td class="x"><button data-del="${s.id}" title="Delete this session">✕</button></td></tr>`).join('')
      }</table></div>`;
    }
    $('grpPreset').addEventListener('click', e => { const b = e.target.closest('[data-days]'); if (b) { grpDays = +b.dataset.days; renderHistory(); } });
    $('sessList').addEventListener('click', e => {
      const o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]');
      if (o) { e.preventDefault(); showTab('practise'); renderSummary(store.sessions.find(x => x.id === o.dataset.open)); }
      if (d) {
        const s = store.sessions.find(x => x.id === d.dataset.del);
        if (s && confirm(`Delete the session from ${fullDate(s.start)}? This can't be undone.`)) { store.sessions = store.sessions.filter(x => x !== s); save(); renderHistory(); }
      }
    });
    $('exportBtn').onclick = () => {
      const d = new Date(), name = `${cfg.key}-${d.toISOString().slice(0, 10)}.json`;
      const blob = new Blob([JSON.stringify({ app: cfg.key, v: 1, exported: d.toISOString(), sessions: store.sessions.filter(s => s.done) })], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('importFile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text()), have = new Set(store.sessions.map(s => s.id));
        const add = (data.sessions || []).filter(s => s && s.id && Array.isArray(s.items) && !have.has(s.id)).map(s => ({ ...s, done: true }));
        store.sessions.push(...add); store.sessions.sort((a, b) => a.start < b.start ? -1 : 1); save(); renderHistory();
        alert(`Imported ${add.length} session${add.length === 1 ? '' : 's'}${add.length ? '' : ' (they were all here already)'}.`);
      } catch (err) { alert('That file couldn\'t be read as a sessions export.'); }
      e.target.value = '';
    };

    // ---- wiring ----
    function showTab(t) {
      document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
      $('practise').hidden = t !== 'practise'; $('history').hidden = t !== 'history';
      if (t === 'history') renderHistory();
    }
    document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
    $('startBtn').onclick = start;
    $('skipBtn').onclick = () => { T.skip = true; };
    $('nextBtn').onclick = next;
    $('replayBtn').onclick = replay;
    $('finishBtn').onclick = finish;
    document.addEventListener('keydown', e => {
      if (!sess || e.metaKey || e.ctrlKey || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
      if (document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
      if (e.code === 'Space') { e.preventDefault(); next(); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); replay(); }
    });
    addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (!$('history').hidden) renderHistory(); }, 200); });
    T.running = () => !!sess;
    return T;
  };

  // Fill a pair of From/To range selects.
  SC.rangeSelects = function (loEl, hiEl, lo, hi, min = 36, max = 84) {
    for (const el of [loEl, hiEl]) for (let m = min; m <= max; m++) el.add(new Option(noteName(m), m));
    loEl.value = lo; hiEl.value = hi;
  };
})();
