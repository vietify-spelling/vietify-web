// Sentence segmentation, ported from bilingual-interleave/docs/interleave-core.js
// (splitBlock / splitSentenceList). Language detection is dropped: Vietify already
// knows the input language. Blank lines always end a sentence.

const LANGS = {
  en: {
    abbr: "mr mrs ms dr prof sr jr st vs etc inc ltd co no fig vol approx dept al cf jan feb mar apr jun jul aug sep sept oct nov dec gen gov sen rep rev hon capt col lt sgt mt ft ave blvd rd est min max ed eds pp ch sec",
    quotes: [],
  },
  fr: {
    abbr: "m mm mme mmes mlle mlles dr pr prof st ste etc cf p pp env av apr art éd vol ch chap n° no tel fig cie ex suiv",
    quotes: [["«", "»"]],
  },
  de: {
    abbr: "z.b d.h u.a usw bzw ca evtl ggf inkl nr str dr prof hr fr vgl sog bspw mio mrd tel std min max abb kap bd ff geb dipl ing etc",
    quotes: [],
  },
  ru: {
    abbr: "г гг ул им руб тыс млн млрд см напр др проф стр рис т п д к тов гр пр обл акад доц св сокр ср",
    quotes: [["«", "»"]],
  },
};
for (const l of Object.values(LANGS)) l.abbrSet = new Set(l.abbr.split(/\s+/).filter(Boolean));

/** Vietify input language -> sentence-rule set. Pinyin/Hepburn/IPA are Latin text: use English rules. */
export function sentenceRulesFor(language) {
  if (language === "fr" || language === "de" || language === "ru") return language;
  return "en";
}

const BLANK_LINE_SPLIT_RE = /\n\s*\n/;
const COMMON_PAIRS = [["「", "」"], ["『", "』"], ["（", "）"], ["【", "】"], ["《", "》"]];
const CLOSERS = "\"'”’»›)\\]」』）】";
const TERM_RE = new RegExp(`[.!?…。！？]+[${CLOSERS}]*`, "gu");
const CJK_TERM_RE = /[。！？]/;
const CLOSER_ONLY_RE = new RegExp(`[${CLOSERS}]+$`, "u");
const LEAD_RE = /^[\s"'“‘„«»「『（(\[【《¿¡—–\-…]+/u;

const isLowerLetter = (ch) => ch !== ch.toUpperCase() && ch === ch.toLowerCase();
const count = (str, sub) => str.split(sub).length - 1;

function tokenBefore(text, index) {
  const m = /([\p{L}\p{N}.°]+)$/u.exec(text.slice(0, index));
  return m ? m[1].toLowerCase().replace(/\.$/, "") : "";
}

function insideQuote(span, lang) {
  for (const [open, close] of COMMON_PAIRS.concat(LANGS[lang].quotes)) {
    if (count(span, open) > count(span, close)) return true;
  }
  return false;
}

function splitBlock(block, lang) {
  const L = LANGS[lang];
  const out = [];
  let start = 0;
  let m;
  TERM_RE.lastIndex = 0;
  while ((m = TERM_RE.exec(block)) !== null) {
    const end = m.index + m[0].length;
    const cjkTerm = CJK_TERM_RE.test(m[0]);
    const ws = /^\s*/.exec(block.slice(end))[0];
    if (!cjkTerm && !ws) continue; // "3.5", "e.g.x": not a boundary
    const after = block.slice(end + ws.length);
    if (after === "") break;
    if (insideQuote(block.slice(start, end), lang)) continue;

    const closers = CLOSER_ONLY_RE.exec(m[0]);
    const core = closers ? m[0].slice(0, m[0].length - closers[0].length) : m[0];

    if (!cjkTerm) {
      const first = after.replace(LEAD_RE, "")[0];
      if (first === undefined) continue;
      if (isLowerLetter(first)) continue; // a lowercase start never begins a sentence
      if (core === ".") {
        const tok = tokenBefore(block, m.index);
        if (L.abbrSet.has(tok)) continue;
        if (/^\p{L}$/u.test(tok)) continue; // initials
        if (/^\p{L}(\.\p{L})+$/u.test(tok)) continue; // "U.S.", "z.B."
        if (lang === "de" && /^\d{1,2}$/.test(tok)) continue; // German ordinals
        if (/\d/.test(first) && /\d$/.test(tok)) continue;
      }
    }
    out.push(block.slice(start, end).trim());
    start = end + ws.length;
    TERM_RE.lastIndex = start;
  }
  const tail = block.slice(start).trim();
  if (tail) out.push(tail);
  return out.filter(Boolean);
}

/** Split text into sentences for a Vietify language code. */
export function splitSentences(text, language) {
  const lang = sentenceRulesFor(language);
  const out = [];
  for (const block of text.replace(/\r\n?/g, "\n").split(BLANK_LINE_SPLIT_RE)) {
    if (block.trim()) out.push(...splitBlock(block, lang));
  }
  return out;
}
