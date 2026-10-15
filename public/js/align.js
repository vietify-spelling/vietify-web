// Word alignment between an original sentence and its IPA / weak / strong lines.
// Every output line is a list of {text, group}; tokens sharing a group number
// correspond to each other. group is null when no reliable alignment exists.

import { phonemize } from "./phonemize.js";
import { PHONEMIZED_LANGUAGES, textToVietifyWords } from "./pipeline.js";

const words = (text) => text.split(/\s+/).filter(Boolean);

/** How many IPA words each original word becomes, or null if they don't add up. */
function ipaCounts(origWords, language, engine, total) {
  if (!PHONEMIZED_LANGUAGES.has(language)) {
    return origWords.length === total ? origWords.map(() => 1) : null;
  }
  if (origWords.length === total) return origWords.map(() => 1);
  engine.setLanguage(language);
  const counts = origWords.map((w) => words(phonemize(engine, w).ipa).length);
  return counts.reduce((a, b) => a + b, 0) === total ? counts : null;
}

const LETTERS = /[^\p{L}\p{N}\u0300-\u036f]/gu;
const letters = (text) => Array.from(text.replace(LETTERS, ""));

function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const MAX_RUN = 4; // longest run of words fused (or split) into one block
const EXTRA_WORD_COST = 0.75; // bias towards 1:1 blocks

/**
 * Coarse alignment for sentences where eSpeak fused or split words: partition
 * both word lists into consecutive blocks and pair them up, choosing the
 * pairing whose phonemes match best (each original word is phonemized alone and
 * compared to the full-line IPA). Returns the owner block of every IPA word and
 * of every original word, or null when no pairing is possible.
 */
function coarseBlocks(origWords, ipaWords, language, engine) {
  engine.setLanguage(language);
  const solo = origWords.map((w) => letters(phonemize(engine, w).ipa));
  const full = ipaWords.map(letters);
  const n = origWords.length;
  const m = ipaWords.length;
  const cost = (i, a, j, b) =>
    levenshtein(solo.slice(i, i + a).flat(), full.slice(j, j + b).flat()) + EXTRA_WORD_COST * (a + b - 2);

  // best[i][j]: cheapest pairing of the first i original / first j IPA words.
  const best = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
  const back = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));
  best[0][0] = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      if (best[i][j] === Infinity) continue;
      for (let a = 1; a <= MAX_RUN && i + a <= n; a++) {
        for (let b = 1; b <= MAX_RUN && j + b <= m; b++) {
          const c = best[i][j] + cost(i, a, j, b);
          if (c < best[i + a][j + b]) {
            best[i + a][j + b] = c;
            back[i + a][j + b] = [i, j];
          }
        }
      }
    }
  }
  if (best[n][m] === Infinity) return null;

  const origOwner = Array(n);
  const ipaOwner = Array(m);
  let [i, j] = [n, m];
  const blocks = [];
  while (i > 0) {
    const [pi, pj] = back[i][j];
    blocks.push([pi, i, pj, j]);
    [i, j] = [pi, pj];
  }
  blocks.reverse().forEach(([i0, i1, j0, j1], block) => {
    for (let k = i0; k < i1; k++) origOwner[k] = block;
    for (let k = j0; k < j1; k++) ipaOwner[k] = block;
  });
  return { origOwner, ipaOwner };
}

/** -> { src, ipa, weak, strong, aligned, warnings } */
export function alignSentence(original, language, engine) {
  const r = textToVietifyWords(original, language, engine);
  const origWords = words(original);
  const counts = r.aligned ? ipaCounts(origWords, language, engine, r.ipaWords.length) : null;

  if (!counts && r.aligned && PHONEMIZED_LANGUAGES.has(language)) {
    const blocks = coarseBlocks(origWords, r.ipaWords, language, engine);
    if (blocks) {
      const tagBy = (list, owner) => list.map((text, j) => ({ text, group: owner[j] }));
      return {
        src: tagBy(origWords, blocks.origOwner), ipa: tagBy(r.ipaWords, blocks.ipaOwner),
        weak: tagBy(r.weakWords, blocks.ipaOwner), strong: tagBy(r.strongWords, blocks.ipaOwner),
        aligned: true, coarse: true, warnings: r.warnings,
      };
    }
  }

  const plain = (list) => list.map((text) => ({ text, group: null }));
  if (!counts) {
    return {
      src: plain(origWords), ipa: plain(r.ipaWords), weak: plain(r.weakWords),
      strong: plain(r.strongWords), aligned: false, warnings: r.warnings,
    };
  }
  const owner = counts.flatMap((n, i) => Array(n).fill(i));
  const tag = (list) => list.map((text, j) => ({ text, group: owner[j] }));
  return {
    src: origWords.map((text, i) => ({ text, group: i })),
    ipa: tag(r.ipaWords), weak: tag(r.weakWords), strong: tag(r.strongWords),
    aligned: true, warnings: r.warnings,
  };
}
