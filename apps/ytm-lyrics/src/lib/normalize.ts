// youtube music in a browser reports video-style titles; lrclib wants the plain song and artist.

const TITLE_NOISE = [
  /\s*[\(\[][^\)\]]*(official|video|audio|lyric|lyrics|visualizer|hd|4k|remaster(ed)?|mv|m\/v|live|version|ver\.?|acoustic|instrumental|karaoke|explicit|clean|edit|mix)[^\)\]]*[\)\]]/gi,
  /\s*[\(\[]\s*(feat|ft)\.?[^\)\]]*[\)\]]/gi,
  /\s+(feat|ft)\.?\s+.*$/i,
  /\s*[|｜].*$/,
  /\s*[-–—]\s*(official|lyrics?|video|audio|topic)\b.*$/i,
];

const ARTIST_NOISE = [/\s*-\s*topic$/i, /\s*vevo$/i, /\s*official$/i];

function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function normalizeTitle(raw: string | null | undefined): string {
  let s = raw ?? '';
  for (const re of TITLE_NOISE) s = s.replace(re, '');
  return squash(s);
}

// only the first credited artist; lrclib matches on a single artist name
export function normalizeArtist(raw: string | null | undefined): string {
  let s = raw ?? '';
  for (const re of ARTIST_NOISE) s = s.replace(re, '');
  s = s.split(/\s*(?:,|&|\/|\bx\b|\band\b|\bfeat\.?\b|\bft\.?\b)\s*/i)[0] ?? s;
  return squash(s);
}
