#!/usr/bin/env python3
"""
One-time collector: builds data.json from discipleshiplibrary.com's public JSON API.

  python3 scripts/collect.py            # uses cached API responses if present
  python3 scripts/collect.py --fresh    # re-download everything

It stores LINKS ONLY. Audio is never downloaded; the app streams each MP3 from
its original https URL on discipleshiplibrary.com.

Inputs:  scripts/config.json  (felt-need cards -> topics, picks; mentors)
Outputs: data.json            (the only file the app reads)
         curation.md          (human-readable list of picks to review)
Python 3.8+, standard library only.
"""
import json, os, re, sys, time, urllib.request, urllib.parse
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(ROOT, "scripts", "config.json")))
BASE = CFG["base"].rstrip("/")
CACHE = os.path.join(ROOT, "scripts", ".cache")
FRESH = "--fresh" in sys.argv
UA = "DiscipleshipAudioPrototype/1.0 (one-time catalog build, owner-permitted)"
os.makedirs(CACHE, exist_ok=True)


def api(path):
    """GET BASE/api/<path> as JSON, politely, with an on-disk cache."""
    key = re.sub(r"[^a-zA-Z0-9_.-]", "_", path) + ".json"
    fp = os.path.join(CACHE, key)
    if not FRESH and os.path.exists(fp):
        return json.load(open(fp))
    url = f"{BASE}/api/{path}"
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    json.dump(data, open(fp, "w"))
    time.sleep(0.6)  # be gentle with the server
    print("  fetched", url)
    return data


def absurl(u):
    if not u:
        return None
    full = urllib.parse.urljoin(BASE + "/", u)
    if not full.startswith("https://"):
        raise SystemExit(f"Refusing non-https URL: {full}")
    return full


def mp3(files):
    for f in files or []:
        if f.get("label", "").upper() == "MP3" or f.get("url", "").lower().endswith(".mp3"):
            return absurl(f["url"])
    return None


talks, speakers = {}, {}
topic_names = {t["id"]: t["name"] for t in api("topics")}
speaker_names = {s["id"]: s["name"] for s in api("speakers")}


def add_talk(m, speaker_id=None):
    u = mp3(m.get("files"))
    if not u:
        return None
    sid = m.get("speakerId") or speaker_id
    t = talks.setdefault(m["id"], {})
    t.update({k: v for k, v in {
        "t": m["title"].strip(),
        "sp": sid,
        "tp": m.get("topics") or t.get("tp") or [],
        "se": m.get("series") or t.get("se"),
        "so": m.get("seriesOrder") or t.get("so"),
        "u": u,
    }.items() if v not in (None, "")})
    if sid and sid not in speakers:
        speakers[sid] = {"n": m.get("speaker") or speaker_names.get(sid, sid)}
    return m["id"]


# ---------- Mentors ----------
print("Mentors…")
mentors = []
mentor_ids = [m["id"] for m in CFG["mentors"]]
for cfg in CFG["mentors"]:
    d = api(f"speakers/{cfg['id']}")
    ids = [i for i in (add_talk(m, d["id"]) for m in d["messages"]) if i]
    bio = re.sub(r"\s+", " ", (d.get("bio") or "")).replace(" .", ".").strip()
    first = re.split(r"(?<=[a-z0-9)])\.\s", bio)[0].rstrip(".") + "." if bio else ""
    speakers[d["id"]] = {"n": d["name"], "photo": absurl(d.get("photo")), "bio": bio,
                         "line": cfg.get("line") or first}
    # Queue order: each series in its own order (series A-Z), then standalone talks A-Z.
    def qkey(i):
        t = talks[i]
        return (0, t["se"].lower(), t.get("so") or 9999, t["t"].lower()) if t.get("se") \
            else (1, "", 0, t["t"].lower())
    mentors.append({"id": d["id"], "queue": sorted(ids, key=qkey)})

# ---------- Felt-need cards ----------
print("Felt-need topics…")
SKIP_TOPICS = {"Spanish Bible", "Thru the Bible Radio", "King James Bible", "Five Year Bible Study Series"}
needs = []
for n in CFG["needs"]:
    cand = {}
    for tid in n["topics"]:
        d = api(f"topics/{tid}")
        for m in d["messages"]:
            i = add_talk(m)
            if i:
                cand.setdefault(i, set()).add(tid)
    if n.get("picks"):
        picks = [p for p in n["picks"] if p in talks]
    else:
        # Auto-proposal: talks tagged with several of this card's topics, by mentors,
        # one per speaker, skipping radio/foreign-language/Bible-reading series.
        def score(i):
            t = talks[i]
            s = 3 * len(cand[i])
            s += 2 if t.get("sp") in mentor_ids else 0
            s -= 1 if re.search(r"part\s*\d|- \d|\bII\b", t["t"], re.I) else 0
            return -s, t["t"]
        picks, seen_sp, seen_title = [], set(), set()
        for i in sorted(cand, key=score):
            t = talks[i]
            if SKIP_TOPICS & set(t.get("tp", [])) or t.get("sp") in seen_sp:
                continue
            key = t["t"].lower()
            if key in seen_title:
                continue
            picks.append(i); seen_sp.add(t.get("sp")); seen_title.add(key)
            if len(picks) == 8:
                break
    needs.append({"id": n["id"], "title": n["title"], "blurb": n["blurb"],
                  "topics": [topic_names.get(t, t) for t in n["topics"]], "talks": picks,
                  "_cand": sorted(cand, key=lambda i: -len(cand[i]))})

# ---------- Daily Discipleship (LeRoy Eims) ----------
print("Daily Discipleship…")
eps = {}
for m in api("daily")["messages"]:
    num = re.match(r"DD0*(\d+)$", m["id"])
    u = mp3(m.get("files"))
    if num and u:
        title = re.sub(r"^Daily Discipleship:\s*", "", m["title"]).strip()
        eps[num.group(1)] = {"t": title, "se": re.sub(r"\s*-\s*\d+\s*/.*$|\s*-\s*\d+$", "", m.get("series") or ""), "u": u}

# ---------- Keep only talks the app actually uses ----------
used = {i for n in needs for i in n["talks"]} | {i for m in mentors for i in m["queue"]}
out = {
    "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    "source": BASE,
    "needs": [{k: v for k, v in n.items() if k != "_cand"} for n in needs],
    "mentors": mentors,
    "speakers": {k: v for k, v in speakers.items()
                 if k in mentor_ids or any(talks[i].get("sp") == k for i in used)},
    "talks": {i: talks[i] for i in sorted(used)},
    "daily": {"epoch": CFG["dailyEpoch"], "speaker": "leroy-eims", "eps": eps},
}
with open(os.path.join(ROOT, "data.json"), "w") as f:
    json.dump(out, f, separators=(",", ":"), ensure_ascii=False)

# ---------- curation.md for human review ----------
L = ["# Felt-need cards: proposed talks", "",
     f"_Generated {out['generated']} by `scripts/collect.py`. To change a card, put talk IDs in "
     "`picks` in `scripts/config.json` and re-run._", ""]
for n in needs:
    L += [f"## {n['title']}", f"Topics: {', '.join(n['topics'])}", ""]
    for k, i in enumerate(n["talks"], 1):
        t = talks[i]
        L.append(f"{k}. **{t['t']}** — {speakers.get(t.get('sp'), {}).get('n', '?')}  ")
        L.append(f"   ID `{i}` · {', '.join(t.get('tp', []))} · [listen]({t['u']})")
    L += [""]
L += ["# Mentors", ""]
for m in mentors:
    s = speakers[m["id"]]
    L.append(f"- **{s['n']}** ({len(m['queue'])} talks) — {s['line'] or '_no bio on site_'}"
             + ("" if s.get("photo") else " · _no photo on site_"))
open(os.path.join(ROOT, "curation.md"), "w").write("\n".join(L) + "\n")

json.dump({n["id"]: n["_cand"] for n in needs}, open(os.path.join(CACHE, "_candidates.json"), "w"))
size = os.path.getsize(os.path.join(ROOT, "data.json"))
print(f"Done: {len(out['talks'])} talks, {len(eps)} daily capsules, "
      f"{len(mentors)} mentors -> data.json ({size // 1024} KB)")
