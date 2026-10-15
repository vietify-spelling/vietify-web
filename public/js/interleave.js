// Sentence-by-sentence comparison: original / IPA / weak / strong for each sentence.

import { splitSentences } from "./sentences.js";
import { alignSentence } from "./align.js";

/**
 * Returns one entry per sentence: { original, src, ipa, weak, strong, aligned }
 * where each line is a list of {text, group}. A sentence that fails to convert
 * carries `error` instead.
 */
export function interleaveRows(text, language, engine) {
  return splitSentences(text, language).map((original) => {
    try {
      return { original, ...alignSentence(original, language, engine) };
    } catch (error) {
      return { original, error: error.message };
    }
  });
}
