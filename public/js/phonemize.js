// Port of what `phonemizer.phonemize(text, backend="espeak", strip=True,
// preserve_punctuation=True, with_stress=False)` does around the raw eSpeak
// call: split lines, hide punctuation from eSpeak, tidy its output, restore
// the punctuation. `engine.textToPhonemes(chunk)` is the raw eSpeak IPA output
// (phonemes joined by "_", words by " ").

const MARKS = ';:,.!?¡¿—…"«»“”(){}[]';
const DECIMAL_SEPARATORS = ",.";

// Escape a character list for use inside a [...] class (u-flag safe).
const escapeClass = (chars) => chars.replace(/[\\\]^\-[]/g, "\\$&");

const marksRegex = (() => {
  const decimals = [...MARKS].filter((m) => DECIMAL_SEPARATORS.includes(m)).join("");
  const others = [...MARKS].filter((m) => !DECIMAL_SEPARATORS.includes(m)).join("");
  const alternatives = [`[${escapeClass(others)}]`];
  if (decimals) {
    // A , or . between two digits is a decimal separator, not punctuation.
    alternatives.push(`(?<![0-9])[${escapeClass(decimals)}]`, `[${escapeClass(decimals)}](?![0-9])`);
  }
  return new RegExp(`(\\s*(?:${alternatives.join("|")})+\\s*)+`, "gu");
})();

/** Split a line into punctuation-free chunks plus the marks to restore. */
function preserveLine(line, num) {
  const matches = [...line.matchAll(marksRegex)];
  if (matches.length === 0) return [[line], []];
  if (matches.length === 1 && matches[0][0] === line) return [[], [{ index: num, mark: line, position: "A" }]];

  const marks = matches.map((match, i) => {
    let position = "I";
    if (i === 0 && line.startsWith(match[0])) position = "B";
    else if (i === matches.length - 1 && line.endsWith(match[0])) position = "E";
    return { index: num, mark: match[0], position };
  });

  // Split at the first remaining occurrence of each mark's text (as phonemizer does).
  const chunks = [];
  let rest = line;
  for (const { mark } of marks) {
    const at = rest.indexOf(mark);
    chunks.push(rest.slice(0, at));
    rest = rest.slice(at + mark.length);
  }
  return [[...chunks, rest], marks];
}

function preserve(lines) {
  const chunks = [];
  const marks = [];
  lines.forEach((line, num) => {
    const [c, m] = preserveLine(line, num);
    chunks.push(...c);
    marks.push(...m);
  });
  return [chunks.filter((c) => c), marks];
}

/** Reverse of preserve(), for strip=true and a single-space word separator. */
function restore(chunks, marks) {
  const text = [...chunks];
  marks = [...marks];
  const out = [];
  let pos = 0;
  while (text.length || marks.length) {
    if (!marks.length) {
      out.push(...text);
      text.length = 0;
    } else if (!text.length) {
      out.push(marks.map((m) => m.mark).join(""));
      marks = [];
    } else {
      const current = marks[0];
      if (current.index === pos) {
        marks.shift();
        const mark = current.mark;
        if (text[0].endsWith(" ")) text[0] = text[0].slice(0, -1);
        if (current.position === "B") {
          text[0] = mark + text[0];
        } else if (current.position === "E") {
          out.push(text.shift() + mark);
          pos += 1;
        } else if (current.position === "A") {
          out.push(mark);
          pos += 1;
        } else if (text.length === 1) {
          text[0] += mark;
        } else {
          const first = text.shift();
          text[0] = first + mark + text[0];
        }
      } else {
        out.push(text.shift());
        pos += 1;
      }
    }
  }
  return out;
}

const STRESS_RE = /[ˈˌ'-]+/g;

/** eSpeak raw output for one chunk -> IPA words separated by single spaces. */
function postprocessLine(raw) {
  let line = raw.trim().replaceAll("\n", " ").replaceAll("  ", " ");
  line = line.replace(/_+/g, "_").replace(/_ /g, " ");
  if (!line) return { text: "", languageSwitch: false };
  const languageSwitch = /\(.+?\)/.test(line);
  const words = line.split(" ").map((word) => word.trim().replace(STRESS_RE, "").replaceAll("_", ""));
  return { text: words.join(" "), languageSwitch };
}

/**
 * Text -> IPA. Lines are phonemized independently and joined with "\n".
 * Returns { ipa, languageSwitchLines }.
 */
export function phonemize(engine, text) {
  const lines = text
    .replace(/^\n+|\n+$/g, "")
    .split("\n")
    .map((line) => line.replace(/^\n+|\n+$/g, ""))
    .filter((line) => line.trim());
  if (!lines.length) return { ipa: "", languageSwitchLines: [] };

  const [chunks, marks] = preserve(lines);
  const languageSwitchLines = [];
  const phonemized = chunks.map((chunk, i) => {
    const { text: out, languageSwitch } = postprocessLine(engine.textToPhonemes(chunk));
    if (languageSwitch) languageSwitchLines.push(i + 1);
    return out;
  });
  return { ipa: restore(phonemized, marks).join("\n"), languageSwitchLines };
}
