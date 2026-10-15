// Port of vietify/hepburnParser.py.

const VOWELS = new Set("aāeēiīoōuū");
const DIPHTHONGS = new Set(["ai", "au", "ei", "oi", "ou", "ui"]);
const ONSETS = [
  "ch", "sh", "ts",
  "by", "dy", "gy", "hy", "jy", "ky", "my", "ny", "py", "ry", "sy", "ty", "zy",
  "b", "d", "f", "g", "h", "j", "k", "m", "n", "p", "r", "s", "t", "w", "y", "z",
];

export class HepburnParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "HepburnParseError";
  }
}

function appendMoraicNasal(syllables) {
  const last = syllables[syllables.length - 1];
  if (last && last.nucleus && !last.ending) {
    last.ending = "n";
    return;
  }
  syllables.push({ initial: null, nucleus: null, ending: "n", nasal_realization: null });
}

/** Parse one Hepburn word into onset / nucleus / moraic-nasal fields. */
export function parse(text) {
  const word = text.normalize("NFC").toLowerCase().replaceAll("’", "'");
  if (!word) throw new HepburnParseError("Hepburn input cannot be empty");

  const syllables = [];
  let index = 0;
  while (index < word.length) {
    if (
      word[index] === "n" &&
      (index + 1 === word.length ||
        word[index + 1] === "'" ||
        (!VOWELS.has(word[index + 1]) && word[index + 1] !== "y"))
    ) {
      appendMoraicNasal(syllables);
      index += 1;
      if (index < word.length && word[index] === "'") index += 1;
      continue;
    }

    let onset = ONSETS.find((candidate) => word.startsWith(candidate, index)) ?? "";
    if (onset) {
      index += onset.length;
    } else if (!VOWELS.has(word[index])) {
      throw new HepburnParseError(
        `invalid Hepburn sequence at position ${index}: ${JSON.stringify(word.slice(index))}`,
      );
    }

    if (index >= word.length || !VOWELS.has(word[index])) {
      throw new HepburnParseError(
        `expected a vowel after ${onset || "word start"} in ${JSON.stringify(word)}`,
      );
    }

    let nucleus = word[index];
    if (index + 1 < word.length && DIPHTHONGS.has(nucleus + word[index + 1])) {
      nucleus += word[index + 1];
      index += 1;
    }
    index += 1;
    syllables.push({ initial: onset || null, nucleus, ending: null, nasal_realization: null });
  }
  return syllables;
}
