// Reading pasted chord charts and timed lyrics (LRC), and lining them up
// into rows of lyrics with chords that know when they happen.

const SECTION_RE = /^\s*[\[(]?\s*((?:pre[- ]?chorus|post[- ]?chorus|chorus|verse|bridge|intro|outro|tag|interlude|instrumental|turnaround|ending|refrain|vamp|hook|break|coda)(?:\s*\d+)?)\s*[\])]?\s*:?\s*(.*)$/i;
const FILLER_RE = /^(x\d+|\d+x|n\.?c\.?|\/+|-+|\|+|\.{2,}|%|:)$/i;

function cleanToken(t) {
  return t.replace(/^[|(\[{]+/, '').replace(/[|)\]},.]+$/, '');
}

function isChordLine(line) {
  const toks = line.trim().split(/\s+/);
  let chords = 0;
  for (const raw of toks) {
    const t = cleanToken(raw);
    if (!t || FILLER_RE.test(t)) continue;
    if (Theory.parseChord(t)) chords++;
    else return false;
  }
  return chords > 0;
}

function chordTokens(line) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line))) {
    const lead = m[0].length - m[0].replace(/^[|(\[{]+/, '').length;
    const t = cleanToken(m[0]);
    if (t && Theory.parseChord(t)) out.push({ col: m.index + lead, ch: t });
  }
  return out;
}

function sectionHeader(line) {
  const m = SECTION_RE.exec(line);
  if (!m) return null;
  const rest = m[2].trim();
  if (!rest || /^\(?\s*(x\s*\d+|\d+\s*x|repeat.*)\s*\)?$/i.test(rest)) return { label: titleCase(m[1]), chords: null };
  if (isChordLine(rest)) return { label: titleCase(m[1]), chords: rest };
  return null;
}

function titleCase(s) {
  return s.trim().toLowerCase().replace(/(^|[\s-])\w/g, (c) => c.toUpperCase());
}

function inlineChordPro(line) {
  const re = /\[([^\]]+)\]/g;
  let lyric = '', last = 0, m, chords = [];
  while ((m = re.exec(line))) {
    lyric += line.slice(last, m.index);
    if (Theory.parseChord(m[1].trim())) chords.push({ col: lyric.length, ch: m[1].trim() });
    last = re.lastIndex;
  }
  lyric += line.slice(last);
  return chords.length ? { lyric, chords } : null;
}

const norm = (s) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Returns { lines: [{lyric, chords:[{col,ch}], section, sectionStart, norm}], chordSet }
function parseSheet(text) {
  const raw = (text || '')
    .replace(/\r/g, '')
    .replace(/\[\/?(ch|tab)\]/g, '')
    .replace(/\t/g, '    ')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''));

  const sections = [];
  let cur = { label: '', lines: [] };
  sections.push(cur);
  const startSection = (label) => { cur = { label, lines: [] }; sections.push(cur); };

  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    if (!line.trim()) continue;
    const dir = /^\s*\{\s*([\w_]+)\s*(?::\s*(.*?))?\s*\}\s*$/.exec(line);
    if (dir) {
      const d = dir[1].toLowerCase();
      if (/^(c|comment|ci)$/.test(d) && dir[2]) startSection(dir[2]);
      else if (/^(soc|start_of_chorus)$/.test(d)) startSection(dir[2] || 'Chorus');
      else if (/^(sov|start_of_verse)$/.test(d)) startSection(dir[2] || 'Verse');
      else if (/^(sob|start_of_bridge)$/.test(d)) startSection(dir[2] || 'Bridge');
      continue;
    }
    const head = sectionHeader(line);
    if (head) {
      startSection(head.label);
      if (head.chords) cur.lines.push({ lyric: '', chords: chordTokens(head.chords).map((c, k) => ({ col: k, ch: c.ch })) });
      continue;
    }
    // ChordPro bars with no words: "[G] [D] [Em]"
    if (/^\s*(\[[^\]]+\]\s*)+$/.test(line)) {
      const chs = [...line.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());
      if (chs.every((c) => Theory.parseChord(c))) {
        cur.lines.push({ lyric: '', chords: chs.map((ch, k) => ({ col: k, ch })) });
        continue;
      }
    }
    if (isChordLine(line)) {
      const chords = chordTokens(line);
      const next = raw[i + 1];
      if (next && next.trim() && !isChordLine(next) && !sectionHeader(next) && !/^\s*\{/.test(next) && !inlineChordPro(next)) {
        cur.lines.push(trimIndent({ lyric: next, chords }));
        i++;
      } else {
        cur.lines.push({ lyric: '', chords: chords.map((c, k) => ({ col: k, ch: c.ch })) });
      }
      continue;
    }
    const cp = inlineChordPro(line);
    if (cp) { cur.lines.push(trimIndent(cp)); continue; }
    // Skip obvious junk like "Capo 2" or "Key: G" or tab lines.
    if (/^\s*(capo|key|tempo|bpm|time|ccli|copyright|©|e\|)/i.test(line)) continue;
    cur.lines.push({ lyric: line.trim(), chords: [] });
  }

  // A section header with nothing under it ("Chorus") repeats an earlier one.
  const base = (l) => l.toLowerCase().replace(/\s*\d+\s*$/, '').trim();
  sections.forEach((s, i) => {
    if (s.lines.length || !s.label) return;
    const prev = sections.slice(0, i).reverse();
    const src = prev.find((p) => p.lines.length && p.label.toLowerCase() === s.label.toLowerCase()) ||
      prev.find((p) => p.lines.length && base(p.label) === base(s.label));
    if (src) s.lines = src.lines.map((l) => ({ lyric: l.lyric, chords: l.chords.slice() }));
  });

  const lines = [];
  const chordSet = new Map();
  for (const s of sections) {
    s.lines.forEach((l, k) => {
      lines.push({ ...l, section: s.label, sectionStart: k === 0 && !!s.label, norm: norm(l.lyric) });
      for (const c of l.chords) {
        if (!chordSet.has(c.ch)) chordSet.set(c.ch, { ...Theory.parseChord(c.ch), count: 0 });
        chordSet.get(c.ch).count++;
      }
    });
  }
  return { lines, chords: [...chordSet.values()] };
}

function trimIndent(l) {
  const lead = Math.min(l.lyric.length - l.lyric.trimStart().length, ...l.chords.map((c) => c.col));
  if (lead > 0) return { lyric: l.lyric.slice(lead), chords: l.chords.map((c) => ({ col: c.col - lead, ch: c.ch })) };
  return l;
}

// ---------- LRC ----------
function parseLrc(text) {
  const out = [];
  for (const line of (text || '').split(/\r?\n/)) {
    const stamps = [];
    let rest = line, m;
    while ((m = /^\s*\[(\d+):(\d+(?:[.:]\d+)?)\]/.exec(rest))) {
      stamps.push(+m[1] * 60 + parseFloat(m[2].replace(':', '.')));
      rest = rest.slice(m[0].length);
    }
    for (const t of stamps) out.push({ t, text: rest.trim() });
  }
  return out.sort((a, b) => a.t - b.t);
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = a.split(' '), B = b.split(' ');
  const count = new Map();
  for (const w of B) count.set(w, (count.get(w) || 0) + 1);
  let common = 0;
  for (const w of A) { const n = count.get(w); if (n) { common++; count.set(w, n - 1); } }
  return (2 * common) / (A.length + B.length);
}

// Spread chords across a row from time t over `dur` seconds.
function timeChords(row, t, dur) {
  const len = Math.max(row.lyric.length, 1);
  const lyricRow = row.lyric.trim().length > 0;
  const n = row.chords.length;
  row.chords = row.chords.map((c, k) => ({
    ...c,
    t: t + (lyricRow ? (Math.min(c.col, len) / len) * dur * 0.85 : (k / Math.max(n, 1)) * dur),
  }));
}

// Build the rows to show, with times when we have them.
function buildRows(song) {
  const sheet = parseSheet(song.sheet);
  const S = sheet.lines;
  const rows = [];

  const useLrc = !!song.lrc && !song.useTap;
  if (useLrc) {
    const lrc = parseLrc(song.lrc);
    const sung = lrc.map((l, i) => ({ ...l, i })).filter((l) => l.text);
    const lyricIdx = S.map((l, i) => (l.norm ? i : -1)).filter((i) => i >= 0);
    let last = -1;
    const pending = (from, to) => {
      const out = [];
      for (let i = from; i < to; i++) if (!S[i].norm && S[i].chords.length) out.push(i);
      return out;
    };
    const placeInstrumental = (idxs, from, to, before) => {
      if (!idxs.length || to - from < 1.5) return;
      const slot = (to - from) / idxs.length;
      idxs.forEach((si, k) => {
        const row = { lyric: '', chords: S[si].chords.slice(), section: S[si].sectionStart ? S[si].section : null, t: from + k * slot, before };
        timeChords(row, row.t, slot);
        rows.push(row);
      });
    };
    let prevEnd = 0;
    sung.forEach((L, k) => {
      const nextT = L.i + 1 < lrc.length ? lrc[L.i + 1].t : L.t + 6;
      const words = L.text.split(/\s+/).length;
      const dur = Math.max(0.8, Math.min(nextT - L.t, Math.max(3, words * 0.7)));
      const n = norm(L.text);
      let best = -1, bs = 0;
      for (const i of lyricIdx) {
        let s = similarity(n, S[i].norm);
        if (i > last && i <= last + 3) s += 0.12;
        if (s > bs) { bs = s; best = i; }
      }
      if (bs < 0.5) best = -1;
      if (best >= 0) {
        if (best > last) placeInstrumental(pending(last + 1, best), k === 0 ? 0 : prevEnd, L.t, k);
        const src = S[best];
        const row = { lyric: src.lyric, chords: src.chords.slice(), section: src.sectionStart ? src.section : null, t: L.t, sung: k };
        // Show the section label only the first time we enter it.
        if (row.section && last >= 0 && best === last + 1 && S[last].section === src.section) row.section = null;
        timeChords(row, L.t, dur);
        rows.push(row);
        last = best;
      } else {
        rows.push({ lyric: L.text, chords: [], section: null, t: L.t, sung: k });
      }
      prevEnd = L.t + dur;
    });
    if (last >= 0) placeInstrumental(pending(last + 1, S.length), prevEnd + 0.5, prevEnd + 0.5 + 4 * pending(last + 1, S.length).length, sung.length);
    rows.sort((a, b) => a.t - b.t);
    // Chords on lyric rows without a match: carry nothing; the previous chord keeps ringing.
  } else {
    const times = song.lineTimes || [];
    S.forEach((l, i) => rows.push({ lyric: l.lyric, chords: l.chords.slice(), section: l.sectionStart ? l.section : null, t: times[i] ?? null }));
    rows.forEach((r, i) => {
      if (r.t == null) return;
      const next = rows.slice(i + 1).find((x) => x.t != null);
      const dur = next ? Math.min(next.t - r.t, 12) : 4;
      timeChords(r, r.t, dur);
    });
  }

  const events = [];
  rows.forEach((r, ri) => r.chords.forEach((c, ci) => { if (c.t != null) events.push({ t: c.t, ch: c.ch, ri, ci }); }));
  events.sort((a, b) => a.t - b.t);
  return { rows, events, chords: sheet.chords, timed: useLrc || (song.lineTimes || []).some((x) => x != null), sheetLines: S };
}

// ---------- library chord maps ----------
// Library songs keep chords only, no lyrics: for each sung line of the timed
// lyrics, which chords are played and at which letter. The lyrics come from
// LRCLIB when the song opens, and this rebuilds a normal chord chart from both.
// map = { lines: { "<sung line #>": [[letter, "G"], ...] },
//         sections: { "<sung line #>": "Chorus" },
//         before: { "<sung line #>": ["G", "D"] }  // chord-only bars before that line (intro, instrumentals; use the line count for an outro)
// }
function sheetFromMap(lrcText, map) {
  const sung = parseLrc(lrcText).filter((l) => l.text);
  const out = [];
  const bars = (chords) => chords.map((c) => `[${c}] `).join(' ');
  const lines = map.lines || {}, sections = map.sections || {}, before = map.before || {};
  for (let i = 0; i <= sung.length; i++) {
    if (before[i]) {
      out.push(`[${i === 0 ? 'Intro' : i === sung.length ? 'Outro' : 'Instrumental'}]`);
      out.push(bars(before[i]));
    }
    if (i === sung.length) break;
    if (sections[i]) out.push(`[${sections[i]}]`);
    const text = sung[i].text;
    const cs = (lines[i] || []).slice().sort((a, b) => a[0] - b[0]);
    let s = '', last = 0;
    for (const [pos, ch] of cs) {
      const p = Math.max(last, Math.min(pos, text.length));
      s += text.slice(last, p) + `[${ch}]`;
      last = p;
    }
    out.push(s + text.slice(last));
  }
  return out.join('\n');
}

// The reverse, used when adding songs to the library: chord chart + timed lyrics -> map.
function mapFromSheet(song) {
  const B = buildRows(song);
  const map = { lines: {}, sections: {}, before: {} };
  for (const r of B.rows) {
    if (r.sung != null) {
      if (r.chords.length) map.lines[r.sung] = r.chords.map((c) => [c.col, c.ch]);
      if (r.section) map.sections[r.sung] = r.section;
    } else if (r.before != null) {
      (map.before[r.before] = map.before[r.before] || []).push(...r.chords.map((c) => c.ch));
    }
  }
  return map;
}

window.Sheet = { parseSheet, parseLrc, buildRows, isChordLine, norm, sheetFromMap, mapFromSheet, similarity };
