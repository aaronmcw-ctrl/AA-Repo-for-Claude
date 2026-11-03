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
    const { title, artist, videoId, sheet, lrclibId, offset, capo, transpose, lineTimes } = song;
    const payload = { title, artist, videoId, sheet, lrclibId, offset, capo, transpose, lineTimes };
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
    if ((m = h.match(/^#\/song\/(\w+)/)) && findSong(m[1])) return songView(findSong(m[1]));
    if (h === '#/add') return editView(null);
    if ((m = h.match(/^#\/edit\/(\w+)/)) && findSong(m[1])) return editView(findSong(m[1]));
    return homeView();
  }
  window.addEventListener('hashchange', route);

  // ---------- home ----------
  function homeView() {
    document.title = 'Chord Along';
    const list = songs.slice().sort((a, b) => (b.opened || 0) - (a.opened || 0));
    app.innerHTML = `
      <header class="top">
        <h1>Chord Along</h1>
        <a class="btn primary" href="#/add">+ Add song</a>
      </header>
      ${list.length ? `<ul class="songs">${list.map((s) => `
        <li><a class="song" href="#/song/${s.id}">
          <img src="${thumb(s.videoId)}" alt="" loading="lazy">
          <span><b>${esc(s.title)}</b><small>${esc(s.artist || '')}</small></span>
        </a></li>`).join('')}</ul>` : `
        <section class="empty">
          <h2>Add your first song</h2>
          <ol>
            <li>Find the song on YouTube and copy the link (Share → Copy link). Lyric videos and "official audio" line up best.</li>
            <li>Find a chord chart for it on a chord site and copy the chords and lyrics.</li>
            <li>Tap <b>+ Add song</b>, paste both, and press <b>Find timed lyrics</b>.</li>
          </ol>
          <p>Then press play: the chords follow the song, with finger positions for guitar and piano.</p>
        </section>`}
      <footer class="foot">Timed lyrics from <a href="https://lrclib.net" target="_blank" rel="noopener">LRCLIB</a>. Songs you add are saved on this phone; use Share to send one to someone else.</footer>`;
  }

  // ---------- add / edit ----------
  function editView(song) {
    const isNew = !song;
    const draft = song ? { ...song } : { id: newId(), title: '', artist: '', videoId: '', sheet: '', lrc: '', lrclibId: null, offset: 0, capo: null, transpose: 0 };
    document.title = isNew ? 'Add song' : 'Edit ' + draft.title;
    app.innerHTML = `
      <header class="top">
        <a class="btn ghost" href="${isNew ? '#' : '#/song/' + draft.id}">‹ Back</a>
        <h1 class="small">${isNew ? 'Add a song' : 'Edit song'}</h1>
        <span></span>
      </header>
      <form class="form" id="f" autocomplete="off">
        <label>YouTube link<input name="yt" inputmode="url" placeholder="https://youtu.be/…" value="${draft.videoId ? 'https://youtu.be/' + draft.videoId : ''}"></label>
        <div class="two">
          <label>Song<input name="title" value="${esc(draft.title)}" placeholder="Song title"></label>
          <label>Artist<input name="artist" value="${esc(draft.artist)}" placeholder="Artist"></label>
        </div>
        <label>Chord chart
          <textarea name="sheet" rows="12" spellcheck="false" placeholder="Paste chords and lyrics, e.g.&#10;&#10;[Verse 1]&#10;G              D&#10;Here are the words&#10;Em         C&#10;of the song">${esc(draft.sheet)}</textarea>
        </label>
        <p class="hint" id="sheetInfo"></p>
        <div class="lyr">
          <div class="lyr__head"><b>Timed lyrics</b> <span id="lyrState"></span></div>
          <button type="button" class="btn" id="find">Find timed lyrics</button>
          <div id="results"></div>
          <details><summary>Paste timed lyrics (LRC) yourself</summary>
            <textarea name="lrc" rows="5" spellcheck="false" placeholder="[00:12.30] First line…">${esc(draft.lrc || '')}</textarea>
          </details>
          <p class="hint">No timed lyrics for this song? Save anyway, then use <b>Tap along</b> on the song page to set the timing yourself.</p>
        </div>
        <p class="hint" id="matchInfo"></p>
        <div class="actions">
          <button class="btn primary" type="submit">Save</button>
          ${isNew ? '' : '<button type="button" class="btn danger" id="del">Delete song</button>'}
        </div>
      </form>`;
    const f = $('#f');
    const updateInfo = () => {
      draft.sheet = f.sheet.value;
      draft.lrc = f.lrc.value.trim();
      const p = S.parseSheet(draft.sheet);
      const names = p.chords.map((c) => c.text);
      $('#sheetInfo').textContent = draft.sheet.trim()
        ? `${p.lines.length} lines · chords: ${names.join('  ') || 'none found'}`
        : 'Tip: on Ultimate Guitar, WorshipTogether or a church chord sheet, select the chords + lyrics and copy.';
      $('#lyrState').textContent = draft.lrc ? `✓ ${S.parseLrc(draft.lrc).filter((l) => l.text).length} timed lines` : '— none yet';
      if (draft.lrc && draft.sheet.trim()) {
        const b = S.buildRows(draft);
        const sung = b.rows.filter((r) => r.lyric.trim());
        const hit = sung.filter((r) => r.chords.length).length;
        $('#matchInfo').textContent = `Chords lined up on ${hit} of ${sung.length} sung lines.` + (hit < sung.length * 0.5 ? ' (Low — check the chart is the same song, or that lines without chords are expected.)' : '');
      } else $('#matchInfo').textContent = '';
    };
    f.sheet.addEventListener('input', updateInfo);
    f.lrc.addEventListener('input', () => { draft.lrclibId = null; updateInfo(); });
    updateInfo();

    $('#find').onclick = async () => {
      const title = f.title.value.trim(), artist = f.artist.value.trim();
      const box = $('#results');
      if (!title) { box.innerHTML = '<p class="hint">Type the song title first.</p>'; return; }
      box.innerHTML = '<p class="hint">Searching…</p>';
      try {
        const res = await lrclibSearch(title, artist);
        if (!res.length) { box.innerHTML = '<p class="hint">No timed lyrics found. You can still save and use Tap along.</p>'; return; }
        box.innerHTML = '<p class="hint">Pick the version that matches your video (check the length):</p>' + res.map((r, i) => `
          <button type="button" class="pick${r.id === draft.lrclibId ? ' on' : ''}" data-i="${i}">
            <b>${esc(r.trackName)}</b> — ${esc(r.artistName)}<small>${esc(r.albumName || '')} · ${fmtTime(r.duration)}</small>
          </button>`).join('');
        box.querySelectorAll('.pick').forEach((b) => b.onclick = () => {
          const r = res[+b.dataset.i];
          draft.lrclibId = r.id;
          f.lrc.value = r.syncedLyrics;
          if (!f.title.value.trim()) f.title.value = r.trackName;
          if (!f.artist.value.trim()) f.artist.value = r.artistName;
          box.querySelectorAll('.pick').forEach((x) => x.classList.toggle('on', x === b));
          updateInfo();
        });
      } catch (e) {
        box.innerHTML = `<p class="hint">Couldn't reach the lyrics service (${esc(e.message)}). Try again, or paste LRC below.</p>`;
      }
    };

    f.onsubmit = (e) => {
      e.preventDefault();
      const vid = ytId(f.yt.value);
      if (!vid) { alert('Paste a YouTube link (or video ID).'); return; }
      if (!f.title.value.trim()) { alert('Add the song title.'); return; }
      if (!f.sheet.value.trim()) { alert('Paste a chord chart.'); return; }
      draft.videoId = vid;
      draft.title = f.title.value.trim();
      draft.artist = f.artist.value.trim();
      draft.sheet = f.sheet.value;
      draft.lrc = f.lrc.value.trim();
      if (song && song.sheet !== draft.sheet) { draft.lineTimes = null; draft.useTap = false; }
      if (song && song.lrc !== draft.lrc) draft.useTap = false;
      if (song && song.videoId !== draft.videoId) draft.offset = 0;
      const i = songs.findIndex((s) => s.id === draft.id);
      if (i >= 0) songs[i] = draft; else songs.push(draft);
      saveSongs();
      location.hash = '#/song/' + draft.id;
    };
    const del = $('#del');
    if (del) del.onclick = () => {
      if (!confirm(`Delete “${draft.title}” from this phone?`)) return;
      songs = songs.filter((s) => s.id !== draft.id);
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
    let B = S.buildRows(song);
    if (song.capo == null) song.capo = 0;

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
      $('#lyrics').innerHTML = out || '<p class="hint">No lines found in the chord chart.</p>';
      curEvent = -2;
    }

    function rerender() { B = S.buildRows(song); renderTools(); renderLyrics(); renderStrip(); tick(true); }

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
        events: { onReady: () => tick(true), onStateChange: () => tick(true) },
      });
    });
    timer = setInterval(() => tick(false), 100);

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

  route();
})();
