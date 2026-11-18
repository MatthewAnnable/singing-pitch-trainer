/* Teaching tools shared by the student apps. Master copy lives in
   System/design-system/teach-tools.js; each app has its own copy beside
   evening.css. Load it in <head>, before the app's own scripts.

   1. Reliable sound on iPad and iPhone.
      Safari treats Web Audio like a ringtone: the silent setting mutes it and
      it can be left "suspended" or "interrupted" after another tab or app used
      sound. (Apps that play audio files, like the play-along, aren't affected,
      which is why playing one of those used to "wake up" the others.)
      Here we ask for the media-playback channel and resume sound on every tap.

   2. A full-screen button for lessons (only where the browser allows it, so
      not on iPhone). In full screen the page sits inside a 16:9 band in the
      middle of the screen, so when the iPad is fitted to the width of an OBS
      canvas nothing is lost off the top or bottom. The button itself sits in
      the bottom strip, outside what OBS shows. */
(function () {
  "use strict";

  // ---------- 1. Sound ----------
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}

  // "playback" can't record, so switch to "play-and-record" (still not muted
  // by the silent setting) just before any app asks for the microphone.
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia && navigator.audioSession) {
    const gum = md.getUserMedia.bind(md);
    md.getUserMedia = function (c) {
      if (c && c.audio) { try { navigator.audioSession.type = "play-and-record"; } catch (e) {} }
      return gum(c);
    };
  }

  const contexts = [];
  const Base = window.AudioContext || window.webkitAudioContext;
  if (Base) {
    class Tracked extends Base {
      constructor(...args) { super(...args); contexts.push(this); }
    }
    window.AudioContext = Tracked;
    if (window.webkitAudioContext) window.webkitAudioContext = Tracked;
  }

  // Older iPadOS (before 17) has no audioSession: a silent audio file playing
  // alongside switches Safari to the media channel instead.
  let silent = null;
  function silentFallback() {
    if (navigator.audioSession || silent) return;
    const rate = 8000, n = 800, bytes = new Uint8Array(44 + n);
    const dv = new DataView(bytes.buffer);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
    str(0, "RIFF"); dv.setUint32(4, 36 + n, true); str(8, "WAVEfmt ");
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true);
    dv.setUint16(34, 8, true); str(36, "data"); dv.setUint32(40, n, true);
    bytes.fill(128, 44);
    let bin = ""; bytes.forEach(b => { bin += String.fromCharCode(b); });
    silent = new Audio("data:audio/wav;base64," + btoa(bin));
    silent.loop = true; silent.setAttribute("playsinline", "");
    silent.play().catch(() => { silent = null; });
  }

  function wake() {
    silentFallback();
    if (silent && silent.paused) silent.play().catch(() => {});
    contexts.forEach(c => {
      if (c.state !== "running" && c.state !== "closed") c.resume().catch(() => {});
    });
  }
  ["pointerdown", "touchend", "click", "keydown"].forEach(t =>
    window.addEventListener(t, wake, { capture: true, passive: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (silent) silent.pause(); }
    else wake();
  });

  // ---------- 2. Full screen ----------
  const root = document.documentElement;
  const canFull = !!(root.requestFullscreen || root.webkitRequestFullscreen) &&
    (document.fullscreenEnabled !== false) && (document.webkitFullscreenEnabled !== false);
  if (!canFull) return;

  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const enter = () => {
    try {
      const p = root.requestFullscreen ? root.requestFullscreen() : root.webkitRequestFullscreen();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  };
  const leave = () => {
    try {
      const p = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  };

  const css = document.createElement("style");
  css.textContent = `
    .tt-full {
      position: fixed; right: 12px; bottom: 12px; z-index: 2147483000;
      display: inline-flex; align-items: center; gap: 7px;
      height: 34px; padding: 0 12px; border-radius: 17px;
      border: 1px solid var(--line, rgba(127,127,127,.35));
      background: var(--card, rgba(30,30,30,.85)); color: var(--mute, #999);
      font: 600 13px/1 Manrope, system-ui, -apple-system, sans-serif;
      opacity: .75; cursor: pointer; -webkit-tap-highlight-color: transparent;
    }
    .tt-full:hover { opacity: 1; }
    .tt-full svg { width: 15px; height: 15px; }
    html.tt-fs { overflow: hidden; height: 100%; }
    html.tt-fs body {
      position: fixed; left: 0; right: 0;
      top: var(--tt-band, 0px); bottom: var(--tt-band, 0px);
      overflow-y: auto; -webkit-overflow-scrolling: touch;
      margin-top: 0; margin-bottom: 0;
    }
    html.tt-fs .tt-full { bottom: var(--tt-btn, 12px); }
  `;
  document.head.appendChild(css);

  const icon = on => on
    ? '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 1.5V6H1.5M10 1.5V6h4.5M6 14.5V10H1.5M10 14.5V10h4.5"/></svg>'
    : '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 6V1.5H6M14.5 6V1.5H10M1.5 10v4.5H6M14.5 10v4.5H10"/></svg>';

  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "tt-full";
  btn.onclick = () => (fsEl() ? leave() : enter());

  function layout() {
    const on = !!fsEl();
    root.classList.toggle("tt-fs", on);
    btn.innerHTML = icon(on) + (on ? "Exit full screen" : "Full screen");
    btn.setAttribute("aria-label", on ? "Exit full screen" : "Full screen");
    // The 16:9 band: what OBS shows when the iPad is fitted to the canvas width.
    const w = window.innerWidth, h = window.innerHeight;
    const band = on ? Math.max(0, Math.floor((h - w * 9 / 16) / 2)) : 0;
    root.style.setProperty("--tt-band", band + "px");
    root.style.setProperty("--tt-btn", (band >= 44 ? Math.floor((band - 34) / 2) : 12) + "px");
  }
  document.addEventListener("fullscreenchange", layout);
  document.addEventListener("webkitfullscreenchange", layout);
  window.addEventListener("resize", layout);

  const mount = () => { document.body.appendChild(btn); layout(); };
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
