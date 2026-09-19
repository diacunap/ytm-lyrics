// builds public/ja-dict.bin.gz: a compact kanji-word -> hiragana reading table for on-device romaji.
//
//   bun scripts/build-dict.ts <JMdict_e> <kanjidic2.xml>
//
// two sections, both "surface\treading" lines, separated by a blank line:
//   1. words: JMdict entries whose kanji form carries a frequency tag (news/ichi/spec/gai), plus
//      every kanji form of entries that have any tagged form. ~20-30k words.
//   2. kanji: one reading per joyo kanji from KANJIDIC2, kun-reading first (okurigana stripped),
//      else on-reading in hiragana. the last-resort fallback for characters no word covers.
// sources are CC BY-SA 4.0 (EDRDG); public/ja-dict-LICENSE.txt travels with the output.

import { gzipSync } from 'node:zlib';

const [jmdictPath, kanjidicPath] = process.argv.slice(2);
if (!jmdictPath || !kanjidicPath) {
  console.error('usage: bun scripts/build-dict.ts <JMdict_e> <kanjidic2.xml>');
  process.exit(1);
}

const KANJI = /[㐀-鿿]/;
const PRIORITY = /<ke_pri>(news[12]|ichi[12]|spec[12]|gai[12])<\/ke_pri>/;

function katakanaToHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// --- words from JMdict ---
const jmdict = await Bun.file(jmdictPath).text();
const words = new Map<string, string>();
const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
let m: RegExpExecArray | null;
while ((m = entryRe.exec(jmdict)) !== null) {
  const entry = m[1];
  if (!entry.includes('<k_ele>')) continue;
  const kele = [...entry.matchAll(/<k_ele>([\s\S]*?)<\/k_ele>/g)].map(x => x[1]);
  const tagged = kele.some(k => PRIORITY.test(k));
  if (!tagged) continue;
  const readings = [...entry.matchAll(/<r_ele>([\s\S]*?)<\/r_ele>/g)].map(x => x[1]);
  for (const k of kele) {
    const surface = /<keb>(.*?)<\/keb>/.exec(k)?.[1];
    if (!surface || !KANJI.test(surface) || words.has(surface)) continue;
    // the first reading that is not restricted to another kanji form
    const reading = readings
      .filter(r => {
        const restr = [...r.matchAll(/<re_restr>(.*?)<\/re_restr>/g)].map(x => x[1]);
        return restr.length === 0 || restr.includes(surface);
      })
      .map(r => /<reb>(.*?)<\/reb>/.exec(r)?.[1])
      .find(Boolean);
    if (reading) words.set(surface, katakanaToHiragana(reading));
  }
}

// --- single kanji from KANJIDIC2 ---
const kanjidic = await Bun.file(kanjidicPath).text();
const kanji = new Map<string, string>();
const charRe = /<character>([\s\S]*?)<\/character>/g;
while ((m = charRe.exec(kanjidic)) !== null) {
  const c = m[1];
  const literal = /<literal>(.*?)<\/literal>/.exec(c)?.[1];
  if (!literal) continue;
  const grade = Number(/<grade>(\d+)<\/grade>/.exec(c)?.[1] ?? 0);
  // joyo (1-8) plus jinmeiyo (9-10): names show up in lyrics too
  if (grade === 0 || grade > 10) continue;
  const kun = /<reading r_type="ja_kun">(.*?)<\/reading>/.exec(c)?.[1];
  const on = /<reading r_type="ja_on">(.*?)<\/reading>/.exec(c)?.[1];
  const reading = kun ? kun.split('.')[0].replace(/-/g, '') : on ? katakanaToHiragana(on) : null;
  if (reading) kanji.set(literal, reading);
}

// longest surfaces first so a greedy matcher can scan in order if it wants to
const wordLines = [...words.entries()].sort((a, b) => b[0].length - a[0].length || a[0].localeCompare(b[0]));
const body = wordLines.map(([s, r]) => `${s}\t${r}`).join('\n') + '\n\n' + [...kanji.entries()].map(([s, r]) => `${s}\t${r}`).join('\n') + '\n';
const gz = gzipSync(Buffer.from(body, 'utf8'), { level: 9 });
await Bun.write(new URL('../public/ja-dict.bin.gz', import.meta.url), gz);
console.log(`words=${words.size} kanji=${kanji.size} raw=${(body.length / 1024).toFixed(0)}KiB gz=${(gz.length / 1024).toFixed(0)}KiB`);
