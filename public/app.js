// === Quiz App (with per-choice "Play it" + Azure TTS + bells) ===
(() => {
  // ----- Elements (match index.html) -----
  const $ = (s) => document.querySelector(s);
  const els = {
    levelSel: $("#levelSel"),
    catSel: $("#catSel"),
    reloadBtn: $("#reloadBtn"),

    questionText: $("#questionText"),
    playQuestion: $("#playQuestion"),
    hintBtn: $("#hintBtn"),
    explainBtn: $("#explainBtn"),

    translationBox: $("#translationBox"),
    hintBox: $("#hintBox"),
    feedback: $("#feedback"),

    choices: $("#choices"),
    prevBtn: $("#prevBtn"),
    nextBtn: $("#nextBtn"),
    sourceNote: $("#sourceNote"),
    meta: $("#meta"),
  };

  // ----- State -----
  let ALL_ITEMS = [];
  let VIEW = [];
  let idx = 0;
  let currentLevel = "A1";
  let currentCategory = "__ALL__";

  // ----- Helpers -----
  // cache-buster: only add on localhost to avoid useless CDN misses
  const cacheBust = () => (location.hostname === "localhost" ? Date.now() : null);

  async function loadJSON(url) {
    const ts = cacheBust();
    const finalUrl = ts ? (url + (url.includes("?") ? "&" : "?") + "ts=" + ts) : url;

    let r;
    try {
      r = await fetch(finalUrl, { cache: "no-store" });
    } catch (err) {
      throw new Error(`Network error while loading ${finalUrl}: ${String(err)}`);
    }
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(
        `Failed to load ${finalUrl}: ${r.status} ${r.statusText} ${text ? "— " + text.slice(0, 120) : ""}`
      );
    }
    return r.json();
  }

  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Prefer Azure shim if present; otherwise fall back to speechSynthesis
  function speak(text) {
    if (!text) return;
    try {
      if (window.azureTTS) {
        window.azureTTS(String(text));
        return;
      }
      const utt = new SpeechSynthesisUtterance(String(text));
      speechSynthesis.speak(utt);
    } catch { /* ignore */ }
  }

  // Normalize records so A1 and A2 look the same to the renderer
  function norm(rec) {
    if (!rec) return rec;
    const out = { ...rec };

    // --- A2-style normalization (tiny & contained) ---
    // question: { en, ja } -> string
    if (rec.question && typeof rec.question === "object") {
      out.question = rec.question.en || rec.question;
      // translation fallback from ja
      if (!out.translation && rec.question.ja) {
        out.translation = rec.question.ja;
      }
    }

    // choices: [{en,ja}] -> ["..."]
    if (Array.isArray(rec.choices) && typeof rec.choices[0] === "object") {
      out.choices = rec.choices.map(c => (c && typeof c === "object")
        ? (c.en ?? c.ja ?? Object.values(c)[0])
        : c
      );
    }

    // correctAnswer: {en,ja} -> "..."
    if (rec.correctAnswer && typeof rec.correctAnswer === "object") {
      out.correctAnswer = rec.correctAnswer.en ?? rec.correctAnswer.ja ?? Object.values(rec.correctAnswer)[0];
    }

    // hints: [{en,ja}] -> hint_en / hint_ja (joined)
    if (Array.isArray(rec.hints)) {
      const enArr = rec.hints.map(h => (h && typeof h === "object") ? (h.en ?? "") : String(h ?? ""));
      const jaArr = rec.hints.map(h => (h && typeof h === "object") ? (h.ja ?? "") : "");
      out.hint_en = enArr.filter(Boolean).join(" / ");
      out.hint_ja = jaArr.filter(Boolean).join(" / ");
    }
    // --- end A2 normalization ---

    // A1 compatibility helpers
    if (!Array.isArray(out.choices) && Array.isArray(out.options)) {
      out.choices = out.options;
    }

    // Compute correctIndex from correctAnswer (string/object)
    if (typeof out.correctIndex !== "number" && out.correctAnswer && Array.isArray(out.choices)) {
      let tgt = out.correctAnswer;
      if (tgt && typeof tgt === "object" && ("en" in tgt)) tgt = tgt.en;
      tgt = String(tgt).toLowerCase().trim();
      const i = out.choices.findIndex(c => String(c).toLowerCase().trim() === tgt);
      if (i >= 0) out.correctIndex = i;
    }

    // Unify hint display text
    out.hintText = out.hint ?? out.hint_en ?? out.hint_ja ?? "";

    // Category (A1: string; A2: {en,ja})
    const catRaw = out.category ?? out.Category ?? "General";
    out.__category =
      (catRaw && typeof catRaw === "object")
        ? (catRaw.en ?? catRaw.ja ?? Object.values(catRaw)[0] ?? "General")
        : String(catRaw);

    return out;
  }

  // ----- Data loading -----
  async function loadLevel(level) {
    const fileMap = {
      A1: "data/quizData_A1.json",
      A2: "data/quizData_A2.json",
      B1: "data/packs/B1-dummy.json",
      B2: "data/packs/B2-dummy.json",
    };
    const file = fileMap[level] || fileMap.A1;

    const raw = await loadJSON(file);
    const items = (Array.isArray(raw) ? raw : []).map(norm);
    if (!items.length) throw new Error(`No items in ${file}`);

    // annotate & build categories
    const cats = new Set();
    items.forEach(it => {
      it.__level = level;
      it.__source = file;
      cats.add(it.__category);
    });

    // Category select
    els.catSel.innerHTML = "";
    const optAll = document.createElement("option");
    optAll.value = "__ALL__";
    optAll.textContent = "(All)";
    els.catSel.appendChild(optAll);
    [...cats].sort().forEach(c => {
      const o = document.createElement("option");
      o.value = c; o.textContent = c;
      els.catSel.appendChild(o);
    });

    ALL_ITEMS = items;
    filterByCategory(currentCategory);
  }

  function filterByCategory(catVal) {
    currentCategory = catVal;
    VIEW = (currentCategory === "__ALL__")
      ? ALL_ITEMS.slice()
      : ALL_ITEMS.filter(it => it.__category === currentCategory);
    if (!VIEW.length) {
      els.questionText.textContent = "No items in this category.";
      els.choices.innerHTML = "";
      els.hintBox.hidden = true;
      els.translationBox.hidden = true;
      els.feedback.hidden = true;
      els.sourceNote.textContent = "";
      return;
    }
    idx = Math.min(idx, VIEW.length - 1);
    render();
  }

  // ----- Render -----
  function render() {
    const rec = VIEW[idx];
    if (!rec) return;

    const qText = rec.question || rec.questionText || rec.text || "(No question)";
    els.questionText.textContent = qText;

    // reset panels
    els.hintBox.hidden = true;
    els.translationBox.hidden = true;
    els.feedback.hidden = true;
    els.feedback.textContent = "";

    // choices
    const baseChoices = Array.isArray(rec.choices) ? rec.choices.slice() : [];
    const correctIndex = (typeof rec.correctIndex === "number") ? rec.correctIndex : -1;
    const correctText = correctIndex >= 0 ? String(baseChoices[correctIndex]) : null;

    // shuffle but keep correctness by comparing text
    const order = shuffle(baseChoices);
    const realCorrect = (correctText != null)
      ? order.findIndex(t => String(t) === correctText)
      : -1;

    els.choices.innerHTML = "";
    order.forEach((text, i) => {
      const row = document.createElement("div");
      row.className = "choice-row";

      const btn = document.createElement("button");
      btn.className = "choice";
      btn.textContent = text;

      const play = document.createElement("button");
      play.className = "mini btn-outline";
      play.type = "button";
      play.innerHTML = "▶ Play it";

      // per-choice TTS
      play.addEventListener("click", (e) => {
        e.stopPropagation();
        speak(String(text));
      });

      // answer click
      btn.addEventListener("click", () => onChoiceClick(i, realCorrect));

      row.appendChild(btn);
      row.appendChild(play);
      els.choices.appendChild(row);
    });

    // source note
    els.sourceNote.textContent = `Source: /${rec.__source}   •   ${idx + 1} / ${VIEW.length}`;
  }

  function onChoiceClick(i, correctI) {
    // visuals (works with .choice-row structure)
    [...els.choices.children].forEach((row, j) => {
      const c = row.querySelector(".choice");
      if (!c) return;
      c.classList.remove("selected", "correct", "wrong", "reveal");
      if (j === i) c.classList.add("selected");
      if (j === correctI) c.classList.add("correct", "reveal");
      if (j !== correctI && j === i) c.classList.add("wrong");
    });

    // bells
    if (i === correctI) {
      window.playCorrect && window.playCorrect();
    } else {
      window.playIncorrect && window.playIncorrect();
    }
  }

  // ----- Top buttons -----
  els.playQuestion.addEventListener("click", () => {
    const rec = VIEW[idx];
    if (!rec) return;
    const text = rec.question || rec.questionText || rec.text || "";
    speak(text);
  });

  els.hintBtn.addEventListener("click", () => {
    const rec = VIEW[idx];
    if (!rec) return;
    els.hintBox.textContent = rec.hintText || "(No hint)";
    els.hintBox.hidden = false;
  });

  els.explainBtn.addEventListener("click", async () => {
    const rec = VIEW[idx];
    if (!rec) return;

    // Prefer built-in Japanese translation if we already have it (A1/A2)
    if (rec.translation && String(rec.translation).trim()) {
      els.translationBox.textContent = rec.translation;
      els.translationBox.hidden = false;
      return;
    }

    // Fallback to GPT translate
    const text = rec.question || rec.questionText || rec.text || "";
    els.translationBox.textContent = "Translating…";
    els.translationBox.hidden = false;
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      els.translationBox.textContent = data.translation || "(翻訳に失敗しました)";
    } catch {
      els.translationBox.textContent = "(翻訳に失敗しました)";
    }
  });

  // ----- Nav -----
  els.prevBtn.addEventListener("click", () => {
    if (!VIEW.length) return;
    idx = (idx - 1 + VIEW.length) % VIEW.length;
    render();
  });
  els.nextBtn.addEventListener("click", () => {
    if (!VIEW.length) return;
    idx = (idx + 1) % VIEW.length;
    render();
  });

  els.reloadBtn.addEventListener("click", () => start());

  els.levelSel.addEventListener("change", () => {
    currentLevel = els.levelSel.value || "A1";
    start();
  });

  els.catSel.addEventListener("change", () => {
    filterByCategory(els.catSel.value || "__ALL__");
  });

  // ----- Start -----
  async function start() {
    els.questionText.textContent = "Loading...";
    els.choices.innerHTML = "";
    els.hintBox.hidden = true;
    els.translationBox.hidden = true;
    els.feedback.hidden = true;
    idx = 0;
    try {
      await loadLevel(currentLevel);
      // ensure currentCategory exists
      if (![...els.catSel.options].some(o => o.value === currentCategory)) {
        currentCategory = "__ALL__";
        els.catSel.value = "__ALL__";
      }
      filterByCategory(els.catSel.value || "__ALL__");
    } catch (e) {
      console.error(e);
      els.questionText.textContent = "Failed to load data for " + currentLevel;
    }
  }

  // defaults and boot
  currentLevel = els.levelSel.value || "A1";
  currentCategory = "__ALL__";
  document.addEventListener("DOMContentLoaded", start);
})();