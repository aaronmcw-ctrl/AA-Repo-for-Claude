// Chord theory: parsing chord names, simplifying, transposing,
// guitar shapes and piano voicings, and the SVG diagrams for both.

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NICE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function notePc(name) {
  let p = LETTER[name[0]];
  if (name[1] === '#') p++;
  else if (name[1] === 'b') p--;
  return (p + 12) % 12;
}

const CHORD_RE = /^([A-G])([#b]?)((?:maj|min|dim|aug|sus|add|m|M|\+|°|ø|[0-9]|[#b](?=[0-9])|\(|\))*)(?:\/([A-G][#b]?))?$/;

// Returns null when the text is not a chord.
function parseChord(text) {
  const m = CHORD_RE.exec(text);
  if (!m) return null;
  const q = m[3] || '';
  // Reject unbalanced parentheses, e.g. "A(" from a lyric.
  if ((q.match(/\(/g) || []).length !== (q.match(/\)/g) || []).length) return null;
  const fam = family(q);
  return {
    text,
    root: notePc(m[1] + m[2]),
    rootName: m[1] + m[2],
    q,
    bass: m[4] ? notePc(m[4]) : null,
    bassName: m[4] || null,
    fam,
    simple: SIMPLE_OF[fam],
  };
}

function family(q) {
  const s = q.replace(/[()]/g, '');
  if (/^(m7b5|ø)/.test(s)) return 'm7b5';
  if (/^(dim|°)/.test(s)) return 'dim';
  if (/^(aug|\+)/.test(s)) return 'aug';
  if (/^(maj|M)/.test(s)) return 'maj7';
  if (/^(m|min)/.test(s)) return /^(m|min)(7|9|11|13)/.test(s) ? 'm7' : 'm';
  if (/^(7|9|11|13)/.test(s)) return '7';
  return '';
}

// Families a beginner plays: plain major, minor, 7 and minor 7.
const SIMPLE_OF = { '': '', m: 'm', '7': '7', m7: 'm7', maj7: '', dim: 'm', aug: '', m7b5: 'm7' };

const INTERVALS = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11], dim: [0, 3, 6], aug: [0, 4, 8], m7b5: [0, 3, 6, 10],
};

// Notes of the chord as written (used when "simple chords" is off).
function fullIntervals(c) {
  let iv = INTERVALS[c.fam].slice();
  const q = c.q;
  if (/sus4|sus(?!2)/.test(q)) iv = iv.map((i) => (i === 3 || i === 4 ? 5 : i));
  else if (/sus2/.test(q) || /^2$/.test(q)) iv = iv.map((i) => (i === 3 || i === 4 ? 2 : i));
  if (/add(9|2)/.test(q)) iv.splice(1, 0, 2);
  if (/^m?6/.test(q)) iv.push(9);
  return [...new Set(iv)].sort((a, b) => a - b);
}

function noteName(pc, keepName, shift) {
  if (shift === 0 && keepName) return keepName;
  return NICE[((pc % 12) + 12) % 12];
}

// Display name for a chord after transposing by `shift` semitones.
function chordName(c, shift, simple) {
  const root = noteName(c.root + shift, c.rootName, shift);
  if (simple) return root + c.simple;
  const bass = c.bass == null ? '' : '/' + noteName(c.bass + shift, c.bassName, shift);
  return root + c.q + bass;
}

// ---------- Guitar ----------
// Frets listed low E to high e. -1 = don't play, 0 = open.
const OPEN = {
  '0': { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  '07': { frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
  '2': { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  '2m': { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  '27': { frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  '2m7': { frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] },
  '4': { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  '4m': { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  '47': { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  '4m7': { frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] },
  '5': { frets: [-1, -1, 3, 2, 1, 1], fingers: [0, 0, 3, 2, 1, 1], barre: 1 },
  '7': { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  '77': { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  '9': { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  '9m': { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  '97': { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] },
  '9m7': { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
  '117': { frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },
};

function barreShape(pc, fam) {
  const fe = (pc - 4 + 12) % 12; // root on the low E string
  const fa = (pc - 9 + 12) % 12; // root on the A string
  const useE = fe !== 0 && (fa === 0 || fe <= fa);
  const f = useE ? fe : fa;
  const add = (arr) => arr.map((x) => (x < 0 ? -1 : f + x));
  if (useE) {
    const T = {
      '': [[0, 2, 2, 1, 0, 0], [1, 3, 4, 2, 1, 1]],
      m: [[0, 2, 2, 0, 0, 0], [1, 3, 4, 1, 1, 1]],
      '7': [[0, 2, 0, 1, 0, 0], [1, 3, 1, 2, 1, 1]],
      m7: [[0, 2, 0, 0, 0, 0], [1, 3, 1, 1, 1, 1]],
    }[fam];
    return { frets: add(T[0]), fingers: T[1], barre: f };
  }
  const T = {
    '': [[-1, 0, 2, 2, 2, 0], [0, 1, 3, 3, 3, 1]],
    m: [[-1, 0, 2, 2, 1, 0], [0, 1, 3, 4, 2, 1]],
    '7': [[-1, 0, 2, 0, 2, 0], [0, 1, 3, 1, 4, 1]],
    m7: [[-1, 0, 2, 0, 1, 0], [0, 1, 3, 1, 2, 1]],
  }[fam];
  return { frets: add(T[0]), fingers: T[1], barre: f };
}

function guitarShape(pc, fam) {
  pc = ((pc % 12) + 12) % 12;
  return OPEN[pc + fam] || barreShape(pc, fam);
}

function isOpenShape(pc, fam) {
  return !!OPEN[(((pc % 12) + 12) % 12) + fam];
}

// Suggest a capo (0-7) only when it clearly makes the song easier:
// fewer barre chords, weighted by how often each chord is played.
function suggestCapo(chords) {
  const cost = (capo) => chords.reduce((sum, c) => {
    const pc = (((c.root - capo) % 12) + 12) % 12;
    const hard = isOpenShape(pc, c.simple) ? (pc === 5 && c.simple === '' ? 0.5 : 0) : 1;
    return sum + hard * (c.count || 1);
  }, 0);
  const base = cost(0);
  let best = 0, bestScore = base;
  for (let capo = 1; capo <= 7; capo++) {
    const sc = cost(capo) + capo * 0.15;
    if (sc < bestScore - 0.99) { bestScore = sc; best = capo; }
  }
  return best;
}

function guitarSVG(shape, opts = {}) {
  const w = opts.w || 84, h = opts.h || 100;
  const strings = 6, frets = 4;
  const left = 12, right = w - 8, top = 22, bottom = h - 6;
  const sx = (right - left) / (strings - 1);
  const fy = (bottom - top) / frets;
  const played = shape.frets.filter((f) => f > 0);
  const max = Math.max(...played, 0);
  const base = max <= 4 ? 1 : Math.min(...played);
  let s = `<svg class="gtr" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`;
  // nut or position label
  if (base === 1) s += `<rect x="${left - 1}" y="${top - 3}" width="${right - left + 2}" height="4" class="nut"/>`;
  else s += `<text x="${left - 3}" y="${top + fy / 2 + 4}" class="fr" text-anchor="end">${base}</text>`;
  for (let i = 0; i <= frets; i++) s += `<line x1="${left}" x2="${right}" y1="${top + i * fy}" y2="${top + i * fy}" class="ln"/>`;
  for (let i = 0; i < strings; i++) s += `<line x1="${left + i * sx}" x2="${left + i * sx}" y1="${top}" y2="${bottom}" class="ln"/>`;
  // barre
  if (shape.barre) {
    const idx = shape.frets.map((f, i) => (f === shape.barre && shape.fingers[i] === 1 ? i : -1)).filter((i) => i >= 0);
    if (idx.length > 1) {
      const y = top + (shape.barre - base + 0.5) * fy;
      const x1 = left + idx[0] * sx, x2 = left + idx[idx.length - 1] * sx;
      s += `<rect x="${x1 - 6}" y="${y - 6}" width="${x2 - x1 + 12}" height="12" rx="6" class="dot"/>`;
    }
  }
  shape.frets.forEach((f, i) => {
    const x = left + i * sx;
    if (f < 0) s += `<text x="${x}" y="${top - 8}" class="mk" text-anchor="middle">×</text>`;
    else if (f === 0) s += `<circle cx="${x}" cy="${top - 11}" r="3.2" class="open"/>`;
    else {
      const y = top + (f - base + 0.5) * fy;
      s += `<circle cx="${x}" cy="${y}" r="6.5" class="dot"/>`;
      if (shape.fingers[i]) s += `<text x="${x}" y="${y + 3.6}" class="fn" text-anchor="middle">${shape.fingers[i]}</text>`;
    }
  });
  return s + '</svg>';
}

// ---------- Piano ----------
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const isWhite = (pc) => WHITE_PCS.includes(((pc % 12) + 12) % 12);

// Right hand plays the chord from its root; fingers 1-3-5 (or 1-2-3-5).
function pianoSVG(rootPc, intervals, bassPc, opts = {}) {
  rootPc = ((rootPc % 12) + 12) % 12;
  // Start the keyboard on the white key at or just below the root.
  let start = 12 + rootPc;
  while (!isWhite(start)) start--;
  const whites = [];
  for (let n = start; whites.length < 10; n++) if (isWhite(n)) whites.push(n);
  const notes = intervals.map((i) => 12 + rootPc + i);
  const fingers = intervals.length >= 4 ? [1, 2, 3, 5] : [1, 3, 5];
  const w = opts.w || 150, h = opts.h || 62;
  const kw = w / whites.length;
  let s = `<svg class="pno" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`;
  const fingerOf = (n) => { const k = notes.indexOf(n); return k < 0 ? 0 : fingers[Math.min(k, fingers.length - 1)] || ''; };
  whites.forEach((n, i) => {
    const on = notes.includes(n);
    s += `<rect x="${i * kw + 0.5}" y="0.5" width="${kw - 1}" height="${h - 1}" rx="2.5" class="wk${on ? ' on' : ''}"/>`;
    if (on) s += `<text x="${i * kw + kw / 2}" y="${h - 7}" class="pf" text-anchor="middle">${fingerOf(n)}</text>`;
  });
  const bh = h * 0.6, bw = kw * 0.62;
  whites.forEach((n, i) => {
    if (i === whites.length - 1) return;
    const b = n + 1;
    if (isWhite(b)) return;
    const on = notes.includes(b);
    const x = (i + 1) * kw - bw / 2;
    s += `<rect x="${x}" y="0" width="${bw}" height="${bh}" rx="2" class="bk${on ? ' on' : ''}"/>`;
    if (on) s += `<text x="${x + bw / 2}" y="${bh - 6}" class="pf pfb" text-anchor="middle">${fingerOf(b)}</text>`;
  });
  return s + '</svg>';
}

window.Theory = {
  parseChord, chordName, guitarShape, guitarSVG, pianoSVG, fullIntervals,
  INTERVALS, suggestCapo, isOpenShape, NICE, notePc,
};
