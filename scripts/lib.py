"""Shared helpers for the collector scripts (standard library only)."""
import hashlib, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(ROOT, "scripts", "config.json")))
BASE = CFG["base"].rstrip("/")
CACHE = os.path.join(ROOT, "scripts", ".cache")
FRESH = "--fresh" in sys.argv
UA = "DiscipleshipAudioPrototype/1.0 (one-time catalog build, owner-permitted)"
os.makedirs(CACHE, exist_ok=True)


def api(path, quiet=False):
    """GET BASE/api/<path> as JSON, politely, with an on-disk cache."""
    key = re.sub(r"[^a-zA-Z0-9_.-]", "_", path) + ".json"
    fp = os.path.join(CACHE, key)
    if not FRESH and os.path.exists(fp):
        return json.load(open(fp))
    url = f"{BASE}/api/{urllib.parse.quote(path, safe='/?=&')}"
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                data = {"error": "not found"}
                break
            time.sleep(2 ** attempt * 2)
        except Exception:
            time.sleep(2 ** attempt * 2)
    else:
        raise SystemExit(f"Failed to fetch {url}")
    json.dump(data, open(fp, "w"))
    time.sleep(0.6)  # be gentle with the server
    if not quiet:
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


def pdf(files):
    for f in files or []:
        if f.get("label", "").upper() == "PDF" or f.get("url", "").lower().endswith(".pdf"):
            return absurl(f["url"])
    return None


def _r(s):
    return int(hashlib.md5(str(s).encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


FEATURED = {i for n in CFG["needs"] for i in n.get("picks", [])}
MENTORS = {m["id"] for m in CFG["mentors"]}


def sample_likes(tid, sp):
    """SAMPLE like counts (not real data). Varied and stable per talk."""
    r = _r(tid)
    if tid in FEATURED:
        return 24 + int(470 * r ** 1.6)
    if sp in MENTORS:
        return int(140 * r ** 3)
    return int(36 * r ** 4)


def talk_obj(m, speaker_id=None, speaker_name=None):
    """Compact talk record used everywhere in the app."""
    u = mp3(m.get("files"))
    if not u:
        return None
    sid = m.get("speakerId") or speaker_id
    o = {"t": m["title"].strip(), "sp": sid, "tp": m.get("topics") or [], "u": u,
         "lk": sample_likes(m["id"], sid)}
    if m.get("series"):
        o["se"] = m["series"]
    if m.get("seriesOrder"):
        o["so"] = m["seriesOrder"]
    p = pdf(m.get("files"))
    if p:
        o["pdf"] = p
    return o


def series_order_key(t):
    """Series A-Z in their own order, then standalone talks A-Z, music last."""
    music = 1 if "Music" in t.get("tp", []) else 0
    if t.get("se"):
        return (music, 0, t["se"].lower(), t.get("so") or 9999, t["t"].lower())
    return (music, 1, "", 0, t["t"].lower())


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)
