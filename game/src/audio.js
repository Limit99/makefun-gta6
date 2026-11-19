// audio.js - all sound in Neon Harbor: Vice Run is synthesized with the
// Web Audio API: engine hum, police siren, gunshots, impacts, pickups, cash
// and a small bass-driven music loop. No audio files, no network requests.
NH.Audio = (function () {
  let ctx = null, master = null;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let sirenOsc = null, sirenGain = null, sirenTimer = 0, sirenHigh = false;
  let musicTimer = null, musicStep = 0;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  function noise(dur, vol, low) {
    if (!ensure()) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = low ? 'lowpass' : 'highpass';
    f.frequency.value = low ? 500 : 1200;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  // --- continuous engine hum, pitch follows speed ---
  function engineStart() {
    if (!ensure() || engineOsc) return;
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
    engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 400;
    engineGain = ctx.createGain(); engineGain.gain.value = 0.0;
    engineOsc.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(master);
    engineOsc.start();
  }
  function engineUpdate(speedRatio) {
    if (!engineOsc) return;
    const t = ctx.currentTime;
    engineOsc.frequency.setTargetAtTime(55 + Math.abs(speedRatio) * 165, t, 0.05);
    engineFilter.frequency.setTargetAtTime(300 + Math.abs(speedRatio) * 900, t, 0.05);
    engineGain.gain.setTargetAtTime(0.05 + Math.abs(speedRatio) * 0.06, t, 0.05);
  }
  function engineStop() {
    if (!engineOsc) return;
    try { engineOsc.stop(); } catch (e) {}
    engineOsc = null; engineGain = null; engineFilter = null;
  }

  // --- police siren (two-tone) while any cop is close ---
  function sirenUpdate(dt, active) {
    if (!ensure()) return;
    if (active && !sirenOsc) {
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle';
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0.035;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
    }
    if (!active && sirenOsc) {
      try { sirenOsc.stop(); } catch (e) {}
      sirenOsc = null; sirenGain = null; return;
    }
    if (sirenOsc) {
      sirenTimer += dt;
      if (sirenTimer > 0.42) {
        sirenTimer = 0; sirenHigh = !sirenHigh;
        sirenOsc.frequency.setValueAtTime(sirenHigh ? 1180 : 830, ctx.currentTime);
      }
    }
  }

  // --- tiny synthwave loop: bass pulse + soft pad chords ---
  const BASS = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 73.4, 0, 82.4, 0];
  function musicStart() {
    if (!ensure() || musicTimer) return;
    musicTimer = setInterval(function () {
      if (!ctx || ctx.state !== 'running') return;
      const note = BASS[musicStep % BASS.length];
      if (note) tone(note, 0.22, 'triangle', 0.10);
      if (musicStep % 16 === 0) { tone(220, 1.4, 'sine', 0.03); tone(261.6, 1.4, 'sine', 0.025); }
      musicStep++;
    }, 235);
  }
  function musicStop() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

  return {
    unlock: ensure,
    shot: function () { noise(0.14, 0.5, false); tone(160, 0.1, 'square', 0.15, 60); },
    dryFire: function () { tone(900, 0.04, 'square', 0.08); },
    reload: function () { tone(500, 0.06, 'square', 0.1); setTimeout(function () { tone(700, 0.06, 'square', 0.1); }, 130); },
    hit: function () { noise(0.08, 0.25, true); },
    crash: function (hard) { noise(0.3, hard ? 0.5 : 0.25, true); tone(90, 0.25, 'sine', 0.2, 40); },
    pickup: function () { tone(880, 0.09, 'sine', 0.18); setTimeout(function () { tone(1320, 0.12, 'sine', 0.18); }, 70); },
    cash: function () { [660, 880, 1100].forEach(function (f, i) { setTimeout(function () { tone(f, 0.1, 'triangle', 0.15); }, i * 60); }); },
    missionDone: function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { tone(f, 0.22, 'triangle', 0.16); }, i * 110); }); },
    busted: function () { tone(392, 0.3, 'triangle', 0.2); setTimeout(function () { tone(311, 0.5, 'triangle', 0.2); }, 220); },
    wasted: function () { tone(220, 0.9, 'sawtooth', 0.12, 55); },
    door: function () { tone(240, 0.08, 'square', 0.12, 140); },
    engineStart: engineStart, engineUpdate: engineUpdate, engineStop: engineStop,
    sirenUpdate: sirenUpdate,
    musicStart: musicStart, musicStop: musicStop
  };
})();
