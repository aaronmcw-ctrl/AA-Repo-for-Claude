#!/usr/bin/env python3
"""
Builds the browsable library used by "All topics" and "All speakers":

  data/topics/<topic-id>.json      talks for one topic
  data/speakers/<speaker-id>.json  photo, bio and talks (series order) for one speaker
  data/speakers-index.json         every speaker: name, photo, talk count

  python3 scripts/collect_library.py           # uses cached API responses where present
  python3 scripts/collect_library.py --fresh   # re-download everything (~2,600 requests, ~30 min)

LINKS ONLY. No audio is downloaded. Run collect.py afterwards for data.json.
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import ROOT, api, absurl, talk_obj, series_order_key, write_json

OUT = os.path.join(ROOT, "data")
topics = api("topics")
speakers = api("speakers")
names = {s["id"]: s["name"] for s in speakers}

print(f"Topics: {len(topics)}")
for k, t in enumerate(topics, 1):
    d = api(f"topics/{t['id']}", quiet=True)
    talks, order = {}, []
    for m in d.get("messages", []):
        o = talk_obj(m)
        if o:
            talks[m["id"]] = o
            order.append(m["id"])
    write_json(os.path.join(OUT, "topics", t["id"] + ".json"),
               {"id": t["id"], "n": t["name"], "order": order, "talks": talks,
                "names": {o["sp"]: names.get(o["sp"], o["sp"]) for o in talks.values() if o.get("sp")}})
    if k % 50 == 0:
        print(f"  topics {k}/{len(topics)}")

print(f"Speakers: {len(speakers)}")
index = []
for k, s in enumerate(speakers, 1):
    d = api(f"speakers/{s['id']}", quiet=True)
    if "messages" not in d:
        continue
    talks = {}
    for m in d["messages"]:
        o = talk_obj(m, d["id"])
        if o:
            talks[m["id"]] = o
    queue = sorted(talks, key=lambda i: series_order_key(talks[i]))
    bio = re.sub(r"\s+", " ", d.get("bio") or "").replace(" .", ".").strip()
    photo = absurl(d.get("photo"))
    write_json(os.path.join(OUT, "speakers", d["id"] + ".json"),
               {"id": d["id"], "n": d["name"], "photo": photo, "bio": bio, "queue": queue, "talks": talks})
    if talks:
        index.append({"id": d["id"], "n": d["name"], "k": s.get("sortKey") or d["name"],
                      "c": len(talks), **({"p": photo} if photo else {})})
    if k % 100 == 0:
        print(f"  speakers {k}/{len(speakers)}")

index.sort(key=lambda x: x["k"].lower())
write_json(os.path.join(OUT, "speakers-index.json"), index)
print(f"Done: {len(topics)} topic files, {len(index)} speakers "
      f"({sum(1 for x in index if 'p' in x)} with photos)")
