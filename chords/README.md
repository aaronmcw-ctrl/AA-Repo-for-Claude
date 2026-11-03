# Chord Along

A phone-first play-along page: a YouTube video on top, chords that follow the song (with guitar finger positions and/or piano keys), and lyrics with chords underneath.

Live at: https://aaronmcw-ctrl.github.io/AA-Repo-for-Claude/chords/

## Adding a song (on the phone)

1. **+ Add song** → paste the YouTube link (Share → Copy link). Lyric videos and "official audio" usually line up best.
2. Type the song and artist.
3. Paste a chord chart: chords on one line, lyrics on the next (the usual chord-site format). `[Verse]`, `[Chorus]` labels are understood, and an empty `[Chorus]` repeats the earlier chorus. ChordPro (`[G]words`) works too.
4. **Find timed lyrics** and pick the version whose length matches the video. The page then says how many lines it lined chords up on.
5. Save and press play. If the chords run early or late, tap **Sync** and tap **Now** when the first line is sung (or nudge by ¼ s).

No timed lyrics for a song? Save it anyway and use **••• → Tap along**: play the song and tap at the start of each line.

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
