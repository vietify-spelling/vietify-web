import test from "node:test";
import assert from "node:assert/strict";
import { splitSentences } from "../public/js/sentences.js";
import { interleaveRows } from "../public/js/interleave.js";
import { getEngine } from "./helpers.js";

test("splits sentences, keeps abbreviations, decimals and quotes together", () => {
  assert.deepEqual(splitSentences("Hello world. How are you? Fine!", "en-us"), ["Hello world.", "How are you?", "Fine!"]);
  assert.deepEqual(splitSentences("Dr. Smith paid 3.5 dollars. Then he left.", "en-us"), ["Dr. Smith paid 3.5 dollars.", "Then he left."]);
  assert.deepEqual(splitSentences("Il dit « Oui. Non. » Puis il part.", "fr"), ["Il dit « Oui. Non. » Puis il part."]);
  assert.deepEqual(splitSentences("Один.\n\nДва", "ru"), ["Один.", "Два"]);
});

test("each sentence gets ipa, weak and strong; failures stay per sentence", async () => {
  const engine = await getEngine();
  const rows = interleaveRows("Hello world. Water.", "en-us", engine);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.ipa && r.weak && r.strong && !r.error));
  const bad = interleaveRows("qqq. xyz.", "ipa", engine);
  assert.ok(bad.some((r) => r.error));
});

test("word alignment: same count, split (numbers), and punctuation", async () => {
  const engine = await getEngine();
  const { alignSentence } = await import("../public/js/align.js");
  const a = alignSentence("Hello, world! I'm fine.", "en-us", engine);
  assert.ok(a.aligned);
  assert.deepEqual(a.src.map((t) => t.group), a.src.map((_, i) => i));
  const b = alignSentence("I have 19,99 dollars", "en-us", engine);
  assert.ok(b.aligned);
  // "19,99" becomes three IPA words that share the original word's group.
  assert.deepEqual(b.ipa.map((t) => t.group), [0, 1, 2, 2, 2, 3]);
  assert.deepEqual(b.weak.map((t) => t.group), b.ipa.map((t) => t.group));
  const c = alignSentence("Bonjour tout le monde", "fr", engine);
  // eSpeak fuses "tout le monde" into one IPA word: those original words share a group.
  assert.ok(c.aligned && c.coarse);
  assert.deepEqual(c.src.map((t) => t.group), [0, 1, 1, 1]);
  assert.deepEqual(c.ipa.map((t) => t.group), [0, 1]);
  assert.deepEqual(c.weak.map((t) => t.group), [0, 1]);
  const d = alignSentence("san mai", "ja", engine);
  assert.ok(d.aligned);
});
