// scripts/check-answers.js
// Check A1/A2 JSON: correct-answer presence and position distribution

const fs = require('fs');
const path = require('path');

const FILES = [
  path.join('public', 'data', 'quizData_A1.json'),
  path.join('public', 'data', 'quizData_A2.json'),
];

const QUESTION_KEYS = ['question','text','prompt','stem','title','sentence','query'];
const CHOICES_KEYS  = ['choices','options','answers','variants','alternatives'];
const HINT_KEYS     = ['hint','hints','clue','tip'];
const CORRECT_KEYS  = [
  'correct','correctAnswer','correct_answer','answer','key','solution',
  'correctIndex','answerIndex','index','answer_idx',
  'letter','answerLetter','correctLetter','ans','answer_text','correct_text'
];

function deepFirstString(node, depth = 0) {
  if (node == null) return '';
  if (typeof node === 'string') return node.trim();
  if (typeof node === 'number') return String(node);
  if (depth > 7) return '';
  if (Array.isArray(node)) {
    for (const v of node) {
      const s = deepFirstString(v, depth + 1);
      if (s) return s;
    }
    return '';
  }
  if (typeof node === 'object') {
    // favor explicit keys first
    for (const k of QUESTION_KEYS.concat(['en','english','label','value','name','display'])) {
      if (k in node) {
        const s = deepFirstString(node[k], depth + 1);
        if (s) return s;
      }
    }
    for (const v of Object.values(node)) {
      const s = deepFirstString(v, depth + 1);
      if (s) return s;
    }
  }
  return '';
}
function normalizeChoices(arr) {
  if (!Array.isArray(arr)) return [];
  const out = arr.map(v => deepFirstString(v)).filter(Boolean);
  const seen = new Set();
  return out.filter(x => (seen.has(x) ? false : (seen.add(x), true)));
}
function pick(obj, keys) {
  for (const k of keys) if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  return undefined;
}
function norm(s){ return String(s||'').toLowerCase().replace(/\s+/g,' ').trim(); }
function letterToIndex(letter, total) {
  const L = String(letter||'').trim().toUpperCase();
  if (!L) return -1;
  const i = L.charCodeAt(0) - 65;
  return (i >= 0 && i < total) ? i : -1;
}
function matchCorrectIndex(choices, correctRaw) {
  if (correctRaw == null) return -1;

  if (typeof correctRaw === 'number') {
    if (correctRaw >= 0 && correctRaw < choices.length) return correctRaw;        // 0-based
    if (correctRaw - 1 >= 0 && correctRaw - 1 < choices.length) return correctRaw - 1; // 1-based
  }
  const byLetter = letterToIndex(correctRaw, choices.length);
  if (byLetter >= 0) return byLetter;

  const raw = norm(correctRaw);
  if (!raw) return -1;
  for (let i = 0; i < choices.length; i++) {
    if (norm(choices[i]) === raw) return i;
  }
  return -1;
}
function arraysEqualNormalized(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (norm(a[i]) !== norm(b[i])) return false;
  return true;
}
function deepFindCorrectIndex(node, choices, depth = 0) {
  if (node == null || depth > 7) return -1;

  if (typeof node === 'number' || typeof node === 'string') {
    const idx = matchCorrectIndex(choices, node);
    return (idx >= 0) ? idx : -1;
  }
  if (Array.isArray(node)) {
    // skip arrays that are exactly the choices list
    if (arraysEqualNormalized(node.map(deepFirstString), choices)) return -1;
    for (const v of node) {
      const idx = deepFindCorrectIndex(v, choices, depth + 1);
      if (idx >= 0) return idx;
    }
    return -1;
  }
  if (typeof node === 'object') {
    for (const k of CORRECT_KEYS) if (k in node) {
      const idx = matchCorrectIndex(choices, node[k]);
      if (idx >= 0) return idx;
    }
    for (const v of Object.values(node)) {
      // skip fields that *are* the choices list
      if (Array.isArray(v) && arraysEqualNormalized(v.map(deepFirstString), choices)) continue;
      const idx = deepFindCorrectIndex(v, choices, depth + 1);
      if (idx >= 0) return idx;
    }
  }
  return -1;
}
function normalizeRecord(rec) {
  if (!rec || typeof rec !== 'object') return null;

  let qText = deepFirstString(pick(rec, QUESTION_KEYS)) || deepFirstString(rec);

  let choices = normalizeChoices(pick(rec, CHOICES_KEYS));
  if (choices.length < 2) {
    for (const v of Object.values(rec)) {
      if (Array.isArray(v)) {
        const c = normalizeChoices(v);
        if (c.length >= 2) { choices = c; break; }
      }
    }
  }

  const hint = deepFirstString(pick(rec, HINT_KEYS)) || '';
  const correctIndex = deepFindCorrectIndex(rec, choices);

  if (!qText && choices.length === 0) return null;
  return { questionText: qText, choices, hint, correctIndex, raw: rec };
}

function collectQuestions(node, out = []) {
  if (!node) return out;
  if (Array.isArray(node)) { node.forEach(n => collectQuestions(n, out)); return out; }
  if (typeof node === 'object') {
    const n = normalizeRecord(node);
    if (n && n.choices.length >= 2) out.push(n);
    for (const v of Object.values(node)) collectQuestions(v, out);
  }
  return out;
}

function analyze(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const json = JSON.parse(raw);
  const qs = collectQuestions(json);

  const dist = new Map();           // index -> count
  let missing = 0;                  // no correct key
  let outOfRange = 0;               // index <0 or >= choices length
  const examples = [];              // sample lines

  qs.forEach((q, idx) => {
    const ci = q.correctIndex;
    if (typeof ci !== 'number' || ci < 0 || ci >= q.choices.length) {
      if (ci < 0) missing++;
      else outOfRange++;
      if (examples.length < 6) {
        examples.push({ i: idx+1, question: q.questionText, choices: q.choices, ci });
      }
    } else {
      dist.set(ci, (dist.get(ci) || 0) + 1);
    }
  });

  // print
  console.log(`\n=== ${path.basename(file)} ===`);
  console.log(`Total detected questions: ${qs.length}`);
  if (qs.length === 0) return;

  // distribution
  const maxChoices = Math.max(...qs.map(q => q.choices.length));
  const line = [];
  for (let i = 0; i < maxChoices; i++) {
    const n = dist.get(i) || 0;
    const pct = (n / qs.length * 100).toFixed(1);
    line.push(`${i}: ${n} (${pct}%)`);
  }
  console.log(`Correct-index distribution -> ${line.join('  |  ')}`);

  console.log(`Missing correct key: ${missing}`);
  console.log(`Out-of-range index: ${outOfRange}`);

  if (examples.length) {
    console.log(`\nExamples needing attention (first ${examples.length}):`);
    for (const ex of examples) {
      console.log(`- #${ex.i}: ci=${ex.ci}  Q="${ex.question}"  Choices=[${ex.choices.join(' | ')}]`);
    }
  }

  // quick sanity: is everything index 0?
  const sumNonZero = Array.from(dist.entries()).some(([i, n]) => i !== 0 && n > 0);
  if (!sumNonZero && (dist.get(0) || 0) > 0 && missing === 0) {
    console.log('⚠️  All correct answers appear at index 0. That suggests the dataset (not the UI) pins answers to the first choice.');
  }
}

FILES.forEach(analyze);
