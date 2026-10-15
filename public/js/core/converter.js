// Port of vietify/converter.py: parsed syllables -> Vietnamese spelling.

import * as ipaRulesStrong from "./rules.generated.js";
import { parse as parseIpa } from "./ipaParser.js";
import { parse as parsePinyin } from "./pinyinParser.js";
import { parse as parseHepburn, HepburnParseError } from "./hepburnParser.js";

const { IPAruleStrong, IPAruleWeak, hepburnRuleStrong, pinyinRuleStrong, pinyinRuleWeak } =
  ipaRulesStrong;

const COMBINE_ACUTE = "́"; // sắc
const COMBINE_GRAVE = "̀"; // huyền
const COMBINE_HOOK_ABOVE = "̉"; // hỏi
const COMBINE_MACRON = "̄"; // 1st pinyin tone

const IPA_RULES = { weak: IPAruleWeak, strong: IPAruleStrong };
const PINYIN_RULES = { weak: pinyinRuleWeak, strong: pinyinRuleStrong };

function rulesForMode(mode, language) {
  const tables = language === "ch" ? PINYIN_RULES : IPA_RULES;
  if (!Object.hasOwn(tables, mode)) {
    throw new Error(`mode must be 'weak' or 'strong', got '${mode}'`);
  }
  return tables[mode];
}

const nfc = (value) => value.normalize("NFC");
const nfdFirst = (char) => char.normalize("NFD")[0];

/** Resolve c/k alternation required by the following vowel. */
export function vieConsonantRule(consonant, vowel) {
  if (
    vowel &&
    (consonant === "k" || consonant === "c") &&
    nfdFirst(vowel[0]) === "u" &&
    vowel.length > 1 &&
    new Set(["a", "e", "ê", "i", "o", "u", "œ", "ø", "ä", "ö", "ü"]).has(nfdFirst(vowel[1]))
  ) {
    return "qu" + vowel.slice(1);
  }
  if (vowel && consonant === "k" && new Set(["a", "o", "u", "ä", "ü"]).has(nfdFirst(vowel[0]))) {
    return "c" + vowel;
  }
  if (vowel && consonant === "c" && new Set(["e", "ê", "i", "œ", "ø"]).has(nfdFirst(vowel[0]))) {
    return "k" + vowel;
  }
  return consonant + vowel;
}

const SYLLABLE_REPLACEMENTS = {
  wi: "uy", wa: "oa", "wâ": "uâ", we: "oe", "wơ": "uơ",
  ge: "ghe", gi: "ghi", "gê": "ghê", qui: "quy",
};
const SYLLABLE_PATTERN = /wi|wa|wâ|we|wơ|qui/g;

// g + front vowel is spelled gh, except "gi" from the fricative/affricate ʒ, dʒ.
const GI_KEEP_ONSETS = new Set(["ʒ", "dʒ"]);
const GH_PATTERN = /ge|gi(?!a)|gê/g;
const GH_REPLACEMENTS = { ge: "ghe", gi: "ghi", "gê": "ghê" };

const ENDING_REPLACEMENTS = { ki: "ky", li: "ly", mi: "my", si: "sy", ti: "ty", hi: "hy" };
const ENDING_PATTERN = /ki$|li$|mi$|si$|ti$|hi$/;

function replaceSyllablePatterns(vie, head) {
  vie = vie.replace(SYLLABLE_PATTERN, (m) => SYLLABLE_REPLACEMENTS[m]);
  if (!GI_KEEP_ONSETS.has(head)) {
    vie = vie.replace(GH_PATTERN, (m) => GH_REPLACEMENTS[m]);
  }
  return vie;
}

function applyVowelEpenthesis(vie, options) {
  const replacement = options.vowelEpenthesis?.replacement ?? "ơ";
  return vie.replace(/._/g, (match) => vieConsonantRule(match[0], replacement));
}

const applyEndingReplacements = (vie) => vie.replace(ENDING_PATTERN, (m) => ENDING_REPLACEMENTS[m]);

function applyInitialConsonantRule(vie) {
  if (vie.length < 2 || (vie[0] !== "k" && vie[0] !== "c")) return vie;
  return vieConsonantRule(vie[0], vie.slice(1));
}

function applyFinalKRule(vie) {
  if (!vie.endsWith("c") || vie.length < 2) return vie;
  const preceding = nfdFirst(vie[vie.length - 2]);
  return preceding === "e" || preceding === "ê" || preceding === "i" ? vie.slice(0, -1) + "ch" : vie;
}

function shouldSkipVowelEpenthesis(options, isLastSyllable) {
  const ve = options.vowelEpenthesis ?? {};
  return Boolean(ve.skipAll || (ve.skipLast && isLastSyllable));
}

// German r-vocalisation overrides, built once per (rules, coda) combination.
const germanMappingCache = new Map();
function germanMapping(rules, hasFollowingConsonant) {
  const key = `${rules === IPAruleStrong ? "strong" : "weak"}:${hasFollowingConsonant}`;
  let mapping = germanMappingCache.get(key);
  if (!mapping) {
    mapping = new Map([...rules.SYLLABLE_ENDING_MAPPING, ...IPAruleWeak.GERMAN_R_VOCALIZATION]);
    if (!hasFollowingConsonant) {
      for (const [k, v] of IPAruleWeak.GERMAN_R_VOCALIZATION_WITHOUT_CODA) mapping.set(k, v);
    }
    germanMappingCache.set(key, mapping);
  }
  return mapping;
}

/** Returns [intermediate vie syllable, isNullEnding]. */
function buildVieSyllable(syllable, rules, language, hasFollowingConsonant) {
  let head = syllable.initial || "";
  let nucleus = syllable.nucleus || "";
  const ending = syllable.ending || "";

  // A glide j before a vowel is part of the nucleus: "ju" -> "iu", not "giu".
  if (head === "j" && rules.SYLLABLE_ENDING_MAPPING.has("j" + nucleus)) {
    head = "";
    nucleus = "j" + nucleus;
  }

  const tail = nucleus + ending;
  const mapping =
    language === "de" ? germanMapping(rules, hasFollowingConsonant) : rules.SYLLABLE_ENDING_MAPPING;

  const isNullEnding = !mapping.has(tail);
  const vie =
    (rules.LETTER_MAPPING.get(head) ?? "") + (mapping.get(tail) ?? rules.NULL_MAPPING);
  return [replaceSyllablePatterns(vie, head), isNullEnding];
}

export function syllableToVie(syllable, options, isLastSyllable, mode, hasFollowingConsonant) {
  options = options || {};
  const rules = rulesForMode(mode, options.language);

  let [vie, isNullVowel] = buildVieSyllable(syllable, rules, options.language, hasFollowingConsonant);

  if (isNullVowel) {
    if (mode === "strong") {
      if (shouldSkipVowelEpenthesis(options, isLastSyllable)) return "";
      vie = applyVowelEpenthesis(vie, options);
    } else {
      vie = vie.replaceAll(rules.NULL_MAPPING, "");
    }
  } else {
    vie = applyEndingReplacements(vie);
    vie = applyInitialConsonantRule(vie);
    vie = applyFinalKRule(vie);
  }

  if (options.uppercaseStress && syllable.stress) return vie.toUpperCase();
  return vie;
}

const cleanIpaItem = (item) => item.replaceAll("ɝˈ", "əˈɹ").replaceAll("ɝ", "əɹ");

function normalizeStress(ast) {
  const stressCount = ast.filter((s) => s.stress).length;
  const vowelCount = ast.filter((s) => s.nucleus).length;
  if (stressCount !== vowelCount) return;
  const secondary = ast.find((s) => s.stress === 2);
  if (secondary) secondary.stress = null;
}

function moveStressFromEmptySyllables(ast) {
  ast.forEach((syllable, idx) => {
    if (syllable.stress && !syllable.nucleus && idx + 1 < ast.length) {
      ast[idx + 1].stress = syllable.stress;
      syllable.stress = null;
    }
  });
}

const followedByConsonantOnly = (ast, idx) =>
  idx + 1 < ast.length && Boolean(ast[idx + 1].initial) && !ast[idx + 1].nucleus;

function convertAstToVie(ast, options, mode) {
  let out = "";
  ast.forEach((syllable, idx) => {
    const vie = syllableToVie(syllable, options, idx === ast.length - 1, mode, followedByConsonantOnly(ast, idx));
    if (idx !== 0 && vie) out += "-";
    out += vie;
  });
  return out;
}

function convertIpaItem(item, options, mode) {
  const cleaned = cleanIpaItem(item);
  // Keep numbers unchanged.
  if (/^\d+(?:[.,]\d+)*$/.test(cleaned)) return { ipa: item, ast: [], vie: item };

  const ast = parseIpa(cleaned);
  normalizeStress(ast);
  moveStressFromEmptySyllables(ast);
  return { ipa: item, ast, vie: convertAstToVie(ast, options, mode) };
}

const LIAISON_CONSONANTS = ["z", "x", "t", "d", "n", "ph"];
const VOWELS = new Set("aeêiouœøäöü");

/** Mark liaison between adjacent converted words (mutates and returns). */
export function applyFrenchLiaison(results) {
  for (let i = 0; i + 1 < results.length; i++) {
    const current = results[i].vie;
    const following = results[i + 1].vie;
    if (
      current &&
      following &&
      LIAISON_CONSONANTS.some((c) => current.toLowerCase().endsWith(c)) &&
      VOWELS.has(following[0].toLowerCase())
    ) {
      results[i].vie = current + " →";
    }
  }
  return results;
}

/** Convert comma+space separated IPA items. */
export function ipaToVie(ipa, options, mode) {
  options = options || {};
  rulesForMode(mode);
  let results = ipa.split(", ").map((item) => convertIpaItem(item, options, mode));
  if (options.language === "fr") results = applyFrenchLiaison(results);
  return results;
}

/** Attach a tonal mark to the preferred Vietnamese nucleus vowel. */
export function addTonalMarkToVowel(vie, tonalMark) {
  const put = (index, length) =>
    vie.slice(0, index) + nfc(vie.slice(index, index + length) + tonalMark) + vie.slice(index + length);

  // Multi-vowel nuclei where the tone belongs on the second vowel.
  for (const pattern of ["ươ", "uô", "iê", "yê", "uê"]) {
    const match = new RegExp(pattern, "i").exec(vie);
    if (match) return put(match.index + match[0].length - 1, 1);
  }
  // Vowels with inherent Vietnamese quality marks.
  let match = /[âăêôơưü]/i.exec(vie);
  if (match) return put(match.index, 1);
  // Ordinary diphthongs/triphthongs: tone goes on the first vowel.
  match = /[aeiou]/i.exec(vie);
  if (match) return put(match.index, 1);
  // Final fallback.
  match = /y/i.exec(vie);
  if (match) return put(match.index, 1);
  return vie;
}

const TONE_MARKS = { 1: COMBINE_MACRON, 2: COMBINE_ACUTE, 3: COMBINE_HOOK_ABOVE, 4: COMBINE_GRAVE, 5: "" };

function convertTonalAstToVie(ast, options, mode) {
  let out = "";
  ast.forEach((syllable, idx) => {
    const tone = syllable.tone ?? 5;
    if (!Object.hasOwn(TONE_MARKS, tone)) throw new Error(`invalid Chinese tone: ${tone}`);

    let vie = syllableToVie(syllable, options, idx === ast.length - 1, mode, followedByConsonantOnly(ast, idx));
    const mark = TONE_MARKS[tone];
    if (mark) {
      const original = vie;
      vie = addTonalMarkToVowel(vie, mark);
      if (vie === original && !/[aeiouyâăêôơưü]/i.test(vie)) {
        throw new Error(`cannot apply tone ${tone} to syllable '${vie}'`);
      }
    }
    if (idx !== 0 && vie) out += "-";
    out += vie;
  });
  return out;
}

/** Parse and convert one pinyin word. */
export function pinyinToVie(pinyin, options, mode) {
  options = { ...(options || {}), language: "ch" };
  rulesForMode(mode, "ch");
  let ast;
  try {
    ast = parsePinyin(pinyin);
  } catch (error) {
    if (error.name === "ParseError") throw new Error(`could not parse pinyin input: ${JSON.stringify(pinyin)}`);
    throw error;
  }
  return { pinyin, ast, vie: convertTonalAstToVie(ast, options, mode) };
}

// ---- Japanese (Hepburn) -----------------------------------------------------

const HEPBURN_LETTERS = "A-Za-zĀĒĪŌŪāēīōū";
const HEPBURN_WORD_RE = new RegExp(`[${HEPBURN_LETTERS}]+(?:['’][${HEPBURN_LETTERS}]+)?`, "g");

function hepburnNasalRealization(following) {
  if (!following) return "nasalized";
  const initial = following.initial || "";
  if (["p", "b", "m"].includes(initial)) return "bilabial";
  if (["k", "g", "ky", "gy"].includes(initial)) return initial === "k" || initial === "g" ? "velar" : "dorso_palatal";
  if (["ch", "j", "ny", "jy"].includes(initial)) return "dorso_palatal";
  if (["t", "d", "ts", "z", "n", "ty", "dy"].includes(initial)) return "alveolar";
  if (initial === "r") return "apical";
  return "nasalized";
}

const contextualInitials = new Map(
  [...hepburnRuleStrong.CONTEXTUAL_INITIAL_MAPPING].map(([[a, b], v]) => [`${a}\u0000${b}`, v]),
);

function convertHepburnWord(ast) {
  const initialMapping = hepburnRuleStrong.INITIAL_MAPPING;
  const nucleusMapping = hepburnRuleStrong.NUCLEUS_MAPPING;
  const endingMapping = hepburnRuleStrong.ENDING_CONSONANT_MAPPING;
  const nasalMapping = hepburnRuleStrong.NASAL_REALIZATION_MAPPING;

  return ast
    .map((syllable) => {
      const { initial, nucleus, ending } = syllable;
      const contextual = contextualInitials.get(`${initial || ""}\u0000${nucleus || ""}`);

      let mappedInitial;
      if (contextual !== undefined) {
        mappedInitial = contextual;
      } else if (initial) {
        mappedInitial = initial === "y" ? "" : initialMapping.get(initial);
        if (mappedInitial === undefined && initial.endsWith("y")) {
          mappedInitial = initialMapping.get(initial.slice(0, -1));
        }
        if (mappedInitial === undefined) throw new Error(`no Hepburn initial mapping for '${initial}'`);
      } else {
        mappedInitial = "";
      }

      let mappedNucleus = [...(nucleus || "")].map((c) => nucleusMapping.get(c) ?? c).join("");
      if (
        contextual === undefined &&
        (initial === "y" || (initial && initial.endsWith("y") && initial !== "ny" && initial !== "jy"))
      ) {
        mappedNucleus = "i" + mappedNucleus;
      }

      const mappedEnding =
        ending === "n" && syllable.nasal_realization
          ? nasalMapping.get(syllable.nasal_realization)
          : (endingMapping.get(ending || "") ?? "");

      return mappedInitial + mappedNucleus + mappedEnding;
    })
    .join("-");
}

const isUpper = (s) => s === s.toUpperCase() && s !== s.toLowerCase();

/**
 * Convert Hepburn text. Nasal context carries across adjacent words, so the
 * whole string is processed at once. Weak/strong makes no difference.
 */
export function hepburnToVie(hepburn, mode) {
  if (mode !== "weak" && mode !== "strong") {
    throw new Error(`mode must be 'weak' or 'strong', got '${mode}'`);
  }

  const matches = [...hepburn.matchAll(HEPBURN_WORD_RE)];
  const parsedWords = matches.map((match) => {
    try {
      return parseHepburn(match[0]);
    } catch (error) {
      if (error instanceof HepburnParseError) {
        throw new Error(`could not parse Hepburn input: ${JSON.stringify(match[0])}`);
      }
      throw error;
    }
  });

  const hasContent = (item) => item.initial || item.nucleus;
  parsedWords.forEach((wordAst, wordIndex) => {
    let nextWordAst = null;
    if (wordIndex + 1 < parsedWords.length) {
      const gap = hepburn.slice(
        matches[wordIndex].index + matches[wordIndex][0].length,
        matches[wordIndex + 1].index,
      );
      if (gap.length > 0 && /^\s+$/.test(gap)) nextWordAst = parsedWords[wordIndex + 1];
    }
    wordAst.forEach((syllable, syllableIndex) => {
      if (syllable.ending !== "n") return;
      let following = wordAst.slice(syllableIndex + 1).find(hasContent);
      if (!following && nextWordAst) following = nextWordAst.find(hasContent);
      syllable.nasal_realization = hepburnNasalRealization(following);
    });
  });

  let out = "";
  const ast = [];
  let cursor = 0;
  matches.forEach((match, i) => {
    out += hepburn.slice(cursor, match.index);
    const word = match[0];
    let vieWord = convertHepburnWord(parsedWords[i]);
    if (isUpper(word)) vieWord = vieWord.toUpperCase();
    else if (isUpper(word.slice(0, 1))) vieWord = vieWord.slice(0, 1).toUpperCase() + vieWord.slice(1);
    out += vieWord;
    ast.push(...parsedWords[i]);
    cursor = match.index + word.length;
  });
  out += hepburn.slice(cursor);
  return { hepburn, ast, vie: out };
}
