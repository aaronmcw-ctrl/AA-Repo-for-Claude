# Chord Along

A phone-first play-along page: a YouTube video on top, chords that follow the song (with guitar finger positions and/or piano keys), and lyrics with chords underneath.

Live at: https://aaronmcw-ctrl.github.io/AA-Repo-for-Claude/chords/

## Built-in songs

`library.json` lists songs that show up on every phone automatically (YouTube video + chords). Each song's `chordMap` holds **chords only, no lyrics**: for each sung line of one LRCLIB timed-lyrics entry, which chords are played and at which letter. The app downloads the lyrics when the song opens and lays the chords onto them.

To add chords to a library song (Claude can do this when `lrclib.net` and a chord site are allowed in the session's network settings):

1. Save the chord chart as `chart.txt` and the LRCLIB timed lyrics as `song.lrc`.
2. `node tools/make-chordmap.js chart.txt song.lrc <lrclibId>`. It prints the map and how many lines got chords.
3. Put the output in that song's `chordMap` and raise its `version`, so phones pick up the change.

## Adding a song (on the phone)

1. **+ Add song** → paste a YouTube link. The song name and artist fill in from the video, and timed lyrics are found automatically (the version closest to the video's length wins; "wrong version?" lets you pick another).
2. Chords: tap **Find chords ↗** (opens a chord-site search for that song), copy the chords + words, paste, save. Or save without chords and add them later.
3. Press play. If chords run early or late, tap **Sync** and tap **Now** when the first line is sung.

No timed lyrics for a song? Use **••• → Tap along**: play the song and tap at the start of each line.

## On the song page

- **Guitar / Piano / Both**: which diagrams to show. Piano shows right-hand finger numbers (1-3-5) and the left-hand bass note.
- **Simple chords** (on by default): turns Cmaj7, Csus2, Cadd9, D/F# into C, C, C, D; minors and 7ths stay.
- **Key** transposes; **Capo** shows guitar shapes for a capo (a "try N" button appears when a capo makes the song clearly easier).
- Tap any chord or line in the lyrics to jump the video there.
- **••• → Share song link** sends the song to someone else's phone (the chart is packed into the link; lyrics are re-fetched).

## How it works

- `theory.js`: chord parsing, simplifying, transposing, guitar shapes and piano voicings, SVG diagrams.
- `sheet.js`: reads pasted chord charts and timed lyrics (LRC), and matches each sung line to a line of the chart to time the chords.
- `app.js`: screens (song list, add/edit, song page), the YouTube player, sync and tap-along, share links.
- Songs are saved in the phone's browser storage (`localStorage`). Nothing is uploaded; the repo holds no lyrics.
- Timed lyrics come from [LRCLIB](https://lrclib.net) (free, no key). Videos play through YouTube's own embedded player.
