/* Discipleship Audio — prototype
 * Plain JS. Home screen reads data.json; the full library (all topics / all
 * speakers) loads small files from data/ on demand. Audio always streams from
 * the original https URLs on discipleshiplibrary.com.
 */
(() => {
  "use strict";

  // ---- Settings ----------------------------------------------------------
  // Put your GoatCounter code here (the "yourname" in yourname.goatcounter.com).
  const GOATCOUNTER_CODE = "";
  const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
  const SKIP_BACK = 15, SKIP_FWD = 30;
  const SHARE_TEXT = "This one was really good. Let me know what you think.";
  const PAGE = 40; // talk cards rendered per "Show more"

  // ?review in the URL shows "Draft" badges on Claude-written text
  if (/[?&]review\b/.test(location.search)) document.documentElement.classList.add("review");

  // ---- Tiny helpers ------------------------------------------------------
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("da." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("da." + k, JSON.stringify(v)); } catch {} },
  };
  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`;
  };
  const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
  const initials = (n) => String(n || "?").replace(/\(.*?\)/g, "").split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("") || "•";
  const pretty = (id) => String(id || "").split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const num = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(n));

  function toast(msg) {
    document.querySelectorAll(".toast").forEach((t) => t.remove());
    const t = document.createElement("div");
    t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // ---- Analytics (GoatCounter) -------------------------------------------
  if (GOATCOUNTER_CODE) {
    const s = document.createElement("script");
    s.async = true; s.src = "https://gc.zgo.at/count.js";
    s.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
    document.head.appendChild(s);
  }
  function track(path, title) {
    try { window.goatcounter?.count?.({ path, title: title || path, event: true }); } catch {}
  }

  // ---- Data --------------------------------------------------------------
  let D;                       // data.json
  const TALKS = {};            // every talk we've seen so far (data.json + loaded files)
  const SPK = {};              // speaker details (name, photo, bio, queue…)
  const NAMES = {};            // speaker id -> name (lightweight)
  const files = {};            // path -> Promise of parsed JSON

  const getJSON = (path) => (files[path] ||= fetch(path).then((r) => { if (!r.ok) throw new Error(path); return r.json(); }));

  function loadTopic(id) {
    // the speaker index adds photos for speakers who aren't featured mentors
    const idx = loadSpeakerIndex().catch(() => null);
    return Promise.all([getJSON(`data/topics/${id}.json`), idx]).then(([f]) => {
      Object.assign(TALKS, f.talks); Object.assign(NAMES, f.names || {});
      return f;
    });
  }
  let indexApplied = false;
  function applyIndex(list) {
    if (indexApplied) return list;
    for (const s of list) {
      if (s.p && !SPK[s.id]?.photo) SPK[s.id] = { ...(SPK[s.id] || {}), n: s.n, photo: s.p };
      NAMES[s.id] ||= s.n;
    }
    indexApplied = true;
    return list;
  }
  function loadSpeaker(id) {
    if (SPK[id]?.queue) return Promise.resolve(SPK[id]);
    return getJSON(`data/speakers/${id}.json`).then((f) => {
      for (const [k, v] of Object.entries(f.talks)) TALKS[k] = { ...v, ...(TALKS[k] || {}), se: v.se, so: v.so };
      SPK[id] = { ...(SPK[id] || {}), n: f.n, photo: f.photo || SPK[id]?.photo, bio: f.bio, queue: f.queue };
      NAMES[id] = f.n;
      return SPK[id];
    });
  }
  const loadSpeakerIndex = () => getJSON("data/speakers-index.json").then((l) => applyIndex(l));

  const talk = (id) => {
    if (String(id).startsWith("dd-")) {
      const n = id.slice(3), e = D.daily.eps[n];
      return e && { id, t: e.t, sp: D.daily.speaker, tp: ["Daily Discipleship"], se: e.se, u: e.u, lk: 0, daily: true };
    }
    const t = TALKS[id];
    return t && { id, ...t };
  };
  const speaker = (id) => SPK[id] || { n: NAMES[id] || pretty(id) };
  const isMentor = (id) => D.mentors.some((m) => m.id === id);

  // Today's capsule: #1 = Jan 1 2024, one per day, repeating a 1096-day (3-year) cycle;
  // on days with no capsule, use the next available one.
  function todayEpisode() {
    const [y, m, d] = D.daily.epoch.split("-").map(Number);
    const now = new Date();
    const days = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 864e5);
    const CYCLE = 1096;
    let n = (((days % CYCLE) + CYCLE) % CYCLE) + 1;
    for (let i = 0; i < CYCLE; i++, n = (n % CYCLE) + 1) if (D.daily.eps[n]) return "dd-" + n;
    return null;
  }

  // ---- Likes ---------------------------------------------------------------
  // Today: sample counts from data.json ("lk") + this device's own like.
  // Later (shared counts): keep this interface and swap the two marked lines
  // for calls to a hosted database such as Supabase. Nothing else changes.
  const Likes = (() => {
    const mine = store.get("likes", {}); // talk id -> 1 (liked on this device)
    const base = (id) => talk(id)?.lk || 0;            // ← later: counts fetched from the database
    const send = (id, liked) => {};                     // ← later: POST like/unlike to the database
    return {
      count: (id) => base(id) + (mine[id] ? 1 : 0),
      liked: (id) => !!mine[id],
      toggle(id) {
        const on = !mine[id];
        if (on) mine[id] = 1; else delete mine[id];
        store.set("likes", mine); send(id, on);
        return on;
      },
    };
  })();

  // ---- Share ---------------------------------------------------------------
  function talkLink(id) {
    const t = talk(id);
    const route = t?.daily ? `#/talk/daily/${id}` : `#/talk/${t?.sp || "x"}/${id}`;
    return location.origin + location.pathname + route;
  }
  async function shareTalk(id) {
    const t = talk(id); if (!t) return;
    const url = talkLink(id);
    track("share/" + id, t.t);
    if (navigator.share) {
      try { await navigator.share({ title: t.t, text: SHARE_TEXT, url }); track("share-done/native"); } catch {}
      return;
    }
    const msg = `${SHARE_TEXT} ${url}`;
    try { await navigator.clipboard.writeText(msg); }
    catch {
      const ta = document.createElement("textarea"); ta.value = msg; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch {} ta.remove();
    }
    track("share-done/copy");
    toast("Link copied. Paste it in a message to a friend.");
  }

  // ---- Progress (resume per talk) -----------------------------------------
  const prog = store.get("prog", {}); // id -> [position, duration, done]
  let progDirty = false;
  function saveProg(id, pos, dur, done) {
    if (!id) return;
    prog[id] = [Math.round(pos), Math.round(dur || prog[id]?.[1] || 0), done ? 1 : 0];
    progDirty = true;
  }
  setInterval(() => { if (progDirty) { store.set("prog", prog); progDirty = false; } }, 3000);
  const flushProg = () => { store.set("prog", prog); progDirty = false; };

  // ---- Art ---------------------------------------------------------------
  // Topic colors live in styles.css (--topic-*). Each felt-need topic has its own;
  // talks/speakers outside those topics get a steady pick from the same six.
  const PALETTE = ["teal", "plum", "slate", "amber", "gold", "rose"];
  const TOPIC_COLOR = { alone: "slate", doubt: "plum", anxious: "teal", purpose: "gold", relationships: "rose", all: "amber",
                        temptation: "amber", busy: "teal", leader: "gold" };
  const cvar = (name) => `var(--topic-${name})`;
  const needColor = (id) => cvar(TOPIC_COLOR[id] || PALETTE[hash(id) % PALETTE.length]);
  const speakerColor = (spId) => cvar(PALETTE[hash(spId) % PALETTE.length]);
  let talkNeed = null; // talk id -> felt-need id (first card it appears on)
  function talkColor(id) {
    if (!talkNeed) { talkNeed = {}; for (const n of D.needs) for (const t of n.talks) talkNeed[t] ||= n.id; }
    if (talkNeed[id]) return needColor(talkNeed[id]);
    return speakerColor(talk(id)?.sp || id);
  }
  const MOTIF = {
    alone: () => {
      let s = "";
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) s += `<circle cx="${30 + c * 36}" cy="${24 + r * 36}" r="9" fill="none" style="stroke:var(--art-line)" stroke-width="2"/>`;
      return s + `<circle cx="174" cy="24" r="14" fill="currentColor"/>`;
    },
    doubt: () => `<text x="118" y="190" font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="240" fill="currentColor" opacity=".95">?</text><text x="40" y="110" font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="110" fill="none" style="stroke:var(--art-line)" stroke-width="2">?</text>`,
    anxious: () => [0, 1, 2, 3, 4, 5].map((i) => `<path d="M-10 ${30 + i * 22} q 25 -${10 + i * 3} 50 0 t 50 0 t 50 0 t 50 0 t 50 0" fill="none" style="stroke:${i === 2 ? "currentColor" : "var(--art-line)"}" stroke-width="${i === 2 ? 5 : 2}" stroke-linecap="round"/>`).join(""),
    temptation: () => `<path d="M100 8 C 150 60 170 90 150 140 C 140 165 120 175 100 176 C 70 176 46 154 48 122 C 50 96 70 86 74 62 C 92 84 90 100 102 108 C 112 80 104 44 100 8 Z" fill="currentColor"/><path d="M100 70 C 125 100 130 120 118 145 C 110 160 90 160 82 146" fill="none" style="stroke:var(--shade)" stroke-width="4" stroke-linecap="round"/>`,
    purpose: () => [80, 60, 40, 20].map((r, i) => `<circle cx="140" cy="62" r="${r}" fill="${i === 3 ? "currentColor" : "none"}" style="stroke:${i === 3 ? "none" : "var(--art-line)"}" stroke-width="2"/>`).join("") + `<path d="M20 170 L138 64" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M120 62 L140 62 L140 82" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
    relationships: () => `<circle cx="78" cy="78" r="58" fill="none" style="stroke:var(--art-line)" stroke-width="3"/><circle cx="130" cy="78" r="58" fill="currentColor" style="mix-blend-mode:screen"/>`,
    busy: () => `<circle cx="140" cy="62" r="66" fill="none" style="stroke:var(--art-line)" stroke-width="14"/><path d="M140 -4 A66 66 0 1 1 74 62" fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round"/><path d="M140 62 L140 24 M140 62 L168 76" style="stroke:var(--text)" stroke-width="4" stroke-linecap="round"/>`,
    leader: () => [0, 1, 2, 3].map((i) => `<path d="M40 ${150 - i * 36} L110 ${100 - i * 36} L180 ${150 - i * 36}" fill="none" style="stroke:${i === 3 ? "currentColor" : "var(--art-line)"}" stroke-width="${i === 3 ? 10 : 6}" stroke-linecap="round" stroke-linejoin="round"/>`).join(""),
    all: () => {
      let s = "";
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const on = r === 0 && c === 3;
        s += `<rect x="${22 + c * 44}" y="${16 + r * 40}" width="32" height="28" rx="8" fill="${on ? "currentColor" : "none"}" style="stroke:${on ? "none" : "var(--art-line)"}" stroke-width="2"/>`;
      }
      return s;
    },
  };
  function needArt(id) {
    return `<svg class="art" viewBox="0 0 200 224" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style="--c:${needColor(id)}">
      <defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--c)"/><stop offset="1" style="stop-color:color-mix(in srgb, var(--c) 28%, var(--bg))"/></linearGradient>
      <linearGradient id="f${id}" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" style="stop-color:var(--bg)" stop-opacity="0"/><stop offset="1" style="stop-color:var(--bg)" stop-opacity=".8"/></linearGradient></defs>
      <rect width="200" height="224" fill="url(#g${id})"/>${(MOTIF[id] || MOTIF.alone)()}<rect width="200" height="224" fill="url(#f${id})"/></svg>`;
  }
  const photoOf = (spId) => SPK[spId]?.photo || null;
  // color: a CSS color (usually the talk's topic color); defaults to the speaker's color
  function speakerArt(spId, color = speakerColor(spId), photo = photoOf(spId)) {
    if (photo) return `<div class="photo" style="width:100%;height:100%;--c:${color}"><img src="${esc(photo)}" alt="" loading="lazy" decoding="async"></div>`;
    return `<div class="tile" style="--c:${color}">${esc(initials(speaker(spId).n))}</div>`;
  }
  function bigArt(spId, color = speakerColor(spId)) {
    const s = speaker(spId);
    if (s.photo) return `<div class="photo" style="width:100%;height:100%;--c:${color}"><img src="${esc(s.photo)}" alt="Photo of ${esc(s.n)}" decoding="async"></div>`;
    return `<div class="monogram" role="img" aria-label="${esc(s.n)}" style="--c:${color}">${esc(initials(s.n))}</div>`;
  }

  // ---- Icons -------------------------------------------------------------
  const I = {
    play: (s = 28) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>`,
    pause: (s = 28) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.3" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.3" fill="currentColor"/></svg>`,
    back: `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    home: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
    chev: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    right: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    arrow: `<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    heart: (on) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
    share: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    search: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
    eq: `<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>`,
  };

  // Heart + share buttons (used on every talk card and in the player)
  function acts(id, cls = "") {
    const on = Likes.liked(id), n = Likes.count(id);
    return `<span class="acts ${cls}">
      <button class="act act--like${on ? " is-on" : ""}" data-like="${esc(id)}" aria-pressed="${on}" aria-label="${on ? "Unlike" : "Like"} (${n} likes)">${I.heart(on)}<span class="act__n">${n ? num(n) : ""}</span></button>
      <button class="act act--share" data-share="${esc(id)}" aria-label="Share with a friend">${I.share}</button>
    </span>`;
  }
  const draftBadge = (on) => (on ? `<span class="draft">Draft</span>` : "");

  // ---- Talk card ---------------------------------------------------------
  function timeNote(p) {
    if (!p || !p[1]) return "";
    const mins = (s) => Math.max(1, Math.round(s / 60));
    const txt = p[2] ? `${mins(p[1])} min · played` : p[0] > 5 ? `${mins(p[1] - p[0])} min left` : `${mins(p[1])} min`;
    return `<span class="talk__time">${txt}</span>`;
  }
  const mainTopic = (t) => (t.tp || []).find((x) => !/^(Passage Studies|Basics of the Christian Life)$/.test(x)) || t.tp?.[0] || "";

  function talkCard(id, ctx, idx) {
    const t = talk(id); if (!t) return "";
    const s = speaker(t.sp), p = prog[id], cur = P.currentId() === id;
    const pct = p && p[1] ? Math.min(100, (p[0] / p[1]) * 100) : 0;
    const topic = mainTopic(t);
    return `<div class="talk${cur ? " is-current" : ""}${cur && P.playing() ? " is-playing" : ""}${p?.[2] ? " is-done" : ""}" data-id="${esc(id)}">
      <button class="talk__hit" data-play="${esc(id)}" data-ctx="${esc(ctx)}" data-idx="${idx}" aria-label="Play ${esc(t.t)} by ${esc(s.n)}"></button>
      <span class="talk__art">${speakerArt(t.sp, talkColor(id))}<span class="talk__eq">${I.eq}</span></span>
      <span class="talk__body">
        <span class="talk__t">${esc(t.t)}</span>
        <span class="talk__s">${esc(s.n)}</span>${topic ? `<span class="talk__tp">${esc(topic)}</span>` : ""}
        ${t.sm ? `<span class="talk__sum">${esc(t.sm)}${draftBadge(t.smd)}</span>` : ""}
        ${timeNote(p)}
      </span>
      ${acts(id, "acts--col")}
      ${pct > 0 && !p?.[2] ? `<span class="talk__prog" style="width:${pct.toFixed(1)}%"></span>` : ""}
    </div>`;
  }

  // Compact card for horizontal rows (Most liked)
  function tallCard(id, ctx, idx) {
    const t = talk(id); if (!t) return "";
    const s = speaker(t.sp);
    return `<div class="tall" data-id="${esc(id)}" style="--c:${talkColor(id)}">
      <button class="talk__hit" data-play="${esc(id)}" data-ctx="${esc(ctx)}" data-idx="${idx}" aria-label="Play ${esc(t.t)} by ${esc(s.n)}"></button>
      <span class="tall__art">${speakerArt(t.sp, talkColor(id))}<span class="tall__rank">${idx + 1}</span></span>
      <span class="tall__t">${esc(t.t)}</span>
      <span class="tall__s">${esc(s.n)}</span>
      ${acts(id, "acts--row")}
    </div>`;
  }

  // ---- Queues ------------------------------------------------------------
  // Contexts: need:<id> · mentor:<id> · speaker:<id> · topic:<id> · most · daily
  const topicFiles = {};
  function mostLiked() {
    return Object.keys(D.talks).sort((a, b) => Likes.count(b) - Likes.count(a)).slice(0, 10);
  }
  let mostCache = null;
  function ctxQueue(ctx) {
    const [k, v] = ctx.split(":");
    if (k === "need") return D.needs.find((n) => n.id === v)?.talks || [];
    if (k === "mentor" || k === "speaker") return D.mentors.find((m) => m.id === v)?.queue || SPK[v]?.queue || [];
    if (k === "topic") return topicFiles[v]?.order || [];
    if (k === "most") return (mostCache ||= mostLiked());
    if (k === "daily") return [todayEpisode()].filter(Boolean);
    return [];
  }
  function ensureCtx(ctx) {
    const [k, v] = (ctx || "").split(":");
    if ((k === "speaker" || k === "mentor") && !isMentor(v)) return loadSpeaker(v);
    if (k === "topic") return loadTopic(v).then((f) => (topicFiles[v] = f));
    return Promise.resolve();
  }
  function ctxLabel(ctx) {
    const [k, v] = ctx.split(":");
    if (k === "need") return D.needs.find((n) => n.id === v)?.title || "";
    if (k === "mentor" || k === "speaker") return speaker(v).n;
    if (k === "topic") return topicFiles[v]?.n || "Topic";
    if (k === "most") return "Most liked";
    if (k === "daily") return "Today's 4-minute";
    return "Now playing";
  }

  // ---- Router ------------------------------------------------------------
  const app = $("#app");
  let lastDepth = 0, navs = 0, renderSeq = 0;
  const DEPTH = { "": 0, need: 1, topics: 1, speakers: 1, topic: 2, mentor: 2, speaker: 2, talk: 2 };

  function render() {
    const h = location.hash.replace(/^#\/?/, "");
    const [route, a1, a2] = h.split("/");
    const depth = DEPTH[route] ?? 0;
    const back = depth < lastDepth; lastDepth = depth;
    const seq = ++renderSeq;
    const paint = (html) => {
      if (seq !== renderSeq) return;
      app.innerHTML = `<div class="view${back ? " is-back" : ""}">${html}</div>`;
      afterRender(route);
    };
    let out;
    try {
      if (route === "need") out = viewNeed(a1);
      else if (route === "topics") out = viewTopics();
      else if (route === "speakers") out = viewSpeakers();
      else if (route === "topic") out = viewTopic(a1);
      else if (route === "mentor" || route === "speaker") out = viewSpeaker(a1);
      else if (route === "talk") out = viewTalk(a1, a2);
      else if (route === "mentors") { location.replace("#/speakers"); return; }
      else out = viewHome();
    } catch (e) { console.error(e); out = viewHome(); }
    if (out && typeof out.then === "function") {
      paint(loadingView());
      out.then(paint).catch(() => paint(errorView()));
    } else paint(out);
    if (!back) window.scrollTo(0, 0);
    track("/" + (h || ""), document.title);
  }
  window.addEventListener("hashchange", () => { navs++; render(); });

  const homeBar = (title = "") => `<div class="backbar">
      <button class="icon-btn glass" data-back aria-label="Back">${I.back}</button>
      <span class="backbar__t">${esc(title)}</span>
      <a class="home-btn" href="#/" aria-label="Home">${I.home}<span>Home</span></a></div>`;
  const loadingView = () => `${homeBar()}<div class="page-h"><p class="muted">Loading…</p></div>`;
  const errorView = () => `${homeBar()}<div class="page-h"><h1>Couldn't load this</h1><p>Check your connection and try again.</p></div>`;

  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? "Up late?" : h < 12 ? "Good morning." : h < 17 ? "Good afternoon." : "Good evening.";
  }

  // ---- Home --------------------------------------------------------------
  function viewHome() {
    const dd = todayEpisode(), t = dd && talk(dd);
    const playingToday = P.currentId() === dd && P.playing();
    const H = [16, 30, 22, 40, 26, 34, 18, 28, 12];
    const bars = H.map((h, i) => `<rect x="${i * 14}" y="${40 - h}" width="7" height="${h * 2}" rx="3.5" fill="currentColor" style="animation-delay:${-i * 0.13}s"/>`).join("");
    const featured = D.needs.filter((n) => n.featured);
    mostCache = mostLiked();
    return `
      <header class="top"><span class="wordmark"><i></i>Discipleship Audio</span></header>
      <section class="hello rise"><h1>${greeting()}<br><em>What's on your mind?</em></h1></section>
      ${t ? `<button class="today rise${playingToday ? " is-playing" : ""}" id="todayBtn" data-play="${dd}" data-ctx="daily" data-idx="0" style="animation-delay:.06s" aria-label="Play today's 4-minute: ${esc(t.t)}">
        <svg class="today__wave" width="130" height="80" viewBox="0 0 130 80" aria-hidden="true">${bars}</svg>
        <span><span class="today__eyebrow"><b>4 MIN</b> Today's capsule</span>
          <span class="today__title">${esc(t.t)}</span>
          <span class="today__sub">LeRoy Eims · Daily Discipleship</span></span>
        <span class="today__btn">${playingToday ? I.pause(30) : I.play(30)}</span>
      </button>` : ""}
      <div class="section-h"><h2>Start where you are</h2></div>
      <div class="needs">
        ${featured.map((n, i) => needCard(n, D.needs.indexOf(n), i)).join("")}
        <button class="need need--all rise" style="animation-delay:${0.1 + featured.length * 0.04}s" data-go="#/topics" data-track="see-all-topics">
          ${needArt("all")}<span class="need__n">${String(featured.length + 1).padStart(2, "0")}</span>
          <span class="need__t">See all topics</span><span class="need__c">${D.topics.length} topics ${I.right}</span></button>
      </div>
      <div class="section-h"><h2>Most liked</h2></div>
      <div class="rail rail--tall">${mostCache.map((id, i) => tallCard(id, "most", i)).join("")}</div>
      <div class="section-h"><h2>Pick a mentor</h2><a href="#/speakers" data-track-link="see-all-speakers">See all speakers</a></div>
      <div class="rail rail--mentors">${D.featuredMentors.map((id) => mentorCard(id)).join("")}
        <a class="mentor mentor--all" href="#/speakers" data-track-link="see-all-speakers">
          <span class="mentor--all__box">${I.arrow}<b>See all<br>speakers</b><small>2,000+ voices</small></span></a>
      </div>
      <p class="foot">Talks stream from <a href="${esc(D.source)}" target="_blank" rel="noopener">discipleshiplibrary.com</a>. Prototype · like counts are samples · data ${esc(D.generated)}.</p>`;
  }

  function needCard(n, artIdx, pos) {
    return `<button class="need rise" style="animation-delay:${0.1 + pos * 0.04}s" data-go="#/need/${n.id}" data-track="need/${n.id}">
      ${needArt(n.id)}<span class="need__n">${String(pos + 1).padStart(2, "0")}</span>
      <span class="need__t">${esc(n.title)}</span><span class="need__c">${n.talks.length} talks</span></button>`;
  }

  function mentorCard(id) {
    const s = speaker(id), m = D.mentors.find((x) => x.id === id);
    return `<div class="mentor">
      <button class="mentor__hit" data-go="#/mentor/${id}" data-track="mentor/${id}" aria-label="${esc(s.n)}: open">
        <span class="photo mentor__photo">${s.photo ? `<img src="${esc(s.photo)}" alt="" loading="lazy" decoding="async">` : `<span class="monogram">${esc(initials(s.n))}</span>`}<span class="mentor__count">${m ? m.queue.length : ""} talks</span></span>
        <span class="mentor__name">${esc(s.n)}</span>
      </button>
      ${s.about ? `<p class="mentor__about" id="about-${id}">${esc(s.about)}${draftBadge(s.aboutDraft)}</p>
      <button class="more-btn" data-more="about-${id}" aria-expanded="false" aria-controls="about-${id}">Read more</button>` : ""}
    </div>`;
  }

  // ---- Felt-need page ------------------------------------------------------
  function viewNeed(id) {
    const i = D.needs.findIndex((n) => n.id === id), n = D.needs[i];
    if (!n) return viewHome();
    const ctx = "need:" + id;
    return `
      ${homeBar()}
      <div class="hero rise">${needArt(n.id)}<h1 class="hero__t">${esc(n.title)}</h1></div>
      <div class="page-intro"><p>${esc(n.blurb)}</p><div class="chips">${n.topics.map((t) => `<a class="chip" href="#/topic/${t.id}">${esc(t.n)}</a>`).join("")}</div></div>
      <div class="actions"><button class="btn-primary" data-playall="${ctx}">${I.play(22)} Play all</button><span class="muted">${n.talks.length} talks</span></div>
      <div class="talks">${n.talks.map((t, k) => talkCard(t, ctx, k)).join("")}</div>`;
  }

  // ---- All topics ----------------------------------------------------------
  function searchBox(ph, id) {
    return `<label class="search">${I.search}<input id="${id}" type="search" placeholder="${esc(ph)}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="${esc(ph)}"></label>`;
  }
  function viewTopics() {
    return `
      ${homeBar()}
      <header class="page-h rise"><h1>All topics</h1></header>
      <div class="sticky-search">${searchBox("Search topics", "topicQ")}</div>
      <section class="filter-group" data-group-name="needs">
        <h3 class="list-h">Start where you are</h3>
        <div class="rows">${D.needs.map((n, i) => `<a class="row" href="#/need/${n.id}" data-n="${esc(fold(n.title + " " + n.topics.map((t) => t.n).join(" ")))}">
            <span class="row__art">${needArt(n.id)}</span><span class="row__t">${esc(n.title)}</span><span class="row__c">${n.talks.length}</span>${I.right}</a>`).join("")}</div>
      </section>
      <section class="filter-group">
        <h3 class="list-h">A–Z</h3>
        <div class="rows">${D.topics.map((t) => `<a class="row" href="#/topic/${t.id}" data-n="${esc(fold(t.n))}"><span class="row__t">${esc(t.n)}</span><span class="row__c">${t.c.toLocaleString()}</span>${I.right}</a>`).join("")}</div>
      </section>
      <p class="empty" hidden>No topics match. Try a shorter word.</p>`;
  }

  // ---- All speakers --------------------------------------------------------
  function viewSpeakers() {
    return loadSpeakerIndex().then((list) => {
      const groups = {};
      for (const s of list) {
        let L = fold(s.k).charAt(0).toUpperCase();
        if (!/[A-Z]/.test(L)) L = "#";
        (groups[L] ||= []).push(s);
      }
      const letters = Object.keys(groups).sort((a, b) => (a === "#") - (b === "#") || a.localeCompare(b));
      return `
        ${homeBar()}
        <header class="page-h rise"><h1>All speakers</h1><p>${list.length.toLocaleString()} voices from the library.</p></header>
        <div class="sticky-search">${searchBox("Search speakers", "spkQ")}</div>
        <nav class="az" aria-label="Jump to letter">${letters.map((L) => `<button data-az="${L}" aria-label="Jump to ${L}">${L}</button>`).join("")}</nav>
        <div class="az-list">${letters.map((L) => `<section class="filter-group" id="az-${L}">
            <h3 class="list-h">${L}</h3>
            <div class="rows">${groups[L].map((s) => `<a class="row row--spk" href="#/speaker/${s.id}" data-n="${esc(fold(s.n))}">
              <span class="row__av">${s.p ? `<span class="photo" style="display:block;width:100%;height:100%;--c:${speakerColor(s.id)}"><img src="${esc(s.p)}" alt="" loading="lazy" decoding="async"></span>` : `<span class="tile" style="--c:${speakerColor(s.id)}">${esc(initials(s.n))}</span>`}</span>
              <span class="row__t">${esc(s.n)}</span><span class="row__c">${s.c.toLocaleString()}</span>${I.right}</a>`).join("")}</div></section>`).join("")}</div>
        <p class="empty" hidden>No speakers match. Try a last name.</p>`;
    });
  }

  // ---- Topic page ----------------------------------------------------------
  function viewTopic(id) {
    return ensureCtx("topic:" + id).then(() => {
      const f = topicFiles[id], ctx = "topic:" + id;
      return `
        ${homeBar()}
        <header class="page-h rise"><p class="eyebrow">Topic</p><h1>${esc(f.n)}</h1><p>${f.order.length.toLocaleString()} talks</p></header>
        <div class="actions" style="padding-top:0"><button class="btn-primary" data-playall="${ctx}">${I.play(22)} Play all</button></div>
        <div class="talks" data-ctx="${ctx}" data-shown="${Math.min(PAGE, f.order.length)}">${f.order.slice(0, PAGE).map((t, k) => talkCard(t, ctx, k)).join("")}</div>
        ${f.order.length > PAGE ? `<div class="more-wrap"><button class="btn-ghost" data-showmore="${ctx}">Show more</button></div>` : ""}`;
    });
  }

  // ---- Speaker / mentor page ----------------------------------------------
  function viewSpeaker(id) {
    const build = () => {
      const s = speaker(id), ctx = "speaker:" + id, q = ctxQueue(ctx);
      if (!q.length) return errorView();
      const groups = [];
      q.forEach((tid, k) => {
        const se = talk(tid)?.se || "More talks";
        if (!groups.length || groups[groups.length - 1].name !== se) groups.push({ name: se, items: [] });
        groups[groups.length - 1].items.push([tid, k]);
      });
      const resume = store.get("ctxIdx", {})[ctx];
      const resumeT = resume != null && talk(q[resume]);
      const nSeries = groups.filter((g) => g.name !== "More talks").length;
      const about = s.about || s.bio || "";
      return `
        ${homeBar()}
        <div class="mhero">${bigArt(id)}<div class="mhero__txt"><h1>${esc(s.n)}</h1></div></div>
        ${about ? `<p class="mhero__line">${esc(about)}${draftBadge(s.aboutDraft)}</p>` : ""}
        <p class="mhero__stats">${q.length.toLocaleString()} talks${nSeries ? ` · ${nSeries} series` : ""}</p>
        <div class="actions"><button class="btn-primary" data-playall="${ctx}" data-start="${resume ?? 0}">${I.play(22)} ${resumeT ? `Continue <small>${esc(resumeT.t)}</small>` : "Start listening"}</button></div>
        <div class="groups">${groups.map((g, gi) => `<details class="series"${gi === 0 ? " open" : ""} data-group="${gi}" data-ctx="${ctx}">
            <summary><b>${esc(g.name)}</b><span>${g.items.length}</span>${I.chev}</summary>
            <div class="talks">${gi === 0 ? g.items.slice(0, PAGE).map(([t, k]) => talkCard(t, ctx, k)).join("") : ""}</div></details>`).join("")}</div>`;
    };
    if (isMentor(id) || SPK[id]?.queue) return build();
    return loadSpeaker(id).then(build);
  }

  // lazy-render series groups on open
  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.open || !d.classList.contains("series")) return;
    const box = d.querySelector(".talks");
    if (box.childElementCount) return;
    const ctx = d.dataset.ctx, q = ctxQueue(ctx), gi = +d.dataset.group;
    let g = -1, last = null; const out = [];
    q.forEach((tid, k) => { const se = talk(tid)?.se || "More talks"; if (se !== last) { g++; last = se; } if (g === gi) out.push(talkCard(tid, ctx, k)); });
    box.innerHTML = out.join("");
  }, true);

  // ---- Single talk page (shared links land here) ---------------------------
  function viewTalk(sp, id) {
    const build = () => {
      const t = talk(id);
      if (!t) return errorView();
      const s = speaker(t.sp);
      const ctx = t.daily ? "daily" : "speaker:" + t.sp;
      const q = ctxQueue(ctx), idx = Math.max(0, q.indexOf(id));
      // Ready to play: load it into the player (paused) unless something else is playing.
      if (!P.playing() && P.currentId() !== id) P.load(t.daily ? [id] : q, t.daily ? 0 : idx, ctx, false);
      const more = t.daily ? [] : q.filter((x) => x !== id).slice(0, 4);
      const cur = P.currentId() === id && P.playing();
      return `
        ${homeBar()}
        <article class="single rise">
          <div class="single__art">${bigArt(t.sp, talkColor(id))}</div>
          <p class="eyebrow">${t.daily ? "Daily Discipleship · 4 min" : esc(mainTopic(t) || "Talk")}</p>
          <h1 class="single__t">${esc(t.t)}</h1>
          <a class="single__s" href="#/speaker/${esc(t.sp)}">${esc(s.n)}</a>
          ${t.sm ? `<p class="single__sum">${esc(t.sm)}${draftBadge(t.smd)}</p>` : ""}
          <div class="single__acts">
            <button class="btn-primary btn-big" data-play="${esc(id)}" data-ctx="${esc(ctx)}" data-idx="${t.daily ? 0 : idx}" id="singlePlay">${cur ? I.pause(24) : I.play(24)} ${cur ? "Pause" : "Play"}</button>
            ${acts(id, "acts--row acts--big")}
          </div>
        </article>
        ${more.length ? `<div class="section-h"><h2>More from ${esc(s.n.split(" ")[0])}</h2><a href="#/speaker/${esc(t.sp)}">See all</a></div>
          <div class="talks">${more.map((x) => talkCard(x, ctx, q.indexOf(x))).join("")}</div>` : ""}`;
    };
    if (talk(id) && (sp === "daily" || isMentor(sp) || SPK[sp]?.queue)) return build();
    if (sp === "daily") return build();
    return loadSpeaker(sp).then(build);
  }

  // ---- After render: wire search boxes, A–Z ----------------------------------
  function afterRender(route) {
    const q = $("#topicQ") || $("#spkQ");
    if (q) {
      const groups = [...app.querySelectorAll(".filter-group")];
      const empty = app.querySelector(".empty");
      const az = app.querySelector(".az");
      q.addEventListener("input", () => {
        const v = fold(q.value.trim());
        let any = false;
        for (const g of groups) {
          let n = 0;
          for (const r of g.querySelectorAll(".row")) { const on = !v || r.dataset.n.includes(v); r.hidden = !on; if (on) n++; }
          g.hidden = !n; if (n) any = true;
        }
        empty.hidden = any;
        if (az) az.hidden = !!v;
      });
    }
    const az = app.querySelector(".az");
    if (az) {
      const jump = (L) => { const el = document.getElementById("az-" + L); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 140 }); };
      az.addEventListener("click", (e) => { const b = e.target.closest("[data-az]"); if (b) jump(b.dataset.az); });
      // drag along the strip to scrub through letters
      az.addEventListener("touchmove", (e) => {
        const tch = e.touches[0], el = document.elementFromPoint(tch.clientX, tch.clientY);
        if (el?.dataset?.az) { e.preventDefault(); jump(el.dataset.az); }
      }, { passive: false });
    }
  }

  // ---- Global taps -------------------------------------------------------
  function refreshLike(id) {
    const on = Likes.liked(id), n = Likes.count(id);
    document.querySelectorAll(`[data-like="${CSS.escape(id)}"]`).forEach((b) => {
      b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on);
      b.setAttribute("aria-label", `${on ? "Unlike" : "Like"} (${n} likes)`);
      b.innerHTML = `${I.heart(on)}<span class="act__n">${n ? num(n) : ""}</span>`;
      if (on) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
    });
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-like],[data-share],[data-more],[data-showmore],[data-play],[data-go],[data-back],[data-playall],[data-track-link],[data-jump]");
    if (!el) return;
    if (el.dataset.like) { const id = el.dataset.like, on = Likes.toggle(id); track((on ? "like/" : "unlike/") + id, talk(id)?.t); refreshLike(id); return; }
    if (el.dataset.share) { shareTalk(el.dataset.share); return; }
    if (el.dataset.more) {
      const p = document.getElementById(el.dataset.more), open = !p.classList.contains("is-open");
      p.classList.toggle("is-open", open); el.setAttribute("aria-expanded", open); el.textContent = open ? "Show less" : "Read more";
      if (open) track("tap/read-more/" + el.dataset.more.replace("about-", ""));
      return;
    }
    if (el.dataset.showmore) {
      const ctx = el.dataset.showmore, box = app.querySelector(`.talks[data-ctx="${CSS.escape(ctx)}"]`), q = ctxQueue(ctx);
      const from = +box.dataset.shown, to = Math.min(q.length, from + PAGE);
      box.insertAdjacentHTML("beforeend", q.slice(from, to).map((t, k) => talkCard(t, ctx, from + k)).join(""));
      box.dataset.shown = to;
      if (to >= q.length) el.parentElement.remove();
      return;
    }
    if (el.dataset.trackLink) track("tap/" + el.dataset.trackLink);
    if (el.dataset.go) { track("tap/" + el.dataset.track); location.hash = el.dataset.go; return; }
    if (el.hasAttribute("data-back")) { navs > 0 ? history.back() : (location.hash = "#/"); return; }
    if (el.dataset.playall) {
      const ctx = el.dataset.playall, start = +(el.dataset.start || 0);
      track("tap/playall/" + ctx.replace(":", "/"));
      P.load(ctxQueue(ctx), start, ctx, true);
      return;
    }
    if (el.dataset.jump) { P.load(P.queue(), +el.dataset.jump, P.ctx(), true); return; }
    if (el.dataset.play) {
      const id = el.dataset.play, ctx = el.dataset.ctx, idx = +el.dataset.idx;
      track("tap/talk/" + id, talk(id)?.t);
      if (P.currentId() === id) { P.toggle(); return; }
      P.load(ctxQueue(ctx), idx, ctx, true);
    }
  });

  // ---- Player ------------------------------------------------------------
  const P = (() => {
    const a = $("#audio");
    let queue = [], idx = -1, ctx = "", scrubbing = false, lastSave = 0, countedPlay = null;
    let rate = store.get("rate", 1);
    if (!SPEEDS.includes(rate)) rate = 1;

    const el = {
      mini: $("#mini"), miniArt: $("#miniArt"), miniTitle: $("#miniTitle"), miniSub: $("#miniSub"), miniPlay: $("#miniPlay"), miniFill: $("#miniFill"),
      sheet: $("#sheet"), art: $("#sheetArt"), title: $("#sheetTitle"), sub: $("#sheetSub"), sum: $("#sheetSum"), acts: $("#sheetActs"), ctx: $("#sheetCtx"),
      scrub: $("#scrub"), cur: $("#tCur"), left: $("#tLeft"), play: $("#play"), speed: $("#speed"), upnext: $("#upnext"),
    };
    const currentId = () => queue[idx] || null;
    const playing = () => !a.paused && !a.ended;

    function load(q, i, c, autoplay) {
      if (!q.length) return;
      persistPos();
      queue = q.slice(); idx = Math.max(0, Math.min(i, q.length - 1)); ctx = c;
      const t = talk(queue[idx]);
      if (!t) return;
      a.src = t.u;
      a.playbackRate = a.defaultPlaybackRate = rate;
      const p = prog[t.id];
      a.dataset.resume = p && !p[2] && p[0] > 5 ? p[0] - 2 : 0;
      const ci = store.get("ctxIdx", {}); ci[ctx] = idx; store.set("ctxIdx", ci);
      store.set("session", { queue, idx, ctx });
      paint(); paintMeta(t);
      if (autoplay) a.play()?.catch?.(() => {});
    }

    a.addEventListener("loadedmetadata", () => {
      const r = +a.dataset.resume || 0;
      if (r && r < a.duration - 3) { a.currentTime = r; toast(`Picking up at ${fmt(r)}`); }
      a.dataset.resume = 0;
      a.playbackRate = rate;
      tick();
    });

    function persistPos(done) {
      const id = currentId();
      if (!id || !isFinite(a.duration)) return;
      const d = a.duration, pos = a.currentTime;
      const finished = done || pos > d - 15;
      saveProg(id, finished ? 0 : pos, d, finished || prog[id]?.[2]);
    }

    function paintMeta(t) {
      const s = speaker(t.sp);
      el.mini.hidden = false;
      const c = talkColor(t.id);
      el.miniArt.style.setProperty("--c", c); el.sheet.style.setProperty("--c", c);
      el.miniArt.innerHTML = speakerArt(t.sp, c);
      el.miniTitle.textContent = t.t;
      el.miniSub.textContent = s.n;
      el.art.innerHTML = s.photo ? bigArt(t.sp, c) : `<div class="tile" style="--c:${c}">${esc(initials(s.n))}</div>`;
      el.title.textContent = t.t;
      el.sub.textContent = [s.n, t.se || (t.tp || [])[0]].filter(Boolean).join(" · ");
      el.sum.innerHTML = t.sm ? esc(t.sm) + draftBadge(t.smd) : "";
      el.sum.hidden = !t.sm;
      el.acts.innerHTML = acts(t.id, "acts--row");
      el.ctx.textContent = ctxLabel(ctx);
      paintUpNext();
      if ("mediaSession" in navigator) {
        const art = s.photo ? [{ src: s.photo, sizes: "260x312", type: "image/jpeg" }] : [];
        art.push({ src: new URL("icon-512.png", location.href).href, sizes: "512x512", type: "image/png" });
        navigator.mediaSession.metadata = new MediaMetadata({ title: t.t, artist: s.n, album: t.se || ctxLabel(ctx), artwork: art });
      }
    }

    function paintUpNext() {
      const next = queue.slice(idx + 1, idx + 6);
      el.upnext.parentElement.hidden = !next.length;
      el.upnext.innerHTML = next.map((id, k) => {
        const t = talk(id); if (!t) return "";
        return `<li><button data-jump="${idx + 1 + k}"><span class="talk__art">${speakerArt(t.sp, talkColor(id))}</span><span><b>${esc(t.t)}</b><span>${esc(speaker(t.sp).n)}</span></span></button></li>`;
      }).join("") + (queue.length - idx - 1 > 5 ? `<li class="muted" style="padding:6px 4px;font-size:14px">+ ${queue.length - idx - 6} more</li>` : "");
    }

    function paint() {
      const on = playing();
      const ico = on ? I.pause : I.play;
      el.miniPlay.innerHTML = ico(30); el.miniPlay.setAttribute("aria-label", on ? "Pause" : "Play");
      el.play.innerHTML = ico(38); el.play.setAttribute("aria-label", on ? "Pause" : "Play");
      el.sheet.classList.toggle("is-playing", on);
      el.speed.textContent = rate + "×";
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = on ? "playing" : "paused";
      document.querySelectorAll(".talk[data-id]").forEach((c) => {
        const cur = c.dataset.id === currentId();
        c.classList.toggle("is-current", cur);
        c.classList.toggle("is-playing", cur && on);
      });
      const tb = $("#todayBtn");
      if (tb) { const cur = tb.dataset.play === currentId() && on; tb.classList.toggle("is-playing", cur); tb.querySelector(".today__btn").innerHTML = cur ? I.pause(30) : I.play(30); }
      const sp = $("#singlePlay");
      if (sp) { const cur = sp.dataset.play === currentId() && on; sp.innerHTML = `${cur ? I.pause(24) : I.play(24)} ${cur ? "Pause" : "Play"}`; }
    }

    function tick() {
      const d = a.duration, c = a.currentTime;
      if (!isFinite(d) || d <= 0) return;
      const pct = (c / d) * 100;
      el.miniFill.style.width = pct + "%";
      if (!scrubbing) {
        el.scrub.value = Math.round((c / d) * 1000);
        el.scrub.style.setProperty("--p", pct + "%");
        el.cur.textContent = fmt(c); el.left.textContent = "-" + fmt(d - c);
      }
      if ("mediaSession" in navigator && navigator.mediaSession.setPositionState) {
        try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(c, d), playbackRate: a.playbackRate }); } catch {}
      }
      const now = Date.now();
      if (now - lastSave > 5000) { lastSave = now; persistPos(); }
    }

    function seek(to) {
      if (!isFinite(a.duration)) return;
      a.currentTime = Math.max(0, Math.min(a.duration - 0.5, to));
      tick(); persistPos();
    }
    const toggle = () => { if (!currentId()) return; playing() ? a.pause() : a.play().catch(() => {}); };
    const next = () => { if (idx < queue.length - 1) load(queue, idx + 1, ctx, true); };
    const prev = () => { if (a.currentTime > 5 || idx === 0) seek(0); else load(queue, idx - 1, ctx, true); };

    a.addEventListener("timeupdate", tick);
    a.addEventListener("play", paint);
    a.addEventListener("playing", () => {
      paint();
      if (countedPlay !== currentId()) { countedPlay = currentId(); track("play/" + countedPlay, talk(countedPlay)?.t); }
    });
    a.addEventListener("pause", () => { paint(); persistPos(); flushProg(); });
    a.addEventListener("ended", () => { persistPos(true); flushProg(); if (idx < queue.length - 1) next(); else paint(); });
    a.addEventListener("error", () => { if (a.getAttribute("src")) { paint(); toast("Couldn't load this talk. Check your connection."); } });
    a.addEventListener("ratechange", () => { el.speed.textContent = a.playbackRate + "×"; });
    window.addEventListener("pagehide", () => { persistPos(); flushProg(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden) { persistPos(); flushProg(); } });

    // controls
    el.miniPlay.onclick = toggle;
    el.play.onclick = toggle;
    $("#back15").onclick = () => seek(a.currentTime - SKIP_BACK);
    $("#fwd30").onclick = () => seek(a.currentTime + SKIP_FWD);
    $("#next").onclick = next;
    el.speed.onclick = () => {
      rate = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length];
      a.playbackRate = a.defaultPlaybackRate = rate; store.set("rate", rate); paint();
    };
    // scrubber: drag freely, seek on release
    el.scrub.addEventListener("input", () => {
      scrubbing = true;
      const d = a.duration || 0, v = el.scrub.value / 1000;
      el.scrub.style.setProperty("--p", v * 100 + "%");
      el.cur.textContent = fmt(v * d); el.left.textContent = "-" + fmt(d - v * d);
    });
    el.scrub.addEventListener("change", () => { scrubbing = false; seek((el.scrub.value / 1000) * (a.duration || 0)); });

    // sheet open/close
    const open = () => { el.sheet.classList.add("is-open"); el.sheet.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden"; paintUpNext(); };
    const close = () => { el.sheet.classList.remove("is-open"); el.sheet.setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; };
    $("#miniOpen").onclick = open;
    $("#sheetClose").onclick = close;
    let y0 = null;
    el.sheet.addEventListener("touchstart", (e) => { y0 = el.sheet.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
    el.sheet.addEventListener("touchend", (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 110) close(); y0 = null; });

    // keyboard (desktop): space = play/pause, arrows = skip, Esc closes the player
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input,textarea") || e.metaKey || e.ctrlKey) return;
      if (e.code === "Space" && currentId() && !e.target.closest("button,summary,a")) { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowLeft" && currentId()) seek(a.currentTime - SKIP_BACK);
      else if (e.key === "ArrowRight" && currentId()) seek(a.currentTime + SKIP_FWD);
      else if (e.key === "Escape") close();
    });

    // lock-screen / headphones
    if ("mediaSession" in navigator) {
      const ms = navigator.mediaSession, set = (k, f) => { try { ms.setActionHandler(k, f); } catch {} };
      set("play", () => a.play());
      set("pause", () => a.pause());
      set("seekbackward", (d) => seek(a.currentTime - (d.seekOffset || SKIP_BACK)));
      set("seekforward", (d) => seek(a.currentTime + (d.seekOffset || SKIP_FWD)));
      set("seekto", (d) => seek(d.seekTime));
      set("previoustrack", prev);
      set("nexttrack", next);
    }

    // restore the last session (paused) so the mini player is ready
    function restore() {
      const s = store.get("session", null);
      if (!s?.queue?.length) return Promise.resolve();
      return ensureCtx(s.ctx).catch(() => {}).then(() => { if (talk(s.queue[s.idx])) load(s.queue, s.idx, s.ctx, false); });
    }

    return { load, toggle, currentId, playing, restore, queue: () => queue, ctx: () => ctx };
  })();

  // ---- Boot --------------------------------------------------------------
  fetch("data.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((d) => {
      D = d;
      Object.assign(TALKS, d.talks);
      for (const [k, v] of Object.entries(d.speakers)) { SPK[k] = v; NAMES[k] = v.n; }
      for (const m of d.mentors) SPK[m.id].queue = m.queue;
      // A shared talk link takes priority over restoring the last session.
      const shared = /^#\/talk\//.test(location.hash);
      return (shared ? Promise.resolve() : P.restore()).then(render);
    })
    .catch((e) => { console.error(e); app.innerHTML = `<div class="page-h"><h1>Can't load talks</h1><p>Check your connection and refresh.</p></div>`; });
})();
