/* Discipleship Audio — prototype
 * Plain JS. Reads only data.json. Audio streams from the original https URLs.
 */
(() => {
  "use strict";

  // ---- Settings ----------------------------------------------------------
  // Put your GoatCounter code here (the "yourname" in yourname.goatcounter.com).
  const GOATCOUNTER_CODE = "";
  const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
  const SKIP_BACK = 15, SKIP_FWD = 30;

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

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
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
  let D; // data.json
  const talk = (id) => {
    if (String(id).startsWith("dd-")) {
      const n = id.slice(3), e = D.daily.eps[n];
      return e && { id, t: e.t, sp: D.daily.speaker, tp: ["Daily Discipleship"], se: e.se, u: e.u, daily: true };
    }
    const t = D.talks[id];
    return t && { id, ...t };
  };
  const speaker = (id) => D.speakers[id] || { n: "Unknown speaker" };

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
  const NEED_BG = ["#3b0f0b", "#2f0c18", "#3a1806", "#2b0a10", "#311106", "#360d14", "#2d1209", "#3b0d0d"];
  const MOTIF = {
    alone: () => {
      let s = "";
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) s += `<circle cx="${30 + c * 36}" cy="${24 + r * 36}" r="9" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="2"/>`;
      return s + `<circle cx="174" cy="24" r="14" fill="#ff5a47"/>`;
    },
    doubt: () => `<text x="118" y="190" font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="240" fill="#ff5a47" opacity=".95">?</text><text x="40" y="110" font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="110" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="2">?</text>`,
    anxious: () => [0, 1, 2, 3, 4, 5].map((i) => `<path d="M-10 ${30 + i * 22} q 25 -${10 + i * 3} 50 0 t 50 0 t 50 0 t 50 0 t 50 0" fill="none" stroke="${i === 2 ? "#ff5a47" : "rgba(255,255,255,.16)"}" stroke-width="${i === 2 ? 5 : 2}" stroke-linecap="round"/>`).join(""),
    temptation: () => `<path d="M100 8 C 150 60 170 90 150 140 C 140 165 120 175 100 176 C 70 176 46 154 48 122 C 50 96 70 86 74 62 C 92 84 90 100 102 108 C 112 80 104 44 100 8 Z" fill="#ff5a47"/><path d="M100 70 C 125 100 130 120 118 145 C 110 160 90 160 82 146" fill="none" stroke="rgba(27,7,5,.5)" stroke-width="4" stroke-linecap="round"/>`,
    purpose: () => [80, 60, 40, 20].map((r, i) => `<circle cx="140" cy="62" r="${r}" fill="${i === 3 ? "#ff5a47" : "none"}" stroke="${i === 3 ? "none" : "rgba(255,255,255,.18)"}" stroke-width="2"/>`).join("") + `<path d="M20 170 L138 64" stroke="#ff5a47" stroke-width="5" stroke-linecap="round"/><path d="M120 62 L140 62 L140 82" fill="none" stroke="#ff5a47" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
    relationships: () => `<circle cx="78" cy="78" r="58" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="3"/><circle cx="130" cy="78" r="58" fill="#ff5a47" style="mix-blend-mode:screen"/>`,
    busy: () => `<circle cx="140" cy="62" r="66" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="14"/><path d="M140 -4 A66 66 0 1 1 74 62" fill="none" stroke="#ff5a47" stroke-width="14" stroke-linecap="round"/><path d="M140 62 L140 24 M140 62 L168 76" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`,
    leader: () => [0, 1, 2, 3].map((i) => `<path d="M40 ${150 - i * 36} L110 ${100 - i * 36} L180 ${150 - i * 36}" fill="none" stroke="${i === 3 ? "#ff5a47" : "rgba(255,255,255," + (0.1 + i * 0.05) + ")"}" stroke-width="${i === 3 ? 10 : 6}" stroke-linecap="round" stroke-linejoin="round"/>`).join(""),
  };
  function needArt(id, i) {
    const bg = NEED_BG[i % NEED_BG.length];
    return `<svg class="art" viewBox="0 0 200 224" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id="g${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#0d0b0c"/></linearGradient>
      <linearGradient id="f${i}" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="#0b0b0e" stop-opacity="0"/><stop offset="1" stop-color="#0b0b0e" stop-opacity=".85"/></linearGradient></defs>
      <rect width="200" height="224" fill="url(#g${i})"/>${(MOTIF[id] || MOTIF.alone)()}<rect width="200" height="224" fill="url(#f${i})"/></svg>`;
  }
  const TILE_BG = ["#2a1412", "#261320", "#2b1d10", "#2a1018", "#231715"];
  function speakerArt(spId) {
    const s = speaker(spId);
    if (s.photo) return `<div class="photo" style="width:100%;height:100%"><img src="${esc(s.photo)}" alt="" loading="lazy" decoding="async"></div>`;
    const bg = TILE_BG[hash(spId) % TILE_BG.length];
    return `<div class="tile" style="background:radial-gradient(120% 120% at 20% 10%, ${bg}, #141418)">${esc(initials(s.n))}</div>`;
  }
  function mentorArt(spId) {
    const s = speaker(spId);
    if (s.photo) return `<div class="photo" style="width:100%;height:100%"><img src="${esc(s.photo)}" alt="Photo of ${esc(s.n)}" loading="lazy" decoding="async"></div>`;
    return `<div class="monogram" role="img" aria-label="${esc(s.n)}">${esc(initials(s.n))}</div>`;
  }

  // ---- Icons -------------------------------------------------------------
  const I = {
    play: (s = 28) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>`,
    pause: (s = 28) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.3" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.3" fill="currentColor"/></svg>`,
    back: `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    chev: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    check: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    eq: `<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>`,
  };

  // ---- Talk card ---------------------------------------------------------
  function talkCard(id, ctx, idx) {
    const t = talk(id); if (!t) return "";
    const s = speaker(t.sp), p = prog[id], cur = P.currentId() === id;
    const pct = p && p[1] ? Math.min(100, (p[0] / p[1]) * 100) : 0;
    const topic = (t.tp || []).find((x) => !/^(Passage Studies|Basics of the Christian Life)$/.test(x)) || t.tp?.[0] || "";
    const state = cur ? I.eq : p?.[2] ? I.check : I.play(22);
    return `<button class="talk${cur ? " is-current" : ""}${cur && P.playing() ? " is-playing" : ""}${p?.[2] ? " is-done" : ""}" data-play="${esc(id)}" data-ctx="${esc(ctx)}" data-idx="${idx}"
        aria-label="Play ${esc(t.t)} by ${esc(s.n)}">
      <span class="talk__art">${speakerArt(t.sp)}</span>
      <span><span class="talk__t">${esc(t.t)}</span><span class="talk__s">${esc(s.n)}</span>${topic ? `<span class="talk__tp">${esc(topic)}</span>` : ""}${timeNote(p)}</span>
      <span class="talk__state">${state}</span>
      ${pct > 0 && !p?.[2] ? `<span class="talk__prog" style="width:${pct.toFixed(1)}%"></span>` : ""}
    </button>`;
  }

  // "23 min left" / "41 min" once we've seen a talk's length
  function timeNote(p) {
    if (!p || !p[1]) return "";
    const mins = (s) => Math.max(1, Math.round(s / 60));
    const txt = p[2] ? `${mins(p[1])} min · played` : p[0] > 5 ? `${mins(p[1] - p[0])} min left` : `${mins(p[1])} min`;
    return `<span class="talk__time">${txt}</span>`;
  }

  // Queue contexts: "need:<id>", "mentor:<id>", "daily"
  function ctxQueue(ctx) {
    const [k, v] = ctx.split(":");
    if (k === "need") return D.needs.find((n) => n.id === v)?.talks || [];
    if (k === "mentor") return D.mentors.find((m) => m.id === v)?.queue || [];
    if (k === "daily") return [todayEpisode()].filter(Boolean);
    return [];
  }
  function ctxLabel(ctx) {
    const [k, v] = ctx.split(":");
    if (k === "need") return D.needs.find((n) => n.id === v)?.title || "";
    if (k === "mentor") return "Mentor · " + speaker(v).n;
    if (k === "daily") return "Today's 4-minute";
    return "Now playing";
  }

  // ---- Views -------------------------------------------------------------
  const app = $("#app");
  let lastDepth = 0;
  function render() {
    const h = location.hash.replace(/^#\/?/, "");
    const [route, arg] = h.split("/");
    const depth = route ? (route === "mentor" ? 2 : 1) : 0;
    const back = depth < lastDepth; lastDepth = depth;
    let html;
    if (route === "need") html = viewNeed(arg);
    else if (route === "mentors") html = viewMentors();
    else if (route === "mentor") html = viewMentor(arg);
    else html = viewHome();
    app.innerHTML = `<div class="view${back ? " is-back" : ""}">${html}</div>`;
    if (!back) window.scrollTo(0, 0);
    track("/" + (h || ""), document.title);
  }
  window.addEventListener("hashchange", render);

  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? "Up late?" : h < 12 ? "Good morning." : h < 17 ? "Good afternoon." : "Good evening.";
  }

  function viewHome() {
    const dd = todayEpisode(), t = dd && talk(dd);
    const playingToday = P.currentId() === dd && P.playing();
    const bars = Array.from({ length: 9 }, (_, i) => `<rect x="${i * 14}" y="${40 - [16, 30, 22, 40, 26, 34, 18, 28, 12][i]}" width="7" height="${[16, 30, 22, 40, 26, 34, 18, 28, 12][i] * 2}" rx="3.5" fill="currentColor" style="animation-delay:${-i * 0.13}s"/>`).join("");
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
        ${D.needs.map((n, i) => `<button class="need rise" style="animation-delay:${0.1 + i * 0.04}s" data-go="#/need/${n.id}" data-track="need/${n.id}">
          ${needArt(n.id, i)}<span class="need__n">${String(i + 1).padStart(2, "0")}</span>
          <span class="need__t">${esc(n.title)}</span><span class="need__c">${n.talks.length} talks</span></button>`).join("")}
      </div>
      <div class="section-h"><h2>Pick a mentor</h2><a href="#/mentors" data-track-link="mentors/all">See all</a></div>
      <div class="rail">${D.mentors.map(mentorCard).join("")}</div>
      <p class="foot">Talks stream from <a href="${esc(D.source)}" target="_blank" rel="noopener">discipleshiplibrary.com</a>. Prototype · data ${esc(D.generated)}.</p>`;
  }

  function mentorCard(m) {
    const s = speaker(m.id);
    return `<button class="mentor" data-go="#/mentor/${m.id}" data-track="mentor/${m.id}" aria-label="${esc(s.n)}: ${esc(s.line)}">
      <span class="photo" style="display:block;aspect-ratio:3/4;border-radius:var(--r-md)">${s.photo ? `<img src="${esc(s.photo)}" alt="" loading="lazy" decoding="async">` : `<span class="monogram">${esc(initials(s.n))}</span>`}<span class="mentor__count">${m.queue.length} talks</span></span>
      <span class="mentor__name">${esc(s.n)}</span><span class="mentor__line">${esc(s.line || "")}</span></button>`;
  }

  function viewNeed(id) {
    const i = D.needs.findIndex((n) => n.id === id), n = D.needs[i];
    if (!n) return viewHome();
    const ctx = "need:" + id;
    return `
      <div class="backbar"><button class="icon-btn glass" data-back aria-label="Back">${I.back}</button></div>
      <div class="hero rise">${needArt(n.id, i)}<h1 class="hero__t">${esc(n.title)}</h1></div>
      <div class="page-intro"><p>${esc(n.blurb)}</p><div class="chips">${n.topics.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div></div>
      <div class="actions"><button class="btn-primary" data-playall="${ctx}">${I.play(22)} Play all</button><span class="muted">${n.talks.length} talks</span></div>
      <div class="talks">${n.talks.map((t, k) => talkCard(t, ctx, k)).join("")}</div>`;
  }

  function viewMentors() {
    return `
      <div class="backbar"><button class="icon-btn glass" data-back aria-label="Back">${I.back}</button></div>
      <header class="page-h rise"><h1>Pick a mentor</h1><p>Choose a voice. We'll line up their talks, series by series.</p></header>
      <div class="mentors">${D.mentors.map(mentorCard).join("")}</div>`;
  }

  function viewMentor(id) {
    const m = D.mentors.find((x) => x.id === id);
    if (!m) return viewMentors();
    const s = speaker(id), ctx = "mentor:" + id;
    // group the queue by series (queue is already in series order)
    const groups = [];
    m.queue.forEach((tid, k) => {
      const se = talk(tid)?.se || "More talks";
      if (!groups.length || groups[groups.length - 1].name !== se) groups.push({ name: se, items: [] });
      groups[groups.length - 1].items.push([tid, k]);
    });
    const resume = store.get("ctxIdx", {})[ctx];
    const resumeT = resume != null && talk(m.queue[resume]);
    const nSeries = groups.filter((g) => g.name !== "More talks").length;
    return `
      <div class="backbar"><button class="icon-btn glass" data-back aria-label="Back">${I.back}</button></div>
      <div class="mhero">${mentorArt(id)}<div class="mhero__txt"><h1>${esc(s.n)}</h1></div></div>
      <p class="mhero__line">${esc(s.line || "")}</p>
      <p class="mhero__stats">${m.queue.length.toLocaleString()} talks${nSeries ? ` · ${nSeries} series` : ""}</p>
      <div class="actions"><button class="btn-primary" data-playall="${ctx}" data-start="${resume ?? 0}">${I.play(22)} ${resumeT ? `Continue <small>${esc(resumeT.t)}</small>` : "Start listening"}</button></div>
      <div class="groups">${groups.map((g, gi) => `<details class="series"${gi === 0 ? " open" : ""} data-group="${gi}">
          <summary><b>${esc(g.name)}</b><span>${g.items.length}</span>${I.chev}</summary>
          <div class="talks" data-ctx="${ctx}">${gi === 0 ? g.items.map(([t, k]) => talkCard(t, ctx, k)).join("") : ""}</div></details>`).join("")}</div>`;
    // later groups render lazily when opened (see 'toggle' handler)
  }

  // lazy-render series groups on open
  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.open || !d.classList.contains("series")) return;
    const box = d.querySelector(".talks");
    if (box.childElementCount) return;
    const id = location.hash.split("/")[2], m = D.mentors.find((x) => x.id === id), ctx = "mentor:" + id;
    const gi = +d.dataset.group; let g = -1, last = null; const out = [];
    m.queue.forEach((tid, k) => { const se = talk(tid)?.se || "More talks"; if (se !== last) { g++; last = se; } if (g === gi) out.push(talkCard(tid, ctx, k)); });
    box.innerHTML = out.join("");
  }, true);

  // ---- Global taps -------------------------------------------------------
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-play],[data-go],[data-back],[data-playall],[data-track-link],[data-jump]");
    if (!el) return;
    if (el.dataset.trackLink) track("tap/" + el.dataset.trackLink);
    if (el.dataset.go) { track("tap/" + el.dataset.track); location.hash = el.dataset.go; return; }
    if (el.hasAttribute("data-back")) { history.length > 1 ? history.back() : (location.hash = "#/"); return; }
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
      sheet: $("#sheet"), art: $("#sheetArt"), title: $("#sheetTitle"), sub: $("#sheetSub"), ctx: $("#sheetCtx"),
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
      const resumeAt = p && !p[2] && p[0] > 5 ? p[0] - 2 : 0;
      a.dataset.resume = resumeAt;
      const ci = store.get("ctxIdx", {}); ci[ctx] = idx; store.set("ctxIdx", ci);
      store.set("session", { queue, idx, ctx });
      paint(); paintMeta(t);
      if (autoplay) {
        const pr = a.play();
        pr?.catch?.(() => {});
      }
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
      el.miniArt.innerHTML = speakerArt(t.sp);
      el.miniTitle.textContent = t.t;
      el.miniSub.textContent = s.n;
      el.art.innerHTML = s.photo ? mentorArt(t.sp) : `<div class="tile" style="background:radial-gradient(120% 120% at 20% 10%, #5a1a12, #141418)">${esc(initials(s.n))}</div>`;
      el.title.textContent = t.t;
      el.sub.textContent = [s.n, t.se || (t.tp || [])[0]].filter(Boolean).join(" · ");
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
        return `<li><button data-jump="${idx + 1 + k}"><span class="talk__art">${speakerArt(t.sp)}</span><span><b>${esc(t.t)}</b><span>${esc(speaker(t.sp).n)}</span></span></button></li>`;
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
      // refresh cards on screen
      document.querySelectorAll(".talk[data-play]").forEach((c) => {
        const cur = c.dataset.play === currentId();
        c.classList.toggle("is-current", cur);
        c.classList.toggle("is-playing", cur && on);
        const st = c.querySelector(".talk__state");
        if (cur) st.innerHTML = I.eq;
        else if (st.querySelector(".eq")) st.innerHTML = prog[c.dataset.play]?.[2] ? I.check : I.play(22);
      });
      const tb = $("#todayBtn");
      if (tb) { const cur = tb.dataset.play === currentId() && on; tb.classList.toggle("is-playing", cur); tb.querySelector(".today__btn").innerHTML = cur ? I.pause(30) : I.play(30); }
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
    a.addEventListener("error", () => { paint(); toast("Couldn't load this talk. Check your connection."); });
    a.addEventListener("ratechange", () => { el.speed.textContent = a.playbackRate + "×"; });
    window.addEventListener("pagehide", () => { persistPos(); flushProg(); });
    // keyboard (desktop): space = play/pause, arrows = skip
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input,textarea") || e.metaKey || e.ctrlKey) return;
      if (e.code === "Space" && currentId() && !e.target.closest("button,summary")) { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowLeft" && currentId()) seek(a.currentTime - SKIP_BACK);
      else if (e.key === "ArrowRight" && currentId()) seek(a.currentTime + SKIP_FWD);
      else if (e.key === "Escape") close();
    });
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
    // swipe down to close
    let y0 = null;
    el.sheet.addEventListener("touchstart", (e) => { y0 = el.sheet.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
    el.sheet.addEventListener("touchend", (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 110) close(); y0 = null; });

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
      if (!s?.queue?.length) return;
      const t = talk(s.queue[s.idx]);
      if (!t) return;
      load(s.queue, s.idx, s.ctx, false);
    }

    return { load, toggle, currentId, playing, restore, queue: () => queue, ctx: () => ctx };
  })();

  // ---- Boot --------------------------------------------------------------
  fetch("data.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((d) => { D = d; P.restore(); render(); })
    .catch(() => { app.innerHTML = `<div class="page-h"><h1>Can't load talks</h1><p>Check your connection and refresh.</p></div>`; });
})();
