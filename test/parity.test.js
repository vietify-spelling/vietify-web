// Replays the corpus produced by the Python reference implementation
// (tools/make_golden.py) through the browser code and demands identical output.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { textToVietifyAll } from "../public/js/pipeline.js";
import { getEngine } from "./helpers.js";

const golden = JSON.parse(readFileSync(new URL("./golden.json", import.meta.url), "utf8"));
const engine = await getEngine();

const byLang = Object.groupBy(golden, (c) => c.lang);
for (const [lang, cases] of Object.entries(byLang)) {
  test(`parity: ${lang} (${cases.length} cases)`, () => {
    const failures = [];
    for (const c of cases) {
      let got;
      try {
        got = textToVietifyAll(c.text, lang, engine);
      } catch (error) {
        got = { error: error.message };
      }
      if (c.error) {
        if (!got.error) failures.push({ text: c.text, expected: `error ${c.error}`, got });
        continue;
      }
      for (const field of ["ipa", "strong", "weak"]) {
        if (got[field] !== c[field]) {
          failures.push({ text: c.text, field, expected: c[field], got: got[field] ?? got.error });
        }
      }
    }
    assert.deepEqual(failures.slice(0, 10), [], `${failures.length}/${cases.length} cases differ`);
  });
}
