# Discipleship Audio (prototype)

A phone-first listening app built on talks from [discipleshiplibrary.com](https://discipleshiplibrary.com), used with the site owners' permission.

- **The app**: `index.html`, `styles.css`, `app.js`, plus `data.json` (home screen) and `data/` (the full library, loaded one topic or speaker at a time).
- **Audio is never copied.** Every talk streams from its original `https://discipleshiplibrary.com/api/media/...` link.
- **`data.json`** is made by `scripts/collect.py`. **`data/`** is made by `scripts/collect_library.py` (about 2,600 polite requests, roughly 30–60 minutes). Both save titles, speakers, topics, series, MP3 and PDF links, photos and bios.

## What's in the app

- Home: today's 4-minute capsule, 5 featured felt-need cards and a "See all topics" card, a "Most liked" row, and a swipeable mentor row ending in "See all speakers".
- All topics and All speakers pages, with search-as-you-type (and an A–Z strip for speakers).
- One-sentence summaries on talk cards. Summaries written without a transcript are marked as drafts. Add `?review` to the link to see them: `…/AA-Repo-for-Claude/?review`.
- Likes (sample counts for now; your own like is saved on your device) and Share (the phone's share sheet, or a copied link on devices without one).
- Every talk has its own link: `#/talk/<speaker>/<talk id>`.

- 8 felt-need cards. Edit their topics and talk picks in `scripts/config.json`. `curation.md` lists the current picks.
- Big talk cards. Tap anywhere on a card to play.
- One player that stays on screen:
  - play/pause, back 15s, forward 30s, and speed from 0.75× to 2× (remembered)
  - a draggable scrubber
  - auto-play of the next talk
  - resume where you left off in each talk
  - lock-screen and headphone controls
- **Pick a mentor:** queues a mentor's talks in series order.
- **Today's 4-minute:** the LeRoy Eims Daily Discipleship capsule. The schedule matches the original site's and repeats every 3 years.

## How to update the site

All of these are things you can ask Claude to do, in plain words.

| You want to… | What happens |
|---|---|
| Change words, colors or layout | Edit `index.html`, `styles.css` or `app.js` |
| Swap the talks on a card | Put talk IDs in that card's `picks` in `scripts/config.json`, then run `python3 scripts/collect.py` |
| Change a mentor or a one-line bio | Edit `mentors` in `scripts/config.json`, then run `python3 scripts/collect.py` |
| Write or edit a talk summary | Add it under `summaries` in `scripts/config.json` (`"draft": true` if it's a guess), then run `python3 scripts/collect.py` |
| Change who's in the mentor row | Edit `mentors` in `scripts/config.json` (`"g": "f"` for women, `"m"` for men). Speakers without a photo are skipped automatically. |
| Refresh everything from the library | `python3 scripts/collect_library.py --fresh`, then `python3 scripts/collect.py --fresh` |

Then save the change to GitHub (a "commit" plus a "push") on the `main` branch:

```
git add -A
git commit -m "Describe the change"
git push origin main
```

GitHub Pages rebuilds the live site by itself, usually within 1–2 minutes. If you still see the old version, refresh the page.

## Analytics

GoatCounter counts page views, card taps, plays, likes/unlikes, shares, "See all topics", "See all speakers" and "Read more". Put your code in `GOATCOUNTER_CODE` near the top of `app.js`.

## Try it on your computer

```
python3 -m http.server 8000
```

Then open http://localhost:8000.
