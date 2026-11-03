// Turn a chord chart + timed lyrics into a lyric-free chord map for library.json.
// Usage: node tools/make-chordmap.js chart.txt lyrics.lrc <lrclibId>
// Prints the chordMap JSON and how many sung lines got chords.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ctx = { window: {}, console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['theory.js', 'sheet.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx);
const [chartFile, lrcFile, id] = process.argv.slice(2);
const song = { sheet: fs.readFileSync(chartFile, 'utf8'), lrc: fs.readFileSync(lrcFile, 'utf8') };
const map = ctx.Sheet.mapFromSheet(song);
map.lrclibId = +id;
const sung = ctx.Sheet.parseLrc(song.lrc).filter((l) => l.text).length;
console.error(`chords on ${Object.keys(map.lines).length} of ${sung} sung lines`);
console.log(JSON.stringify(map));
