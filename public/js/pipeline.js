// Port of vietify/main.py: text -> eSpeak IPA -> normalised IPA -> Vietnamese.
//
// `engine` is an Espeak instance (js/espeak.js); it is only touched for
// languages that need phonemizing.

import { phonemize } from "./phonemize.js";
import { applyFrenchLiaison, hepburnToVie, ipaToVie, pinyinToVie } from "./core/converter.js";

export const PHONEMIZED_LANGUAGES = new Set(["en-gb", "en-us", "fr", "de", "ru"]);
export const LANGUAGES = ["en-gb", "en-us", "fr", "de", "ru", "ch", "ja", "ipa"];
export const MODES = ["weak", "strong", "ipa"];

/** eSpeak quirks -> canonical IPA the grammar understands. */
export function normalizePhonemizedIpa(ipa, language, { preserveNasalization = false } = {}) {
  // ʔ is ignored entirely: it is dropped rather than converted.
  let n = ipa.replaceAll("ː", "").replaceAll('"', "").replaceAll("ʔ", "");
  for (const consonant of ["n", "m", "l", "ŋ"]) {
    // Syllabic consonant (combining vertical line below) -> schwa + consonant.
    n = n.replaceAll(consonant + "̩", "ə" + consonant);
  }
  if (!preserveNasalization) n = n.replaceAll("̃", "");

  // Russian has no /y/, but eSpeak uses that letter for /ɨ/.
  if (language === "ru") n = n.replaceAll("y", "ɨ");

  n = n
    // english
    .replaceAll("ɚ", "əɹ")
    .replaceAll("ɜ", "ə")
    .replaceAll("ᵻ", "ɪ")
    .replaceAll("ɾ", "r")
    .replaceAll("ʌ", "ɔ")
    // russian
    .replaceAll("ɭ", "l");
  // Palatalised consonants (C + modifier letter small j) -> Cj. Same list and
  // order as the Python version.
  for (const c of ["m", "n", "t", "d", "k", "ɡ", "p", "b", "f", "v", "s", "z", "ʂ", "ʐ", "x", "l", "r", "tʃ"]) {
    n = n.replaceAll(c + "ʲ", c + "j");
  }
  return n;
}

const NON_WORD = "[^\\p{L}\\p{N}_\\u0300-\\u036f]";
const WORD_PARTS = new RegExp(`^(${NON_WORD}*)(.*?)(${NON_WORD}*)$`, "u");
const UNDECODABLE = ["?", "�"];

function phonemizeText(text, language, engine, warnings) {
  if (language === "ch" || language === "ja" || language === "ipa") return text;
  if (!engine) throw new Error("the eSpeak engine is not loaded");
  engine.setLanguage(language);
  const { ipa, languageSwitchLines } = phonemize(engine, text);
  if (languageSwitchLines.length) {
    warnings.push(`${languageSwitchLines.length} chunk(s) contain eSpeak language switches "(xx)"`);
  }
  return ipa;
}

function normalizePronunciation(pronunciation, language) {
  if (language === "ch" || language === "ja") return pronunciation;
  return normalizePhonemizedIpa(pronunciation, language, { preserveNasalization: language === "fr" });
}

function convertPronunciation(pronunciation, language, mode, warnings) {
  if (language === "ja") return hepburnToVie(pronunciation, mode).vie;

  let words = [];
  for (const word of pronunciation.split(/\s+/).filter(Boolean)) {
    const match = WORD_PARTS.exec(word);
    if (!match || !match[2]) {
      words.push({ vie: word });
      continue;
    }
    const [, leading, core, trailing] = match;
    let body = core;

    if (body.includes("(") || body.includes(")")) {
      warnings.push(`language-switch markers in "${word}" (non-pure input); left unconverted`);
      words.push({ vie: word });
      continue;
    }
    if (UNDECODABLE.some((c) => body.includes(c))) {
      warnings.push(`eSpeak output contains undecodable characters in "${word}"; ignored them`);
      body = [...body].filter((c) => !UNDECODABLE.includes(c)).join("");
      if (!body) {
        words.push({ vie: leading + trailing });
        continue;
      }
    }

    let vie;
    if (language === "ch") {
      vie = pinyinToVie(body, {}, mode).vie;
    } else {
      const results = ipaToVie(body, { language }, mode);
      if (!results.length) throw new Error(`could not convert IPA text: ${JSON.stringify(body)}`);
      vie = results.map((r) => r.vie).join("-");
    }
    words.push({ vie: leading + vie + trailing });
  }

  if (language === "fr") words = applyFrenchLiaison(words);
  return words.map((w) => w.vie).join(" ");
}

/** Convert one text. mode: "weak" | "strong" | "ipa". Returns { output, warnings }. */
export function textToVietify(text, language, mode, engine) {
  const warnings = [];
  const pronunciation = phonemizeText(text, language, engine, warnings);
  if (mode === "ipa") return { output: pronunciation, warnings };
  const normalized = normalizePronunciation(pronunciation, language);
  return { output: convertPronunciation(normalized, language, mode, warnings), warnings };
}

/** IPA, strong and weak for one text, phonemizing once. */
export function textToVietifyAll(text, language, engine) {
  const warnings = [];
  const ipa = phonemizeText(text, language, engine, warnings);
  const normalized = normalizePronunciation(ipa, language);
  return {
    ipa,
    strong: convertPronunciation(normalized, language, "strong", warnings),
    weak: convertPronunciation(normalized, language, "weak", warnings),
    warnings,
  };
}

/**
 * Batch mode (main.py:process_text_file): every non-empty line becomes
 * {text, ipa, strong, weak, errors}. A failing step leaves that field blank
 * and records an error; the rest of the batch still runs.
 */
export function processLines(input, language, engine) {
  const entries = [];
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const entry = { line: i + 1, text: raw, ipa: "", strong: "", weak: "", errors: [], warnings: [] };
    entries.push(entry);

    let normalized = null;
    try {
      entry.ipa = phonemizeText(raw, language, engine, entry.warnings);
    } catch (error) {
      entry.errors.push(`IPA: ${error.message}`);
      entry.ipa = raw;
      return;
    }
    try {
      normalized = normalizePronunciation(entry.ipa, language);
    } catch (error) {
      entry.errors.push(`normalization: ${error.message}`);
      return;
    }
    for (const mode of ["strong", "weak"]) {
      try {
        entry[mode] = convertPronunciation(normalized, language, mode, entry.warnings);
      } catch (error) {
        entry.errors.push(`${mode}: ${error.message}`);
      }
    }
  });
  return entries;
}

/** Serialise batch results like the CLI's --output-file (text, ipa, strong, weak, blank). */
export function formatBatch(entries) {
  return entries.flatMap((e) => [e.text, e.ipa, e.strong, e.weak, "\n"]).join("\n") + "\n";
}
