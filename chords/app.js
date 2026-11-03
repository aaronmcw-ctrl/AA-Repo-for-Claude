// Chord Along: YouTube video on top, chords that follow the song, lyrics below.
(() => {
  const T = window.Theory, S = window.Sheet;
  const $ = (sel, el = document) => el.querySelector(sel);
  const app = $('#app');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { alert('Could not save on this phone (storage is full or blocked).'); return false; } },
  };
  let songs = store.get('ca.songs', []);
  const prefs = Object.assign({ inst: 'guitar', simple: true }, store.get('ca.prefs', {}));
  const saveSongs = () => store.set('ca.songs', songs);
  const savePrefs = () => store.set('ca.prefs', prefs);
  const findSong = (id) => songs.find((s) => s.id === id);
  const newId = () => Math.random().toString(36).slice(2, 10);
  const hidden = store.get('ca.hidden', []);

  // Built-in songs (library.json). Each phone keeps its own copy with its own capo, key and sync.
  async function loadLibrary() {
    try {
      const r = await fetch('library.json', { cache: 'no-cache' });
      const lib = await r.json();
      for (const L of lib.songs || []) {
        if (hidden.includes(L.id)) continue;
        const s = findSong(L.id);
        if (!s) songs.push({ ...L, lib: true, libVersion: L.version || 0, sheet: '', offset: 0, transpose: 0, capo: null });
        else if ((L.version || 0) > (s.libVersion || 0)) {
          const mine = s.sheet && s.sheet.trim();
          const newLrc = L.chordMap && (!s.chordMap || s.chordMap.lrclibId !== L.chordMap.lrclibId);
          Object.assign(s, { title: L.title, artist: L.artist, videoId: L.videoId, libVersion: L.version || 0 });
          if (!mine) { s.chordMap = L.chordMap || null; if (newLrc) { s.lrc = ''; s.offset = 0; } }
        }
      }
      saveSongs();
    } catch {}
  }

  // ---------- helpers ----------
  function ytId(s) {
    s = (s || '').trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    const m = s.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
    return m ? m[1] : null;
  }
  const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const thumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

  async function lrclibSearch(title, artist) {
    const tryUrl = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error('LRCLIB ' + r.status); return r.json(); };
    let res = await tryUrl(`https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`);
    if (!res.length) res = await tryUrl(`https://lrclib.net/api/search?q=${encodeURIComponent(title + ' ' + artist)}`);
    return res.filter((r) => r.syncedLyrics).slice(0, 8);
  }
  async function lrclibGet(id) {
    const r = await fetch(`https://lrclib.net/api/get/${id}`);
    if (!r.ok) throw new Error('LRCLIB ' + r.status);
    return r.json();
  }

  // ---------- song name from a YouTube link ----------
  function parseYtTitle(title, author) {
    const words = 'official|lyrics?|audio|video|visuali[sz]er|music|performance|live|acoustic|hd|4k|remaster(ed)?';
    let t = (title || '')
      .replace(new RegExp(`\\s*[\\(\\[][^\\)\\]]*\\b(${words}|ft\\.?|feat\\.?|with lyrics)\\b[^\\)\\]]*[\\)\\]]`, 'gi'), '')
      .replace(/\s+(ft|feat)\.?\s.*$/i, '')
      .trim();
    let artist = (author || '').replace(/VEVO$/i, '').replace(/\s*-\s*Topic$/i, '').replace(/\s*(official|music)$/i, '').trim();
    const m = t.match(/^(.+?)\s+[-–—|]\s+(.+)$/) || t.match(/^(.+?)\s*[-–—|]\s*(.+)$/);
    if (m) {
      const [a, b] = [m[1].trim(), m[2].trim()];
      const aIsArtist = S.similarity(S.norm(a), S.norm(artist)) >= S.similarity(S.norm(b), S.norm(artist));
      if (aIsArtist) { t = b; artist = a.split(/\s*,\s*/)[0]; } else { t = a; artist = b; }
    }
    return { title: t.trim(), artist: artist.trim() };
  }
  async function ytInfo(id) {
    const url = encodeURIComponent(`https://www.youtube.com/watch?v=${id}`);
    for (const u of [`https://www.youtube.com/oembed?format=json&url=${url}`, `https://noembed.com/embed?url=${url}`]) {
      try {
        const r = await fetch(u);
        if (!r.ok) continue;
        const j = await r.json();
        if (j.title) return parseYtTitle(j.title, j.author_name);
      } catch {}
    }
    return null;
  }

  // ---------- timed lyrics, picked automatically ----------
  const baseTitle = (s) => S.norm((s || '').replace(/\s*[\(\[].*?[\)\]]/g, ''));
  function rankLyrics(results, song, videoDur) {
    const want = baseTitle(song.title), who = S.norm(song.artist || '');
    return results
      .map((r) => {
        let score = S.similarity(want, baseTitle(r.trackName)) * 2;
        if (who) score += S.similarity(who, S.norm(r.artistName)) ;
        if (/\blive\b|acoustic|instrumental|remix|karaoke/i.test(`${r.trackName} ${r.albumName}`) && !/\blive\b|acoustic/i.test(song.title)) score -= 0.6;
        if (videoDur) score -= Math.min(Math.abs(r.duration - videoDur), 30) / 15;
        return { r, score };
      })
      .filter((x) => S.similarity(want, baseTitle(x.r.trackName)) >= 0.5)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.r);
  }
  async function useLyrics(song, r) {
    if (!r.syncedLyrics) r = await lrclibGet(r.id);
    song.lrc = r.syncedLyrics || '';
    song.lrclibId = r.id;
    song.lrcDuration = r.duration;
  }
  // Fills song.lrc. For library songs, the chords were made for one exact lyrics entry.
  async function findLyrics(song, videoDur) {
    if (song.chordMap && song.chordMap.lrclibId) return useLyrics(song, { id: song.chordMap.lrclibId });
    const res = await lrclibSearch(song.title, song.artist || '');
    const ranked = rankLyrics(res, song, videoDur);
    song.lrcCandidates = ranked.map(({ id, trackName, artistName, albumName, duration }) => ({ id, trackName, artistName, albumName, duration }));
    song.lrcTried = true;
    if (ranked.length) await useLyrics(song, ranked[0]);
  }

  // The chart the song page shows: a pasted chart, or library chords laid onto the lyrics.
  const withSheet = (song) => (song.chordMap && song.lrc ? { ...song, sheet: S.sheetFromMap(song.lrc, song.chordMap) } : song);

  // Share links: the song (minus lyrics, which are re-fetched) squeezed into the URL.
  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  async function pack(obj) {
    const data = new TextEncoder().encode(JSON.stringify(obj));
    if (window.CompressionStream) {
      const buf = await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
      return 'z' + b64url(new Uint8Array(buf));
    }
    return 'j' + b64url(data);
  }
  async function unpack(s) {
    const bytes = unb64url(s.slice(1));
    if (s[0] === 'z') {
      const txt = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      return JSON.parse(txt);
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async function shareSong(song) {
    const { title, artist, videoId, sheet, chordMap, lrclibId, offset, capo, transpose, lineTimes, useTap } = song;
    const payload = { title, artist, videoId, sheet, chordMap, lrclibId, offset, capo, transpose, lineTimes, useTap };
    if (!lrclibId && song.lrc) payload.lrc = song.lrc;
    const url = location.href.split('#')[0] + '#import=' + (await pack(payload));
    if (navigator.share) {
      try { await navigator.share({ title: `${title} – chords`, url }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { prompt('Copy this link:', url); }
    }
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  // ---------- router ----------
  let cleanup = null;
  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    const h = location.hash;
    window.scrollTo(0, 0);
    if (h.startsWith('#import=')) return importView(h.slice(8));
    let m;
    if ((m = h.match(/^#\/song\/([\w-]+)/)) && findSong(m[1])) return songView(findSong(m[1]));
    if (h === '#/add') return editView(null);
    if ((m = h.match(/^#\/edit\/([\w-]+)/)) && findSong(m[1])) return editView(findSong(m[1]));
    return homeView();
  }
  window.addEventListener('hashchange', route);

  // ---------- home ----------
  function homeView() {
    document.title = 'Chord Along';
    const list = songs.slice().sort((a, b) => (b.opened || 0) - (a.opened || 0) || (a.lib ? 0 : -1) - (b.lib ? 0 : -1));
    const hasChords = (s) => !!(s.chordMap || (s.sheet && s.sheet.trim()));
    app.innerHTML = `
      <header class="top">
        <h1>Chord Along</h1>
        <a class="btn primary" href="#/add">+ Add song</a>
      </header>
      <ul class="songs">${list.map((s) => `
        <li><a class="song" href="#/song/${s.id}">
          <img src="${thumb(s.videoId)}" alt="" loading="lazy">
          <span><b>${esc(s.title)}</b><small>${esc(s.artist || '')}${hasChords(s) ? '' : ' · <i>no chords yet</i>'}</small></span>
        </a></li>`).join('')}</ul>
      <footer class="foot">Tap a song and press play. To add one, paste a YouTube link: the name, artist and timed lyrics fill in by themselves. Timed lyrics from <a href="https://lrclib.net" target="_blank" rel="noopener">LRCLIB</a>.</footer>`;
  }

  // ---------- add / edit ----------
  function editView(song) {
    const isNew = !song;
    const draft = song ? { ...song } : { id: newId(), title: '', artist: '', videoId: '', sheet: '', lrc: '', lrclibId: null, offset: 0, capo: null, transpose: 0 };
    document.title = isNew ? 'Add song' : 'Edit ' + draft.title;
    let typedName = !isNew; // don't overwrite names the person typed
    app.innerHTML = `
      <header class="top">
        <a class="btn ghost" href="${isNew ? '#' : '#/song/' + draft.id}">‹ Back</a>
        <h1 class="small">${isNew ? 'Add a song' : 'Edit song'}</h1>
        <span></span>
      </header>
      <form class="form" id="f" autocomplete="off">
        <label>YouTube link<input name="yt" inputmode="url" placeholder="Paste a YouTube link" value="${draft.videoId ? 'https://youtu.be/' + draft.videoId : ''}"></label>
        <div class="found" id="found"${draft.videoId ? '' : ' hidden'}>
          <img id="foundImg" alt="" src="${draft.videoId ? thumb(draft.videoId) : ''}">
          <div class="two">
            <label>Song<input name="title" value="${esc(draft.title)}"></label>
            <label>Artist<input name="artist" value="${esc(draft.artist)}"></label>
          </div>
        </div>
        <p class="status" id="lyrState"></p>
        <div id="lyrPick" hidden></div>
        <p class="status" id="libState" hidden></p>
        <div class="chordbox" id="chordBox">
          <div class="chordbox__head"><b>Chords</b>${draft.chordMap ? ' <span class="ok">✓ from the library</span>' : ''}</div>
          ${draft.chordMap ? '<p class="hint">This song’s chords come from the built-in library. Paste a chart below only to replace them.</p>' : `
          <p class="hint">Tap <b>Find chords</b>, copy the chords and words from that page, and paste them here. Or save now and add chords later.</p>`}
          <a class="btn" id="findChords" target="_blank" rel="noopener">Find chords ↗</a>
          <textarea name="sheet" rows="10" spellcheck="false" placeholder="Paste the chord chart here">${esc(draft.sheet || '')}</textarea>
          <p class="hint" id="sheetInfo"></p>
        </div>
        <div class="actions">
          <button class="btn primary" type="submit">Save</button>
          ${isNew ? '' : '<button type="button" class="btn danger" id="del">Delete song</button>'}
        </div>
      </form>`;
    const f = $('#f');
    const setLyrState = (html) => { $('#lyrState').innerHTML = html; };

    const updateChordInfo = () => {
      draft.sheet = f.sheet.value;
      const q = encodeURIComponent(`${f.title.value} ${f.artist.value}`.trim());
      $('#findChords').href = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${q}`;
      $('#findChords').hidden = !f.title.value.trim();
      if (!draft.sheet.trim()) { $('#sheetInfo').textContent = ''; return; }
      const p = S.parseSheet(draft.sheet);
      let msg = `Chords found: ${p.chords.map((c) => c.text).join('  ') || 'none — is this a chord chart?'}`;
      if (draft.lrc) {
        const b = S.buildRows(draft);
        const sung = b.rows.filter((r) => r.lyric.trim());
        const hit = sung.filter((r) => r.chords.length).length;
        msg += ` · lined up with ${hit} of ${sung.length} sung lines`;
      }
      $('#sheetInfo').textContent = msg;
    };
    f.sheet.addEventListener('input', updateChordInfo);

    const showLyrics = () => {
      if (draft.lrc) {
        const n = S.parseLrc(draft.lrc).filter((l) => l.text).length;
        const others = (draft.lrcCandidates || []).length > 1;
        setLyrState(`<span class="ok">✓ Timed lyrics found</span> <span class="muted">(${n} lines${draft.lrcDuration ? ', ' + fmtTime(draft.lrcDuration) : ''})</span>${others ? ' <button type="button" class="link" id="chg">wrong version?</button>' : ''}`);
        const chg = $('#chg');
        if (chg) chg.onclick = () => {
          const box = $('#lyrPick');
          box.hidden = false;
          box.innerHTML = draft.lrcCandidates.map((r, i) => `<button type="button" class="pick${r.id === draft.lrclibId ? ' on' : ''}" data-i="${i}"><b>${esc(r.trackName)}</b> — ${esc(r.artistName)}<small>${esc(r.albumName || '')} · ${fmtTime(r.duration)}</small></button>`).join('');
          box.onclick = async (e) => {
            const b = e.target.closest('.pick');
            if (!b) return;
            const r = draft.lrcCandidates[+b.dataset.i];
            box.querySelectorAll('.pick').forEach((x) => x.classList.toggle('on', x === b));
            await useLyrics(draft, r);
            draft.lrcPinned = true;
            showLyrics();
            updateChordInfo();
          };
        };
      } else if (draft.lrcTried) {
        setLyrState('<span class="muted">No timed lyrics found for this song. You can still save it and use <b>Tap along</b> on the song page.</span>');
      }
    };

    let lookupId = 0;
    const lookupLyrics = async () => {
      const id = ++lookupId;
      if (!f.title.value.trim()) return;
      draft.title = f.title.value.trim();
      draft.artist = f.artist.value.trim();
      setLyrState('<span class="muted">Looking for timed lyrics…</span>');
      draft.lrc = ''; draft.lrcTried = false; draft.lrcPinned = false;
      try { await findLyrics(draft); } catch (e) { if (id === lookupId) setLyrState(`<span class="muted">Couldn't reach the lyrics service right now. Save anyway; it will try again when you open the song.</span>`); return; }
      if (id !== lookupId) return;
      showLyrics();
      updateChordInfo();
    };

    const checkLibrary = () => {
      const t = S.norm(f.title.value);
      const hit = songs.find((s) => s.id !== draft.id && (s.videoId === draft.videoId || (t && S.norm(s.title) === t)));
      const el = $('#libState');
      el.hidden = !hit;
      if (hit) el.innerHTML = `“${esc(hit.title)}” is already in your songs. <a href="#/song/${hit.id}">Open it</a>`;
    };

    let lastVid = draft.videoId;
    const onLink = async () => {
      const vid = ytId(f.yt.value);
      if (!vid || vid === lastVid) return;
      lastVid = vid;
      draft.videoId = vid;
      $('#found').hidden = false;
      $('#foundImg').src = thumb(vid);
      if (!typedName || !f.title.value.trim()) {
        setLyrState('<span class="muted">Getting the song name…</span>');
        const info = await ytInfo(vid);
        if (info && lastVid === vid) { f.title.value = info.title; f.artist.value = info.artist; }
        if (!f.title.value.trim()) { setLyrState('<span class="muted">Type the song name and artist.</span>'); f.title.focus(); return; }
      }
      checkLibrary();
      updateChordInfo();
      lookupLyrics();
    };
    f.yt.addEventListener('input', onLink);
    f.yt.addEventListener('paste', () => setTimeout(onLink, 0));
    const onName = () => { typedName = true; checkLibrary(); updateChordInfo(); lookupLyrics(); };
    f.title.addEventListener('change', onName);
    f.artist.addEventListener('change', onName);

    updateChordInfo();
    showLyrics();
    if (isNew) setTimeout(() => f.yt.focus(), 50);

    f.onsubmit = (e) => {
      e.preventDefault();
      const vid = ytId(f.yt.value);
      if (!vid) { alert('Paste a YouTube link.'); return; }
      if (!f.title.value.trim()) { alert('Add the song name.'); return; }
      const sheetChanged = song && (song.sheet || '') !== f.sheet.value;
      draft.videoId = vid;
      draft.title = f.title.value.trim();
      draft.artist = f.artist.value.trim();
      draft.sheet = f.sheet.value;
      if (draft.sheet.trim() && draft.chordMap && (isNew || sheetChanged)) draft.chordMap = null; // a pasted chart replaces library chords
      if (sheetChanged) { draft.lineTimes = null; draft.useTap = false; }
      if (song && song.videoId !== draft.videoId) { draft.offset = 0; draft.lrcPinned = false; }
      const i = songs.findIndex((s) => s.id === draft.id);
      if (i >= 0) songs[i] = draft; else songs.push(draft);
      saveSongs();
      location.hash = '#/song/' + draft.id;
    };
    const del = $('#del');
    if (del) del.onclick = () => {
      if (!confirm(`Delete “${draft.title}” from this phone?`)) return;
      songs = songs.filter((s) => s.id !== draft.id);
      if (draft.lib) { hidden.push(draft.id); store.set('ca.hidden', hidden); }
      saveSongs();
      location.hash = '#';
    };
  }

  // ---------- import ----------
  async function importView(data) {
    app.innerHTML = '<p class="hint pad">Opening shared song…</p>';
    try {
      const s = await unpack(data);
      if (s.lrclibId && !s.lrc) {
        try { s.lrc = (await lrclibGet(s.lrclibId)).syncedLyrics || ''; } catch { s.lrc = ''; }
      }
      const existing = songs.find((x) => x.videoId === s.videoId && x.title === s.title);
      const song = { offset: 0, transpose: 0, capo: null, ...s, id: existing ? existing.id : newId() };
      if (existing) Object.assign(existing, song); else songs.push(song);
      saveSongs();
      location.replace(location.href.split('#')[0] + '#/song/' + song.id);
    } catch (e) {
      app.innerHTML = `<p class="hint pad">That link didn't work (${esc(e.message)}). <a href="#">Go to songs</a></p>`;
    }
  }

  // ---------- YouTube ----------
  let ytReady = null;
  function loadYT() {
    if (ytReady) return ytReady;
    ytReady = new Promise((resolve) => {
      if (window.YT && window.YT.Player) return resolve();
      window.onYouTubeIframeAPIReady = resolve;
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
    return ytReady;
  }

  // ---------- song page ----------
  function songView(song) {
    song.opened = Date.now();
    saveSongs();
    document.title = song.title;
    let B = S.buildRows(withSheet(song));
    if (song.capo == null) song.capo = 0;
    let lyricsMsg = '';

    app.innerHTML = `
      <header class="top slim">
          <a class="btn ghost" href="#">‹</a>
          <div class="ttl"><b>${esc(song.title)}</b><small>${esc(song.artist || '')}</small></div>
          <button class="btn ghost" id="menuBtn" aria-label="More">•••</button>
      </header>
      <div class="stage" id="stage">
        <div class="video"><div id="yt"></div></div>
        <div class="strip" id="strip"></div>
      </div>
      <div class="tools" id="tools"></div>
      <div class="panel" id="panel" hidden></div>
      <div class="lyrics" id="lyrics"></div>
      <div class="menu" id="menu" hidden>
        <a href="#/edit/${song.id}">Edit song / chords</a>
        <button id="shareBtn">Share song link</button>
        <button id="tapBtn">Tap along (set timing yourself)</button>
        <button id="closeMenu">Close</button>
      </div>`;

    let player = null, timer = null, curEvent = -2, userScrollUntil = 0, tap = null;
    const tr = () => song.transpose || 0;
    const capo = () => (prefs.inst === 'piano' ? 0 : song.capo || 0);
    const off = () => song.offset || 0;
    const persist = () => { const i = songs.findIndex((s) => s.id === song.id); songs[i] = song; saveSongs(); };

    // Name shown in lyrics: guitar players read capo shapes; piano players read real chords.
    const lyricName = (ch) => {
      const c = T.parseChord(ch);
      return T.chordName(c, tr() - (prefs.inst === 'guitar' ? capo() : 0), prefs.simple);
    };

    function card(ch, cls = '') {
      if (!ch) return `<div class="card ${cls} blank"><span class="nm">–</span></div>`;
      const c = T.parseChord(ch);
      const g = prefs.inst !== 'piano', p = prefs.inst !== 'guitar';
      const gShift = tr() - capo();
      let html = '';
      const mainName = g && !p ? T.chordName(c, gShift, prefs.simple) : T.chordName(c, tr(), prefs.simple);
      html += `<span class="nm">${esc(mainName)}</span>`;
      if (g && p) html += '<div class="pair"><div>';
      if (g) {
        const shapeName = T.chordName(c, gShift, true);
        html += T.guitarSVG(T.guitarShape(c.root + gShift, c.simple));
        if (p && capo()) html += `<small class="sub">${esc(shapeName)} shape</small>`;
      }
      if (g && p) html += '</div><div>';
      if (p) {
        const iv = prefs.simple ? T.INTERVALS[c.simple] : T.fullIntervals(c);
        html += T.pianoSVG(c.root + tr(), iv, null);
        const bass = !prefs.simple && c.bass != null ? c.bass : c.root;
        html += `<small class="sub">Left hand: ${esc(T.NICE[(bass + tr() + 120) % 12])}</small>`;
      }
      if (g && p) html += '</div></div>';
      return `<div class="card ${cls}">${html}</div>`;
    }

    function renderStrip() {
      const strip = $('#strip');
      strip.className = 'strip inst-' + prefs.inst;
      if (!B.chords.length) {
        strip.innerHTML = `<div class="nochords"><span>No chords for this song yet.</span><a class="btn" href="#/edit/${song.id}">Add chords</a></div>`;
        return;
      }
      if (!B.timed || !B.events.length) {
        strip.innerHTML = `<div class="scroll">${B.chords.map((c) => card(c.text)).join('')}</div>`;
        return;
      }
      const e = curEvent;
      const cur = e >= 0 ? B.events[e].ch : null;
      const nexts = [];
      const max = prefs.inst === 'both' ? 1 : 2;
      for (let k = Math.max(e + 1, 0); k < B.events.length && nexts.length < max; k++) {
        const ch = B.events[k].ch;
        if (ch !== (nexts[nexts.length - 1] || cur)) nexts.push(ch);
      }
      const nextCard = (ch) => prefs.inst === 'both'
        ? `<div class="card next mini"><small class="sub">next</small><span class="nm">${esc(T.chordName(T.parseChord(ch), tr(), prefs.simple))}</span></div>`
        : card(ch, 'next');
      strip.innerHTML = card(cur, 'now') + nexts.map(nextCard).join('');
    }

    function renderTools() {
      const sug = T.suggestCapo(B.chords.map((c) => ({ root: c.root + tr(), simple: c.simple, count: c.count })));
      $('#tools').innerHTML = `
        <div class="seg">
          ${['guitar', 'piano', 'both'].map((i) => `<button data-inst="${i}" class="${prefs.inst === i ? 'on' : ''}">${{ guitar: 'Guitar', piano: 'Piano', both: 'Both' }[i]}</button>`).join('')}
        </div>
        <div class="stepper"><span>Key</span><button data-tr="-1">−</button><b>${tr() > 0 ? '+' : ''}${tr()}</b><button data-tr="1">+</button></div>
        ${prefs.inst !== 'piano' ? `<div class="stepper"><span>Capo</span><button data-capo="-1">−</button><b>${song.capo || 0}</b><button data-capo="1">+</button>${sug !== (song.capo || 0) ? `<button class="sugg" data-setcapo="${sug}">try ${sug}</button>` : ''}</div>` : ''}
        <button class="chip ${prefs.simple ? 'on' : ''}" data-simple>Simple chords</button>
        ${B.timed ? '<button class="chip" data-sync>Sync</button>' : '<button class="chip" data-tap>Tap along</button>'}`;
    }

    function renderLyrics() {
      const out = B.rows.map((r, ri) => {
        let body;
        if (!r.lyric.trim()) {
          body = r.chords.length ? `<div class="inst">${r.chords.map((c, ci) => `<b class="ch" data-ci="${ci}">${esc(lyricName(c.ch))}</b>`).join('')}</div>` : '';
        } else if (!r.chords.length) {
          body = `<div class="ly">${esc(r.lyric)}</div>`;
        } else {
          const maxCol = Math.max(...r.chords.map((c) => c.col));
          const L = r.lyric.padEnd(maxCol + 1);
          // Show each chord at the start of the word it falls in, so words never split.
          let prev = -1;
          const cols = r.chords.map((c) => {
            let col = c.col;
            while (col > 0 && /\S/.test(L[col - 1]) && /\S/.test(L[col])) col--;
            if (col <= prev) col = c.col;
            prev = col;
            return col;
          });
          let h = esc(L.slice(0, cols[0]));
          r.chords.forEach((c, ci) => {
            const end = ci + 1 < r.chords.length ? cols[ci + 1] : L.length;
            const text = L.slice(cols[ci], end);
            const m = /^(\S*)([\s\S]*)$/.exec(text);
            h += `<span class="sg"><b class="ch" data-ci="${ci}">${esc(lyricName(c.ch))}</b><span>${m[1] ? esc(m[1]) : '&nbsp;'}</span></span>${esc(m[2])}`;
          });
          body = `<div class="ly">${h}</div>`;
        }
        return `${r.section ? `<div class="sec">${esc(r.section)}</div>` : ''}<div class="row${r.t != null ? ' timed' : ''}" data-ri="${ri}">${body}</div>`;
      }).join('');
      $('#lyrics').innerHTML = out || `<p class="hint">${lyricsMsg || 'No lyrics or chords yet. Tap ••• → Edit to add a chord chart.'}</p>`;
      curEvent = -2;
    }

    function rerender() { B = S.buildRows(withSheet(song)); renderTools(); renderLyrics(); renderStrip(); tick(true); }

    // --- time tracking ---
    const now = () => (player && player.getCurrentTime ? player.getCurrentTime() : 0);
    function eventAt(t) {
      let lo = 0, hi = B.events.length - 1, ans = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (B.events[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
      return ans;
    }
    function rowAt(t) {
      let ans = -1;
      B.rows.forEach((r, i) => { if (r.t != null && r.t <= t) ans = i; });
      return ans;
    }
    let curRow = -2;
    function tick(force) {
      if (!B.timed) return;
      const t = now() - off();
      const e = eventAt(t);
      if (e !== curEvent || force) {
        const old = $('#lyrics .ch.now');
        if (old) old.classList.remove('now');
        curEvent = e;
        renderStrip();
        if (e >= 0) {
          const ev = B.events[e];
          const el = $(`#lyrics .row[data-ri="${ev.ri}"] .ch[data-ci="${ev.ci}"]`);
          if (el) el.classList.add('now');
        }
      }
      const r = rowAt(t);
      if (r !== curRow || force) {
        const old = $('#lyrics .row.cur');
        if (old) old.classList.remove('cur');
        curRow = r;
        const el = r >= 0 && $(`#lyrics .row[data-ri="${r}"]`);
        if (el) {
          el.classList.add('cur');
          if (Date.now() > userScrollUntil && player && player.getPlayerState && player.getPlayerState() === 1) {
            const stageH = $('#stage').offsetHeight;
            const y = el.getBoundingClientRect().top + window.scrollY - stageH - 70;
            window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
          }
        }
      }
    }
    const markUser = () => { userScrollUntil = Date.now() + 4000; };
    window.addEventListener('touchmove', markUser, { passive: true });
    window.addEventListener('wheel', markUser, { passive: true });

    loadYT().then(() => {
      if (!document.getElementById('yt')) return;
      player = new YT.Player('yt', {
        videoId: song.videoId,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: { onReady: () => { tick(true); checkDuration(); }, onStateChange: () => { tick(true); checkDuration(); } },
      });
    });
    timer = setInterval(() => tick(false), 100);

    // If another version of the timed lyrics matches this video's length better, switch to it.
    let durChecked = false;
    function checkDuration() {
      if (durChecked || !player || !player.getDuration) return;
      const d = player.getDuration();
      if (!d) return;
      durChecked = true;
      song.videoDuration = d;
      if (song.chordMap || song.lrcPinned || !song.lrcDuration || !(song.lrcCandidates || []).length) return;
      if (Math.abs(song.lrcDuration - d) <= 4) return;
      const best = rankLyrics(song.lrcCandidates, song, d)[0];
      if (best && best.id !== song.lrclibId && Math.abs(best.duration - d) + 2 < Math.abs(song.lrcDuration - d)) {
        useLyrics(song, best).then(() => { persist(); rerender(); }).catch(() => {});
      }
    }

    // Fetch timed lyrics the first time a song opens (library songs, or if it failed before).
    if (!song.lrc && !song.useTap && (!song.lrcTried || song.chordMap)) {
      lyricsMsg = 'Loading lyrics…';
      findLyrics(song, song.videoDuration)
        .then(() => { lyricsMsg = song.lrc ? '' : 'No timed lyrics found for this song.'; persist(); rerender(); durChecked = false; checkDuration(); })
        .catch(() => { lyricsMsg = 'Couldn’t load lyrics right now. Check the connection and reopen the song.'; rerender(); });
    }

    // --- interactions ---
    $('#tools').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.inst) { prefs.inst = b.dataset.inst; savePrefs(); }
      else if (b.dataset.tr) { song.transpose = Math.max(-11, Math.min(11, tr() + +b.dataset.tr)); persist(); }
      else if (b.dataset.capo) { song.capo = Math.max(0, Math.min(9, (song.capo || 0) + +b.dataset.capo)); persist(); }
      else if (b.dataset.setcapo) { song.capo = +b.dataset.setcapo; persist(); }
      else if ('simple' in b.dataset) { prefs.simple = !prefs.simple; savePrefs(); }
      else if ('sync' in b.dataset) return openSync();
      else if ('tap' in b.dataset) return startTap();
      rerender();
    };
    $('#lyrics').onclick = (e) => {
      if (tap) return;
      const ch = e.target.closest('.ch');
      const row = e.target.closest('.row');
      if (!row || !player || !player.seekTo) return;
      const r = B.rows[+row.dataset.ri];
      let t = r.t;
      if (ch && r.chords[+ch.dataset.ci] && r.chords[+ch.dataset.ci].t != null) t = r.chords[+ch.dataset.ci].t;
      if (t == null) return;
      player.seekTo(Math.max(0, t + off() - 0.3), true);
      player.playVideo();
      userScrollUntil = 0;
    };

    // Sync: line the lyrics up with this particular video.
    function openSync() {
      const first = B.rows.find((r) => r.lyric.trim() && r.t != null);
      const panel = $('#panel');
      panel.hidden = false;
      const draw = () => {
        panel.innerHTML = `
          <p>Play the video and tap <b>Now</b> the moment this line starts:<br><i>“${esc(first ? first.lyric : '')}”</i></p>
          <div class="row-btns">
            <button class="btn primary" data-now>Now</button>
            <button class="btn" data-n="-0.25">−¼s</button>
            <span class="off">${off() >= 0 ? '+' : ''}${off().toFixed(2)}s</span>
            <button class="btn" data-n="0.25">+¼s</button>
            <button class="btn ghost" data-done>Done</button>
          </div>
          <p class="hint">−¼s if chords come late, +¼s if they come early.</p>`;
      };
      draw();
      panel.onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('now' in b.dataset && first) song.offset = Math.round((now() - first.t) * 100) / 100;
        else if (b.dataset.n) song.offset = Math.round((off() + +b.dataset.n) * 100) / 100;
        else if ('done' in b.dataset) { panel.hidden = true; return; }
        persist();
        draw();
        tick(true);
      };
    }

    // Tap along: tap at the start of each line while the song plays.
    function startTap() {
      $('#menu').hidden = true;
      const lines = B.sheetLines;
      tap = { i: 0, times: lines.map(() => null) };
      const panel = $('#panel');
      panel.hidden = false;
      const draw = () => {
        const l = lines[tap.i];
        panel.innerHTML = l ? `
          <p>Play the song. Tap the big button as each line <b>starts</b>.</p>
          <div class="tapline">${l.section && l.sectionStart ? `<small>${esc(l.section)}</small>` : ''}${esc(l.lyric || l.chords.map((c) => c.ch).join(' '))}</div>
          <button class="btn primary big" data-tap>Tap (${tap.i + 1}/${lines.length})</button>
          <div class="row-btns"><button class="btn" data-undo>Undo</button><button class="btn" data-skip>Skip line</button><button class="btn ghost" data-cancel>Cancel</button><button class="btn ghost" data-save>Save</button></div>`
          : `<p>All lines tapped!</p><div class="row-btns"><button class="btn primary" data-save>Save timing</button><button class="btn ghost" data-cancel>Cancel</button></div>`;
      };
      draw();
      panel.onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if ('tap' in b.dataset) { tap.times[tap.i] = Math.round(now() * 100) / 100; tap.i++; }
        else if ('skip' in b.dataset) tap.i++;
        else if ('undo' in b.dataset && tap.i > 0) { tap.i--; tap.times[tap.i] = null; }
        else if ('cancel' in b.dataset) { tap = null; panel.hidden = true; return; }
        else if ('save' in b.dataset) {
          song.lineTimes = tap.times;
          song.useTap = true;
          song.offset = 0;
          persist();
          tap = null;
          panel.hidden = true;
          rerender();
          return;
        }
        draw();
      };
    }

    $('#menuBtn').onclick = () => { $('#menu').hidden = !$('#menu').hidden; };
    $('#closeMenu').onclick = () => { $('#menu').hidden = true; };
    $('#shareBtn').onclick = () => { $('#menu').hidden = true; shareSong(song); };
    $('#tapBtn').onclick = startTap;

    rerender();
    if (B.timed && !song.offset && !song.syncHinted) {
      song.syncHinted = true;
      persist();
      toast('Chords early or late? Tap Sync.');
    }

    cleanup = () => {
      clearInterval(timer);
      window.removeEventListener('touchmove', markUser);
      window.removeEventListener('wheel', markUser);
      if (player && player.destroy) try { player.destroy(); } catch {}
    };
  }

  loadLibrary().finally(route);
})();
