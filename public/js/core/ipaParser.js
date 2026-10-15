// Port of vietify/parser.py: IPA word -> syllables {stress, initial, nucleus, ending}.
// The PEG rule structure is transcribed by hand; the literal alternatives come
// from grammar.generated.js (extracted from the Python grammar).

import { parser as G } from "./grammar.generated.js";
import { oneOf, optional, ParseError } from "./peg.js";

const stress = oneOf(G.Stress);
const initialConsonant = oneOf(G.InitialConsonant);
const apprxEnding = oneOf(G.ApprxEndingConsonant);
const nasalVowel = oneOf(G.NasalVowel);
const vowel = oneOf(G.Vowel);
const glide = oneOf(G.Glide);
const trueDiphthong = oneOf(G.TrueDiphthong);
const optStress = optional(stress);

// EndingConsonant = "tʃ" / "t" !"ʃ" / "k" !(Stress? "w") / "p" / "m" / "n" / "ŋ"
const [E_TSH, E_T, E_SH, E_K, E_W, E_P, E_M, E_N, E_NG] = G.EndingConsonant;
if (G.EndingConsonant.length !== 9) {
  throw new Error("EndingConsonant grammar changed; update ipaParser.js");
}
function endingConsonant(text, i) {
  if (text.startsWith(E_TSH, i)) return i + E_TSH.length;
  if (text.startsWith(E_T, i) && !text.startsWith(E_SH, i + E_T.length)) {
    return i + E_T.length;
  }
  if (text.startsWith(E_K, i) && !text.startsWith(E_W, optStress(text, i + E_K.length))) {
    return i + E_K.length;
  }
  for (const literal of [E_P, E_M, E_N, E_NG]) {
    if (text.startsWith(literal, i)) return i + literal.length;
  }
  return -1;
}

const anyEnding = (text, i) => {
  const end = endingConsonant(text, i);
  return end >= 0 ? end : apprxEnding(text, i);
};

// Diphthong = Glide TrueDiphthong / Glide Vowel / TrueDiphthong
function diphthong(text, i) {
  const g = glide(text, i);
  if (g >= 0) {
    let end = trueDiphthong(text, g);
    if (end >= 0) return end;
    end = vowel(text, g);
    if (end >= 0) return end;
  }
  return trueDiphthong(text, i);
}

// NasalVowelNucleus = Glide NasalVowel / NasalVowel
function nasalVowelNucleus(text, i) {
  const g = glide(text, i);
  if (g >= 0) {
    const end = nasalVowel(text, g);
    if (end >= 0) return end;
  }
  return nasalVowel(text, i);
}

// A coda consonant only belongs to this syllable if no vowel follows it.
const noVowelAhead = (text, i) =>
  diphthong(text, i) < 0 && nasalVowelNucleus(text, i) < 0 && vowel(text, i) < 0;

// nucleus-matcher + coda: { end, nucleus, ending } or null
function withCoda(nucleusMatcher, text, i) {
  const n = nucleusMatcher(text, i);
  if (n < 0) return null;
  const c = anyEnding(text, n);
  if (c < 0 || !noVowelAhead(text, c)) return null;
  return { end: c, nucleus: text.slice(i, n), ending: text.slice(n, c) };
}

// SyllableEnding = DiphthongWithEnding / VowelWithEnding / BareDiphthong / BareVowel
function syllableEnding(text, i) {
  // DiphthongWithEnding = Diphthong coda / NasalVowelWithEnding / NasalVowelNucleus
  let r = withCoda(diphthong, text, i) ?? withCoda(nasalVowelNucleus, text, i);
  if (r) return r;
  const nasal = nasalVowelNucleus(text, i);
  if (nasal >= 0) return { end: nasal, nucleus: text.slice(i, nasal), ending: null };

  r = withCoda(vowel, text, i);
  if (r) return r;

  // BareDiphthong = Diphthong !Vowel
  const d = diphthong(text, i);
  if (d >= 0 && vowel(text, d) < 0) {
    return { end: d, nucleus: text.slice(i, d), ending: null };
  }
  const v = vowel(text, i);
  if (v >= 0) return { end: v, nucleus: text.slice(i, v), ending: null };
  return null;
}

const stressValue = (s) => (s === "ˈ" ? 1 : s === "ˌ" ? 2 : null);

// Syllable = SyllableWithEnding / SyllableWithConsonant / SyllableBare
function syllable(text, i) {
  const s1end = optStress(text, i);
  const s1 = text.slice(i, s1end);
  const ic = initialConsonant(text, s1end);
  if (ic >= 0) {
    const initial = text.slice(s1end, ic);
    const s2end = optStress(text, ic);
    const s2 = text.slice(ic, s2end);
    const ending = syllableEnding(text, s2end);
    if (ending) {
      return {
        end: ending.end,
        value: {
          stress: stressValue(s1 || s2),
          initial,
          nucleus: ending.nucleus,
          ending: ending.ending,
        },
      };
    }
    return {
      end: ic,
      value: { stress: stressValue(s1), initial, nucleus: null, ending: null },
    };
  }
  const ending = syllableEnding(text, s1end);
  if (ending) {
    return {
      end: ending.end,
      value: {
        stress: stressValue(s1),
        initial: null,
        nucleus: ending.nucleus,
        ending: ending.ending,
      },
    };
  }
  return null;
}

const skipSpaces = (text, i) => {
  while (text[i] === " ") i++;
  return i;
};

/** Parse one IPA word (optionally wrapped in "/"). Throws ParseError. */
export function parse(input) {
  const text = input.normalize("NFC");
  let i = skipSpaces(text, 0);
  if (text[i] === "/") i++;
  const syllables = [];
  for (;;) {
    const s = syllable(text, i);
    if (!s) break;
    syllables.push(s.value);
    i = s.end;
  }
  if (text[i] === "/") i++;
  i = skipSpaces(text, i);
  if (i !== text.length) {
    throw new ParseError(`could not parse IPA at position ${i}: ${JSON.stringify(text.slice(i))}`);
  }
  return syllables;
}
