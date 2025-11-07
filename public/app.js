// Quiz App — stable base + shuffle choices with preserved correct answer
// TTS / Hint / JP translation / Prev/Next retained

/* ---------- DOM ---------- */
const els = {
  level: document.getElementById("levelSel"),
  cat: document.getElementById("catSel"),
  reload: document.getElementById("reloadBtn"),
  qText: document.getElementById("questionText"),
  choices: document.getElementById("choices"),
  playQ: document.getElementById("playQuestion"),
  feedback: document.getElementById("feedback"),
  prev: document.getElementById("prevBtn"),
  next: document.getElementById("nextBtn"),
  sourceNote: document.getElementById("sourceNote"),
  meta: document.getElementById("meta"),
};

/* ---------- Data file by level ---------- */
function fileForLevel(level) {
  const lvl = (level || "A1").toUpperCase();
  return `/data/quizData_${lvl}.json`;
}

/* ---------- Azure TTS (with browser fallback) ---------- */
async function speak(text, opts) {
  const voice = (opts && opts.voice) || undefined;
  const lang  = (opts && opts.lang)  || undefined;

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, lang }),
    });
    if (!res.ok) throw new Error("Azure TTS proxy error");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
    return;
  } catch (e) {
    console.warn("Azure TTS failed, falling back:", e);
  }

  try {
    const u = new SpeechSynthesisUtterance(text);
    if (lang) {
      if (lang.startsWith("ja")) u.lang = "ja-JP";
      else if (lang.toLowerCase().startsWith("en-gb")) u.lang = "en-GB";
      else u.lang = "en-US";
    } else u.lang = "en-US";
    u.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) {
    console.warn("Speech synthesis not available:", e);
  }
}

/* ---------- Helpers (robust extraction) ---------- */
const QUESTION_KEYS = ["question","text","prompt","stem","title","sentence","query"];
const CHOICES_KEYS  = ["choices","options","answers","variants","alternatives"];
const HINT_KEYS     = ["hint","hints","clue","tip"];

// STRICT: only keys we explicitly support (no generic "index")
const CORRECT_KEYS  = [
  "correct",          // boolean or object
  "correctAnswer",    // { en: "Apple", ja: "りんご" } or "Apple"
  "answer",           // "Apple"
  "correctIndex",     // 0-based or 1-based number
  "correctLetter"     // "A" | "B" | ...
];

function deepFirstString(node, depth = 0) {
  if (node == null) return "";
  if (typeof node === "string") return node.trim();
  if (typeof node === "number") return String(node);
  if (depth > 7) return "";
  if (Array.isArray(node)) {
    for (const v of node) { const s = deepFirstString(v, depth + 1); if (s) return s; }
    return "";
  }
  if (typeof node === "object") {
    const preferred = ["en","english", ...QUESTION_KEYS, "label","value","name","display"];
    for (const k of preferred) if (k in node) {
      const s = deepFirstString(node[k], depth + 1);
      if (s) return s;
    }
    for (const v of Object.values(node)) {
      const s = deepFirstString(v, depth + 1);
      if (s) return s;
    }
  }
  return "";
}

function normalizeChoices(arr) {
  if (!Array.isArray(arr)) return [];
  const out = arr.map(v => deepFirstString(v)).filter(Boolean);
  const seen = new Set();
  return out.filter(x => (seen.has(x) ? false : (seen.add(x), true)));
}

function pick(obj, keys) {
  for (const k of keys) if (obj && Object.prototype.hasOwnProperty.call(obj,k)) return obj[k];
  return undefined;
}

function norm(s){ return String(s||"").toLowerCase().replace(/\s+/g," ").trim(); }

/* ---------- Correct answer detection (strict) ---------- */
// returns the index of the correct choice or -1
function deepFindCorrectIndex(node, choices) {
  if (!node || typeof node !== "object") return -1;

  function normalizeStr(s){
    return String(s||"").toLowerCase().replace(/\s+/g," ").trim();
  }
  function letterToIndex(letter, total) {
    const L = String(letter||"").trim().toUpperCase();
    if (!L) return -1;
    const i = L.charCodeAt(0) - 65; // 'A' -> 0
    return (i >= 0 && i < total) ? i : -1;
  }
  function matchCorrectIndex(choices, raw) {
    // unwrap object forms like { en: "Apple", ja: "りんご" }
    if (raw && typeof raw === "object") {
      if (typeof raw.en === "string") raw = raw.en;
      else if (typeof raw.text === "string") raw = raw.text;
      else raw = Object.values(raw).find(v => typeof v === "string") || "";
    }
    if (typeof raw === "number") {
      if (raw >= 0 && raw < choices.length) return raw;       // 0-based
      if (raw-1 >= 0 && raw-1 < choices.length) return raw-1; // 1-based
    }
    const byLetter = letterToIndex(raw, choices.length);
    if (byLetter >= 0) return byLetter;

    const target = normalizeStr(raw);
    for (let i=0;i<choices.length;i++){
      if (normalizeStr(choices[i]) === target) return i;
    }
    return -1;
  }

  // Only check our strict keys (top-level + one level deep)
  for (const k of CORRECT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(node, k)) {
      const idx = matchCorrectIndex(choices, node[k]);
      if (idx >= 0) return idx;
    }
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === "object") {
      for (const k of CORRECT_KEYS) {
        if (Object.prototype.hasOwnProperty.call(v, k)) {
          const idx = matchCorrectIndex(choices, v[k]);
          if (idx >= 0) return idx;
        }
      }
    }
  }
  return -1;
}
// --- Debug helper: check which correct-answer path is used ---
window.__why = (rec, choices) => {
  let cx = -1, used = "none";
  if (rec && rec.correctAnswer != null) {
    used = "correctAnswer";
    let ans = rec.correctAnswer;
    if (typeof ans === "object") ans = ans.en || ans.text || Object.values(ans).find(v => typeof v === "string") || "";
    const target = String(ans).toLowerCase().trim();
    cx = choices.findIndex(c => String(c).toLowerCase().trim() === target);
  }
  if (cx < 0) { used = "deepFindCorrectIndex"; cx = deepFindCorrectIndex(rec, choices); }
  console.log({ used, cx, choices, recPreview: JSON.stringify(rec).slice(0,400) + "..." });
  return cx;
};
/* ---------- Normalize one record ---------- */
function normalizeRecord(rec) {
  if (!rec || typeof rec !== "object") return null;

  const qRaw = pick(rec, QUESTION_KEYS);
  let questionText = deepFirstString(qRaw) || deepFirstString(rec);

  let choicesRaw = pick(rec, CHOICES_KEYS);
  let choices = normalizeChoices(choicesRaw);
  if (choices.length < 2) {
    for (const v of Object.values(rec)) {
      if (Array.isArray(v)) {
        const c = normalizeChoices(v);
        if (c.length >= 2) { choices = c; break; }
      }
    }
  }

  const hint = deepFirstString(pick(rec, HINT_KEYS)) || "";

  // Prefer explicit correctAnswer.{en|...} if present; otherwise fall back
  let correctIndex = -1;
  if (rec && rec.correctAnswer != null) {
    let ans = rec.correctAnswer;
    if (typeof ans === "object") {
      if (typeof ans.en === "string") ans = ans.en;
      else if (typeof ans.text === "string") ans = ans.text;
      else ans = Object.values(ans).find(v => typeof v === "string") || "";
    }
    if (typeof ans === "string" && choices.length) {
      const target = ans.toLowerCase().trim();
      correctIndex = choices.findIndex(c => String(c).toLowerCase().trim() === target);
    }
  }
  if (correctIndex < 0) {
    correctIndex = deepFindCorrectIndex(rec, choices);
  }

  if (!questionText && choices.length === 0) return null;
  return { questionText, choices, hint, correctIndex };
}

/* ---------- Collect ---------- */
function collectQuestions(node, out = []) {
  if (!node) return out;
  if (Array.isArray(node)) { node.forEach(n => collectQuestions(n, out)); return out; }
  if (typeof node === "object") {
    const n = normalizeRecord(node);
    if (n && n.choices.length >= 2) out.push(n);
    for (const v of Object.values(node)) collectQuestions(v, out);
  }
  return out;
}

/* ---------- State ---------- */
let POOL = [];
let INDEX = 0;
// current rendered question is kept as pairs [{text,isCorrect}, ...]
let CURRENT_PAIRS = [];

/* ---------- Shuffle that preserves correctness ---------- */
function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

/* ---------- Render ---------- */
function clearMarks(){
  [...els.choices.children].forEach(c => c.classList.remove("selected","correct","wrong","reveal"));
}
function showBanner(ok,msg){
  els.feedback.hidden = false;
  els.feedback.className = "feedback " + (ok ? "ok" : "ng");
  els.feedback.textContent = msg;
}

function buildPairs(q){
  // map choices to {text,isCorrect}; if no answer in JSON, all false
  const pairs = q.choices.map((t, i) => ({
    text: t,
    isCorrect: (typeof q.correctIndex === "number" && q.correctIndex >= 0)
      ? (i === q.correctIndex)
      : false
  }));
  shuffleInPlace(pairs);
  return pairs;
}

function renderChoices() {
  els.choices.innerHTML = "";
  els.feedback.hidden = true;

  CURRENT_PAIRS.forEach((pair) => {
    const item = document.createElement("div");
    item.className = "choice";
    item.setAttribute("role","listitem");

    const label = document.createElement("span");
    label.className = "choice-label";
    label.textContent = pair.text;

    const play = document.createElement("button");
    play.type = "button";
    play.className = "play-under";
    play.textContent = "▶ Play it";
    play.addEventListener("click",(e)=>{ e.stopPropagation(); speak(pair.text); });

    item.appendChild(label);
    item.appendChild(play);

    item.addEventListener("click", () => {
      clearMarks();
      if (CURRENT_PAIRS.some(p => p.isCorrect)) {
        const isCorrect = pair.isCorrect === true;
        item.classList.add(isCorrect ? "correct" : "wrong");
        if (!isCorrect) {
          const idx = CURRENT_PAIRS.findIndex(p => p.isCorrect);
          const cor = els.choices.children[idx];
          if (cor) cor.classList.add("correct","reveal");
        }
        showBanner(isCorrect, isCorrect ? "✅ Correct!" : "❌ Wrong.");
      } else {
        // dataset has no correct key
        item.classList.add("selected");
        showBanner(false,"This item has no correct answer in JSON.");
      }
    });

    els.choices.appendChild(item);
  });
}

function renderQuestion(q) {
  els.qText.textContent = q.questionText || "(No question text)";
  CURRENT_PAIRS = buildPairs(q);
  renderChoices();

  const trans = document.getElementById("translationBox");
  if (trans){ trans.hidden = true; trans.textContent = ""; }
  const hint = document.getElementById("hintBox");
  if (hint){ hint.hidden = true; hint.textContent = q.hint || ""; }

  els.feedback.hidden = true;
  els.feedback.className = "feedback";

  if (els.playQ) {
    els.playQ.onclick = () => {
      const t = (els.qText.textContent || "").trim();
      if (t) speak(t);
    };
  }
}

/* ---------- Load & pool ---------- */
async function loadData() {
  const level = els.level?.value || "A1";
  const url = fileForLevel(level);
  if (els.meta) els.meta.textContent = `Source: ${url}`;
  if (els.sourceNote) els.sourceNote.textContent = `Source: ${url}`;
  const res = await fetch(url,{ cache:"no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const json = await res.json();
  return collectQuestions(json);
}
function setPoolAndRender(all) {
  POOL = all;
  INDEX = Math.min(Math.max(0, INDEX), Math.max(0, POOL.length - 1));
  if (!POOL.length) {
    els.qText.textContent = "No questions found.";
    els.choices.innerHTML = "";
    return;
  }
  renderQuestion(POOL[INDEX]);
}
async function refresh() {
  try {
    const all = await loadData();
    if (!all.length) throw new Error("No question-like entries found.");

    // Category selector (kept simple & stable; extend later)
    const prev = els.cat?.value;
    if (els.cat) {
      els.cat.innerHTML = "";
      const cats = ["__ALL__","General"];
      cats.forEach(c=>{
        const opt=document.createElement("option");
        opt.value=c; opt.textContent=(c==="__ALL__")?"(All)":c;
        els.cat.appendChild(opt);
      });
      if (prev && cats.includes(prev)) els.cat.value = prev;
    }

    INDEX = 0;
    setPoolAndRender(all);
  } catch (err) {
    console.error(err);
    els.qText.textContent = "Could not load quiz data.";
    els.choices.innerHTML = "";
    if (els.meta) els.meta.textContent = "";
    if (els.feedback) els.feedback.hidden = true;
  }
}

/* ---------- UI wiring ---------- */
function wireUI(){
  els.level?.addEventListener("change", refresh);
  els.cat?.addEventListener("change", refresh);
  els.reload?.addEventListener("click", refresh);

  els.prev?.addEventListener("click", ()=>{
    if(!POOL.length) return;
    INDEX = (INDEX-1+POOL.length)%POOL.length;
    renderQuestion(POOL[INDEX]);
  });
  els.next?.addEventListener("click", ()=>{
    if(!POOL.length) return;
    INDEX = (INDEX+1)%POOL.length;
    renderQuestion(POOL[INDEX]);
  });

  // Hint
  const hintBtn = document.getElementById("hintBtn");
  if (hintBtn && !hintBtn.dataset.bound){
    hintBtn.dataset.bound="1";
    hintBtn.addEventListener("click",()=>{
      const box = document.getElementById("hintBox");
      if(!box) return;
      const q = POOL[INDEX];
      box.textContent = (q.hint && q.hint.trim())
        ? q.hint.trim()
        : "Hint: Focus on the main idea of the question, not small details.";
      box.hidden = false;
    });
  }

  // What does it mean? (translation)
  const explainBtn = document.getElementById("explainBtn");
  if (explainBtn && !explainBtn.dataset.bound){
    explainBtn.dataset.bound="1";
    explainBtn.addEventListener("click", async ()=>{
      const t = (els.qText.textContent || "").trim();
      if(!t) return alert("No question text found.");
      const box = document.getElementById("translationBox");
      if (box){ box.hidden=false; box.textContent="翻訳中... / Translating..."; }
      try{
        const res = await fetch("/api/translate",{
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ text: t }),
        });
        if(!res.ok) throw new Error("Translation error");
        const data = await res.json();
        const jp = data.translation || "(no translation)";
        if (box) box.textContent = `日本語訳: ${jp}`;
      }catch(e){
        console.error(e);
        if (box) box.textContent = "翻訳に失敗しました。サーバーを確認してください。";
      }
    });
  }
}

wireUI();
refresh();