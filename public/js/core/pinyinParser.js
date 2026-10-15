// Port of vietify/pinyinParser.py.

import { pinyinParser as G } from "./grammar.generated.js";
import { oneOf, ParseError } from "./peg.js";

const initialConsonant = oneOf(G.InitialConsonant);
const endingConsonant = oneOf(G.EndingConsonant);
const vowel = oneOf(G.Vowel);
const glide = oneOf(G.Glide);
const trueDiphthong = oneOf(G.TrueDiphthong);

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

const noVowelAhead = (text, i) => diphthong(text, i) < 0 && vowel(text, i) < 0;

function withCoda(nucleusMatcher, text, i) {
  const n = nucleusMatcher(text, i);
  if (n < 0) return null;
  const c = endingConsonant(text, n);
  if (c < 0 || !noVowelAhead(text, c)) return null;
  return { end: c, nucleus: text.slice(i, n), ending: text.slice(n, c) };
}

function syllableEnding(text, i) {
  const r = withCoda(diphthong, text, i) ?? withCoda(vowel, text, i);
  if (r) return r;
  const d = diphthong(text, i);
  if (d >= 0 && vowel(text, d) < 0) {
    return { end: d, nucleus: text.slice(i, d), ending: null };
  }
  const v = vowel(text, i);
  if (v >= 0) return { end: v, nucleus: text.slice(i, v), ending: null };
  return null;
}

// Returns { end, value } where value is a syllable, or null for a bare
// consonant. The Python visitor drops consonant-only "syllables" (the rule is
// an alias of InitialConsonant, so its visitor returns a string, which
// collect_syllables ignores). Reproduced here: "hello" -> he, lo.
function syllable(text, i) {
  const ic = initialConsonant(text, i);
  if (ic >= 0) {
    const ending = syllableEnding(text, ic);
    if (ending) {
      return {
        end: ending.end,
        value: { initial: text.slice(i, ic), nucleus: ending.nucleus, ending: ending.ending },
      };
    }
    return { end: ic, value: null };
  }
  const ending = syllableEnding(text, i);
  if (ending) {
    return { end: ending.end, value: { initial: null, nucleus: ending.nucleus, ending: ending.ending } };
  }
  return null;
}

const skipSpaces = (text, i) => {
  while (text[i] === " ") i++;
  return i;
};

function parseWord(text) {
  let i = skipSpaces(text, 0);
  if (text[i] === "/") i++;
  const syllables = [];
  for (;;) {
    const s = syllable(text, i);
    if (!s) break;
    if (s.value) syllables.push(s.value);
    i = skipSpaces(text, s.end);
  }
  if (text[i] === "/") i++;
  i = skipSpaces(text, i);
  if (i !== text.length) {
    throw new ParseError(`could not parse pinyin at position ${i}: ${JSON.stringify(text.slice(i))}`);
  }
  return syllables;
}

const TONE_MARKS = {
  "ā": ["a", 1], "á": ["a", 2], "ǎ": ["a", 3], "à": ["a", 4],
  "ē": ["e", 1], "é": ["e", 2], "ě": ["e", 3], "è": ["e", 4],
  "ī": ["i", 1], "í": ["i", 2], "ǐ": ["i", 3], "ì": ["i", 4],
  "ō": ["o", 1], "ó": ["o", 2], "ǒ": ["o", 3], "ò": ["o", 4],
  "ū": ["u", 1], "ú": ["u", 2], "ǔ": ["u", 3], "ù": ["u", 4],
  "ǖ": ["ü", 1], "ǘ": ["ü", 2], "ǚ": ["ü", 3], "ǜ": ["ü", 4],
};

function stripToneMarks(input) {
  let text = input;
  let numericTone = null;
  if (text && "012345".includes(text[text.length - 1])) {
    numericTone = Number(text[text.length - 1]);
    text = text.slice(0, -1);
    if (numericTone === 0) numericTone = 5;
  }
  let tone = null;
  let result = "";
  for (const char of text) {
    if (Object.hasOwn(TONE_MARKS, char)) {
      const [base, marked] = TONE_MARKS[char];
      if (tone !== null) throw new Error("a pinyin syllable can have only one tone mark");
      tone = marked;
      result += base;
    } else {
      result += char;
    }
  }
  if (numericTone !== null && tone !== null) {
    throw new Error("use either a pinyin tone mark or tone number, not both");
  }
  return [result, numericTone !== null ? numericTone : tone];
}

function parseSyllableText(token) {
  let [text, tone] = stripToneMarks(token.toLowerCase());
  text = text.replace(/(?<=[jqx])u/g, "ü");
  text = text.replace(/^yue$/, "üe").replace(/^yuan$/, "üan").replace(/^yun$/, "ün").replace(/^yu$/, "ü");
  text = text.replace(/^([bpmf])o$/, "$1uo");
  text = text.replace(/^(zh|ch|sh|[zcsr])i$/, "$1v");
  return [text, tone];
}

/** Parse whitespace-separated pinyin syllables into [{initial, nucleus, ending, tone}]. */
export function parse(input) {
  const text = input.normalize("NFC");
  const result = [];
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const [normalized, tone] = parseSyllableText(token);
    const syllables = parseWord(normalized);
    if (tone !== null && syllables.length !== 1) {
      throw new Error(`tone must be attached to one pinyin syllable: ${JSON.stringify(token)}`);
    }
    for (const s of syllables) {
      s.tone = tone || 5;
      result.push(s);
    }
  }
  return result;
}
