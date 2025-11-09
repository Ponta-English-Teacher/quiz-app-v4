(function () {
  async function azureSpeak(text, lang) {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ text: String(text || "").slice(0, 1000), lang: lang || "en-US" })
      });
      if (!res.ok) throw new Error("TTS HTTP " + res.status + " — " + (await res.text()));
      const blob = await res.blob();
      const urlObj = URL.createObjectURL(blob);
      const audio = new Audio(urlObj);
      await audio.play().catch(()=>{});
      setTimeout(() => URL.revokeObjectURL(urlObj), 10000);
    } catch (e) {
      console.warn("Azure TTS error:", e);
    }
  }
  window.azureTTS = azureSpeak;

  try {
    if (window.speechSynthesis && !window.__azureShimInstalled) {
      window.__azureShimInstalled = true;
      const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = function (utt) {
        try {
          const text = (utt && utt.text) || (typeof utt === "string" ? utt : String(utt||""));
          if (text) { azureSpeak(text); return; }
        } catch {}
        orig(utt);
      };
    }
  } catch {}
})();
/* ---- PinPon / Buzzer (minimal, no deps) ---- */
window.playCorrect = function () {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const now = ctx.currentTime;

  function beep(freq, t0, dur=0.2, type="sine", gain=0.25) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // “ピン” then “ポン”
  beep(880, now + 0.00, 0.18, "sine", 0.28);  // A5
  beep(587, now + 0.22, 0.22, "sine", 0.30);  // D5
};

window.playIncorrect = function () {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const now = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "square"; o.frequency.setValueAtTime(140, now);
  o.frequency.linearRampToValueAtTime(110, now + 0.15);
  o.frequency.linearRampToValueAtTime(140, now + 0.30);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.28, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  o.connect(g).connect(ctx.destination);
  o.start(now); o.stop(now + 0.40);
};
