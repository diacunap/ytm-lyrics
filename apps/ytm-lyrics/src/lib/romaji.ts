// on-device japanese romanization: kana by table, kanji by a compact word dictionary with an
// okurigana-aware fallback, and a per-character last resort. nothing leaves the device.

export interface JaDict {
  words: Map<string, string>;
  // leading-kanji run -> candidate (okurigana, readingStem) pairs, for inflected forms
  stems: Map<string, Array<{ okurigana: string; stem: string }>>;
  kanji: Map<string, string>;
}

const KANJI = /[㐀-鿿々]/;
const KANA = /[぀-ヿ]/;
export const HAS_JAPANESE = /[぀-ヿ㐀-鿿]/;

export function parseDict(text: string): JaDict {
  const [wordPart, kanjiPart] = text.split('\n\n');
  const words = new Map<string, string>();
  const stems = new Map<string, Array<{ okurigana: string; stem: string }>>();
  for (const line of wordPart.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const surface = line.slice(0, tab);
    const reading = line.slice(tab + 1);
    words.set(surface, reading);
    const run = leadingKanji(surface);
    const okurigana = surface.slice(run.length);
    if (run && okurigana && !KANJI.test(okurigana) && reading.endsWith(okurigana)) {
      const list = stems.get(run) ?? [];
      list.push({ okurigana, stem: reading.slice(0, reading.length - okurigana.length) });
      stems.set(run, list);
    }
  }
  const kanji = new Map<string, string>();
  for (const line of (kanjiPart ?? '').split('\n')) {
    const tab = line.indexOf('\t');
    if (tab > 0) kanji.set(line.slice(0, tab), line.slice(tab + 1));
  }
  return { words, stems, kanji };
}

function leadingKanji(s: string): string {
  let i = 0;
  while (i < s.length && KANJI.test(s[i])) i++;
  return s.slice(0, i);
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// reading of one segment (as the platform word segmenter cut it), kana kept as is
export function readSegment(seg: string, dict: JaDict): string {
  if (!KANJI.test(seg)) return seg;
  let out = '';
  let rest = seg;
  while (rest.length > 0) {
    if (!KANJI.test(rest[0])) {
      out += rest[0];
      rest = rest.slice(1);
      continue;
    }
    const run = leadingKanji(rest);
    const tail = rest.slice(run.length);
    // 1. the dictionary has run + some of the tail verbatim (抱える, 言葉)
    const whole = wholeWord(run, tail, dict);
    if (whole) {
      out += whole.reading;
      rest = rest.slice(run.length + whole.consumed);
      continue;
    }
    // 2. an inflected form: the tail continues some okurigana the dictionary knows (抱え ← 抱える)
    const stem = inflected(run, tail, dict);
    if (stem !== null) {
      out += stem;
      rest = rest.slice(run.length);
      continue;
    }
    // 3. the longest kanji prefix that is a word on its own (感情 in 感情的)
    let len = run.length;
    while (len > 0 && !dict.words.has(run.slice(0, len))) len--;
    if (len > 0) {
      out += dict.words.get(run.slice(0, len))!;
      rest = rest.slice(len);
      continue;
    }
    // 4. last resort: one character, its most common reading, or the kanji itself
    out += dict.kanji.get(rest[0]) ?? rest[0];
    rest = rest.slice(1);
  }
  return out;
}

// godan te/ta forms swap the final okurigana: 笑う → 笑って, 読む → 読んで, 書く → 書いて
const GODAN: Record<string, string> = { っ: 'うつる', ん: 'むぶぬ', い: 'くぐ', し: 'す' };

function inflected(run: string, tail: string, dict: JaDict): string | null {
  const candidates = dict.stems.get(run);
  if (!candidates || tail.length === 0) return null;
  let best: { stem: string; score: number } | null = null;
  for (const c of candidates) {
    let score = commonPrefix(c.okurigana, tail) * 2;
    if (score === 0 && c.okurigana.length === 1 && GODAN[tail[0]]?.includes(c.okurigana)) score = 1;
    if (score === 0) continue;
    if (!best || score > best.score) best = { stem: c.stem, score };
  }
  return best?.stem ?? null;
}

function wholeWord(k: string, tail: string, dict: JaDict): { reading: string; consumed: number } | null {
  for (let n = Math.min(tail.length, 4); n >= 1; n--) {
    const t = tail.slice(0, n);
    if (KANJI.test(t)) continue;
    const r = dict.words.get(k + t);
    if (r) return { reading: r, consumed: n };
  }
  return null;
}

// --- kana -> hepburn ---

const DIGRAPH: Record<string, string> = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo', しゃ: 'sha', しゅ: 'shu', しょ: 'sho', ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo', ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo', みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo', ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo', じゃ: 'ja', じゅ: 'ju', じょ: 'jo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo', ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo', ぢゃ: 'ja', ぢゅ: 'ju', ぢょ: 'jo',
  てぃ: 'ti', でぃ: 'di', ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo', うぃ: 'wi', うぇ: 'we', うぉ: 'wo',
  しぇ: 'she', ちぇ: 'che', じぇ: 'je', つぁ: 'tsa', つぃ: 'tsi', つぇ: 'tse', つぉ: 'tso', とぅ: 'tu', どぅ: 'du', ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo',
};

const MONO: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo', ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', ゐ: 'wi', ゑ: 'we', を: 'wo', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo', だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo', ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po', ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ゎ: 'wa', ゝ: '', ゞ: '',
};

const SMALL = /[ぁぃぅぇぉゃゅょゎ]/;

export function katakanaToHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export function kanaToRomaji(kanaIn: string): string {
  const kana = katakanaToHiragana(kanaIn);
  let out = '';
  let i = 0;
  while (i < kana.length) {
    const ch = kana[i];
    const pair = kana.slice(i, i + 2);
    if (ch === 'っ') {
      // gemination: double the next consonant
      const nextRoman = DIGRAPH[kana.slice(i + 1, i + 3)] ?? MONO[kana[i + 1] ?? ''] ?? '';
      out += nextRoman ? (nextRoman.startsWith('ch') ? 't' : nextRoman[0]) : '';
      i += 1;
      continue;
    }
    if (ch === 'ー') {
      // prolonged sound mark repeats the previous vowel
      const last = out.match(/[aeiou]$/)?.[0] ?? '';
      out += last;
      i += 1;
      continue;
    }
    if (DIGRAPH[pair]) {
      out += DIGRAPH[pair];
      i += 2;
      continue;
    }
    if (ch === 'ん') {
      const next = MONO[kana[i + 1] ?? ''] ?? '';
      // n before a vowel or y needs an apostrophe so "kin'en" is not "kinen"
      out += /^[aeiouy]/.test(next) ? "n'" : 'n';
      i += 1;
      continue;
    }
    if (MONO[ch] !== undefined) {
      out += MONO[ch];
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

// morae are what japanese singing is timed on: every kana counts except the small glide vowels
export function countMorae(kanaIn: string): number {
  const kana = katakanaToHiragana(kanaIn);
  let n = 0;
  for (const ch of kana) {
    if (!KANA.test(ch)) continue;
    if (SMALL.test(ch)) continue;
    n += 1;
  }
  return n;
}

type Segmenter = { segment(input: string): Iterable<{ segment: string }> };
let segmenter: Segmenter | null | undefined;
function segments(text: string): string[] {
  if (segmenter === undefined) {
    const ctor = (globalThis as { Intl?: { Segmenter?: new (l: string, o: object) => Segmenter } }).Intl?.Segmenter;
    segmenter = ctor ? new ctor('ja', { granularity: 'word' }) : null;
  }
  if (!segmenter) return [text];
  return [...segmenter.segment(text)].map(s => s.segment);
}

export interface Romanized {
  // the line in kana (kanji resolved), same order as the input, spaces preserved
  kana: string;
  romaji: string;
}

const PARTICLES = new Set(['は', 'が', 'を', 'に', 'で', 'と', 'の', 'へ', 'も', 'や', 'から', 'まで', 'より']);
const HIRAGANA_ONLY = /^[\u3040-\u309f]+$/;
const KATAKANA_ONLY = /^[\u30a0-\u30ff]+$/;

// icu cuts japanese finer than a reader wants (な/れ/ない); glue endings back onto their word
export function groupSegments(segs: string[]): string[] {
  const out: string[] = [];
  for (const seg of segs) {
    const prev = out[out.length - 1];
    const glue =
      prev !== undefined &&
      !/\s/.test(prev) &&
      !/\s/.test(seg) &&
      !PARTICLES.has(prev) &&
      ((HIRAGANA_ONLY.test(seg) && seg.length <= 2 && !PARTICLES.has(seg)) ||
        (KATAKANA_ONLY.test(seg) && KATAKANA_ONLY.test(prev)) ||
        (seg.length === 1 && KANJI.test(seg) && KANJI.test(prev[prev.length - 1])));
    if (glue) out[out.length - 1] = prev + seg;
    else out.push(seg);
  }
  return out;
}

// the topic/direction/object particles are read differently from how they are written
function particleRomaji(seg: string): string | null {
  if (seg === 'は') return 'wa';
  if (seg === 'へ') return 'e';
  if (seg === 'を') return 'o';
  return null;
}

export function romanizeLine(text: string, dict: JaDict): Romanized {
  if (!HAS_JAPANESE.test(text)) return { kana: text, romaji: text };
  const kanaParts: string[] = [];
  const romajiParts: string[] = [];
  for (const seg of groupSegments(segments(text))) {
    if (/^\s+$/.test(seg)) {
      kanaParts.push(seg);
      romajiParts.push(' ');
      continue;
    }
    const kana = readSegment(seg, dict);
    kanaParts.push(kana);
    romajiParts.push(particleRomaji(seg) ?? kanaToRomaji(kana));
  }
  // segments are words, so romaji gets a space between them; kana keeps the original run
  const romaji = romajiParts.join(' ').replace(/\s+/g, ' ').replace(/\s+([、。!?,.])/g, '$1').trim();
  return { kana: kanaParts.join(''), romaji };
}

export interface RomajiWord {
  ja: string;
  kana: string;
  romaji: string;
}

// the line as romaji words, each still knowing its kana so timing can count morae
const wordsCache = new Map<string, RomajiWord[]>();
const WORDS_CACHE_MAX = 400;

export function romanizeWords(text: string, dict: JaDict): RomajiWord[] {
  const hit = wordsCache.get(text);
  if (hit) return hit;
  const out = romanizeWordsUncached(text, dict);
  if (wordsCache.size >= WORDS_CACHE_MAX) wordsCache.delete(wordsCache.keys().next().value as string);
  wordsCache.set(text, out);
  return out;
}

function romanizeWordsUncached(text: string, dict: JaDict): RomajiWord[] {
  const out: RomajiWord[] = [];
  for (const seg of groupSegments(segments(text))) {
    if (/^\s+$/.test(seg)) continue;
    const kana = readSegment(seg, dict);
    const romaji = particleRomaji(seg) ?? kanaToRomaji(kana);
    if (romaji.trim()) out.push({ ja: seg, kana, romaji });
  }
  return out;
}
