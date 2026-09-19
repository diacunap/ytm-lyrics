import { beforeAll, describe, expect, test } from 'bun:test';

import { countMorae, kanaToRomaji, parseDict, readSegment, romanizeLine, type JaDict } from './romaji';

let dict: JaDict;
beforeAll(async () => {
  const gz = await Bun.file(new URL('../../public/ja-dict.bin.gz', import.meta.url)).arrayBuffer();
  dict = parseDict(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(gz))));
});

describe('kanaToRomaji', () => {
  test.each([
    ['きせつ', 'kisetsu'],
    ['がっこう', 'gakkou'],
    ['しゃしん', 'shashin'],
    ['きんえん', "kin'en"],
    ['てんき', 'tenki'],
    ['まっちゃ', 'matcha'],
    ['スーパー', 'suupaa'],
    ['ぼく', 'boku'],
    ['ちょっと', 'chotto'],
  ])('%s → %s', (kana, romaji) => {
    expect(kanaToRomaji(kana)).toBe(romaji);
  });
});

describe('countMorae', () => {
  test.each([
    ['きせつ', 3],
    ['がっこう', 4],
    ['しゃしん', 3],
    ['スーパー', 4],
    ['ちょっと', 3],
    ['hello', 0],
  ])('%s → %i', (kana, n) => {
    expect(countMorae(kana)).toBe(n);
  });
});

describe('readSegment (real dictionary)', () => {
  test('dictionary loaded', () => {
    expect(dict.words.size).toBeGreaterThan(30_000);
    expect(dict.kanji.size).toBeGreaterThan(2_000);
  });
  test.each([
    ['季節', 'きせつ'],
    ['感情的', 'かんじょうてき'],
    ['臆病', 'おくびょう'],
    ['抱え', 'かかえ'],
    ['笑って', 'わらって'],
    ['続く', 'つづく'],
    ['青', 'あお'],
    ['言葉', 'ことば'],
    ['今更', 'いまさら'],
    ['大事', 'だいじ'],
  ])('%s → %s', (seg, kana) => {
    expect(readSegment(seg, dict)).toBe(kana);
  });
});

describe('romanizeLine (real dictionary)', () => {
  test('eve, nonsense bungaku', () => {
    const r = romanizeLine('感情的にはなれない 今更臆病になって', dict);
    expect(r.romaji).toBe('kanjouteki ni wa narenai imasara okubyou ni natte');
  });
  test('kitani, where our blue is', () => {
    const r = romanizeLine('どこまでも続くような青の季節は', dict);
    expect(r.romaji.replace(/ /g, '')).toBe('dokomademotsuzukuyounaaonokisetsuwa');
  });
  test('katakana and latin pass through', () => {
    expect(romanizeLine('ドクドクドク ハイテンション', dict).romaji).toBe('dokudokudoku haitenshon');
    expect(romanizeLine('Around the world', dict).romaji).toBe('Around the world');
  });
  test('unknown kanji is kept rather than invented', () => {
    const r = romanizeLine('𠮷', dict);
    expect(r.romaji).toBe('𠮷');
  });
});
