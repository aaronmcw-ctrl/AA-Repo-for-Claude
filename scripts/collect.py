#!/usr/bin/env python3
"""
One-time collector: builds data.json from discipleshiplibrary.com's public JSON API.

  python3 scripts/collect.py            # uses cached API responses if present
  python3 scripts/collect.py --fresh    # re-download everything

It stores LINKS ONLY. Audio is never downloaded; the app streams each MP3 from
its original https URL on discipleshiplibrary.com.

Inputs:  scripts/config.json  (felt-need cards, mentors, summaries)
Outputs: data.json            (what the home screen needs; small)
         curation.md          (human-readable review list)
The full browsable library (all topics / all speakers) is built by collect_library.py.
"""
import json, os, re, sys
from datetime import datetime, timezone
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import ROOT, CFG, BASE, api, absurl, mp3, talk_obj, series_order_key, write_json

talks, speakers = {}, {}
topic_list = api("topics")
topic_names = {t["id"]: t["name"] for t in topic_list}
speaker_names = {s["id"]: s["name"] for s in api("speakers")}


def add_talk(m, speaker_id=None):
    o = talk_obj(m, speaker_id)
    if not o:
        return None
    prev = talks.get(m["id"], {})
    for k in ("se", "so"):  # topic feeds lack series info; keep it from speaker feeds
        if k in prev and k not in o:
            o[k] = prev[k]
    talks[m["id"]] = o
    sid = o["sp"]
    if sid and sid not in speakers:
        speakers[sid] = {"n": m.get("speaker") or speaker_names.get(sid, sid)}
    return m["id"]


# ---------- Mentors ----------
print("Mentors…")
mentors = []
for cfg in CFG["mentors"]:
    d = api(f"speakers/{cfg['id']}")
    ids = [i for i in (add_talk(m, d["id"]) for m in d["messages"]) if i]
    bio = re.sub(r"\s+", " ", (d.get("bio") or "")).replace(" .", ".").strip()
    speakers[d["id"]] = {"n": d["name"], "photo": absurl(d.get("photo")), "bio": bio,
                         "line": cfg.get("line", ""), "about": cfg.get("about", ""),
                         **({"aboutDraft": True} if cfg.get("aboutDraft") else {})}
    mentors.append({"id": d["id"], "g": cfg.get("g", "m"),
                    "queue": sorted(ids, key=lambda i: series_order_key(talks[i]))})

# Featured row: drop anyone without a photo, then alternate men/women
# (men and women each keep their config order; extra men go at the end).
with_photo = [m for m in mentors if speakers[m["id"]].get("photo")]
men = [m["id"] for m in with_photo if m["g"] != "f"]
women = [m["id"] for m in with_photo if m["g"] == "f"]
row = []
while men or women:
    if men: row.append(men.pop(0))
    if women: row.append(women.pop(0))
dropped = [m["id"] for m in mentors if not speakers[m["id"]].get("photo")]
if dropped:
    print("  (no photo, left out of featured row:", ", ".join(dropped) + ")")

# ---------- Felt-need cards ----------
print("Felt-need topics…")
needs = []
for n in CFG["needs"]:
    for tid in n["topics"]:
        for m in api(f"topics/{tid}")["messages"]:
            add_talk(m)
    picks = [p for p in n.get("picks", []) if p in talks]
    needs.append({"id": n["id"], "title": n["title"], "blurb": n["blurb"], "featured": bool(n.get("featured")),
                  "topics": [{"id": t, "n": topic_names.get(t, t)} for t in n["topics"]], "talks": picks})

# ---------- Summaries ----------
for tid, s in CFG.get("summaries", {}).items():
    if tid in talks:
        talks[tid]["sm"] = s["s"]
        if s.get("draft"):
            talks[tid]["smd"] = 1

# ---------- Daily Discipleship (LeRoy Eims) ----------
print("Daily Discipleship…")
eps = {}
for m in api("daily")["messages"]:
    num = re.match(r"DD0*(\d+)$", m["id"])
    u = mp3(m.get("files"))
    if num and u:
        title = re.sub(r"^Daily Discipleship:\s*", "", m["title"]).strip()
        eps[num.group(1)] = {"t": title, "se": re.sub(r"\s*-\s*\d+\s*/.*$|\s*-\s*\d+$", "", m.get("series") or ""), "u": u}

# ---------- Keep only talks the app uses on load ----------
used = {i for n in needs for i in n["talks"]} | {i for m in mentors for i in m["queue"]}
out = {
    "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    "source": BASE,
    "needs": needs,
    "mentors": mentors,
    "featuredMentors": row[: CFG.get("featuredRow", 6)],
    "topics": sorted(({"id": t["id"], "n": t["name"], "c": t["count"]} for t in topic_list), key=lambda x: x["n"].lower()),
    "speakers": {k: v for k, v in speakers.items()
                 if k in {m["id"] for m in mentors} or any(talks[i].get("sp") == k for i in used)},
    "talks": {i: talks[i] for i in sorted(used)},
    "daily": {"epoch": CFG["dailyEpoch"], "speaker": "leroy-eims", "eps": eps},
}
write_json(os.path.join(ROOT, "data.json"), out)

# ---------- curation.md for human review ----------
L = ["# Content review", "",
     f"_Generated {out['generated']} by `scripts/collect.py`. Edit `scripts/config.json`, then re-run._", "",
     "**DRAFT** = written by Claude from the title and topics only (no transcript). Please edit.", ""]
L += ["## Featured mentor row (in order)", ""]
for k, i in enumerate(out["featuredMentors"], 1):
    s = speakers[i]
    L.append(f"{k}. **{s['n']}** — {s['line']}")
L += [""]
for m in mentors:
    s = speakers[m["id"]]
    L += [f"### {s['n']}{'  ·  **DRAFT**' if s.get('aboutDraft') else ''}", s["about"] or "_(no paragraph)_", ""]
for n in needs:
    L += [f"## {n['title']}{'' if n['featured'] else '  (on All topics page)'}",
          "Topics: " + ", ".join(t["n"] for t in n["topics"]), ""]
    for k, i in enumerate(n["talks"], 1):
        t = talks[i]
        L.append(f"{k}. **{t['t']}** — {speakers.get(t.get('sp'), {}).get('n', '?')}  ")
        if t.get("sm"):
            L.append(f"   {'**DRAFT** ' if t.get('smd') else ''}_{t['sm']}_  ")
        L.append(f"   ID `{i}` · {t['lk']} sample likes · [listen]({t['u']})" + (f" · [PDF]({t['pdf']})" if t.get("pdf") else ""))
    L += [""]
open(os.path.join(ROOT, "curation.md"), "w").write("\n".join(L) + "\n")

size = os.path.getsize(os.path.join(ROOT, "data.json"))
print(f"Done: {len(out['talks'])} talks, {len(eps)} daily capsules, {len(mentors)} mentors, "
      f"featured row: {', '.join(out['featuredMentors'])} -> data.json ({size // 1024} KB)")
