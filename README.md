# Discipleship Audio (prototype)

A phone-first listening app built on talks from [discipleshiplibrary.com](https://discipleshiplibrary.com), used with the site owners' permission.

- **The app** is just four files: `index.html`, `styles.css`, `app.js`, `data.json`.
- **Audio is never copied.** Every talk streams from its original `https://discipleshiplibrary.com/api/media/...` link.
- **`data.json`** is made once by `scripts/collect.py`, which saves titles, speakers, topics, series, MP3 links, photos and bios.

## What's in the app

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
| Refresh data from the library | `python3 scripts/collect.py --fresh` |

Then save the change to GitHub (a "commit" plus a "push") on the `main` branch:

```
git add -A
git commit -m "Describe the change"
git push origin main
```

GitHub Pages rebuilds the live site by itself, usually within 1–2 minutes. If you still see the old version, refresh the page.

## Analytics

GoatCounter counts card taps and plays. Put your code in `GOATCOUNTER_CODE` near the top of `app.js`.

## Try it on your computer

```
python3 -m http.server 8000
```

Then open http://localhost:8000.
