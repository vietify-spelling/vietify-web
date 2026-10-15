"""Run the Python reference implementation over a corpus and save the results.

    python tools/make_golden.py [path/to/vietify]   ->  test/golden.json

The JS test-suite (test/parity.test.js) replays every case through the browser
code and requires identical output. Needs the Python vietify (with phonemizer
and eSpeak NG) installed; regenerate whenever the Python rules change.
"""
import json
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
repo = Path(sys.argv[1]) if len(sys.argv) > 1 else here.parent.parent / "vietify"
sys.path.insert(0, str(repo / "src"))

from vietify import main as vm  # noqa: E402

EXTRA = {
    "en-us": [
        "Hello world", "Hello, world!", "The quick brown fox jumps over the lazy dog.",
        "I have 3 apples and 19,99 dollars", "It costs 1.5 million.", "(wow) really?!",
        "Yes — no… maybe; \"quoted\" text", "water\nbutter\n\nmarket", "A", "x", "!!!", "  spaces   around  ",
        "Worcestershire", "squirrel", "rhythm", "thought through", "knowledge", "cat's", "e-mail", "don't",
    ],
    "en-gb": ["Hello world", "Schedule a laboratory", "Birmingham, England.", "water"],
    "fr": [
        "Bonjour tout le monde", "Les amis arrivent", "Ils ont un enfant", "J'aime le football",
        "Un grand homme", "Elle est allée à Paris, n'est-ce pas ?", "vingt-et-un", "quatre-vingt-dix",
    ],
    "de": ["Guten Tag", "Ich habe einen Hund", "Schönes Mädchen", "Straße und Bücher", "Wir fahren nach Hause."],
    "ru": ["Привет, мир", "Спасибо", "Я люблю тебя!", "Щи да каша", "Объявление"],
    "ch": [
        "ni3 hao3", "nǐ hǎo", "zhong1 guo2", "Zhōngguó", "xue2 xi2", "lüè", "nv3", "shi4", "ri4", "zi4 ji3",
        "yuan2", "jun1", "bo1 mo1", "ma", "xiong2 mao1", "Beijing", "hello", "a1 yi2!", "wo3 ai4 ni3.",
        "ni3 hao3 ma5", "zhi1", "er2", "lie4", "qu4", "ruan3",
    ],
    "ja": [
        "konnichiwa", "san mai.", "sanpai", "genki desu ka", "Tōkyō", "Nihon", "arigatō gozaimasu",
        "sanchō", "shinbun", "kyō", "ryokan", "san'ya", "SAKURA", "Fuji-san", "hon wo yomu", "jisho",
    ],
    "ipa": [
        "həlˈoʊ", "wˈɜːld", "ʃˈiː", "bɔ̃ʒˈuʁ", "ˈɛlɪfənt", "ˈdʒæk", "ˌɪntərˈnæʃənəl", "tʃˈɛk", "θɪŋk", "ˈhɔɪ",
        "/ˈkæt/", "ˈskɹæm", "pfˈɛrt", "ˈɕi", "straight, forward",
    ],
}

# Plain-error probes: inputs the Python code is expected to reject.
ERRORS = {"ja": ["xyz", "sja"], "ch": ["qqqq1x"], "ipa": ["qqq"]}

cases = []


def add(lang, text):
    entry = {"lang": lang, "text": text}
    try:
        ipa = vm._text_to_pronunciation(text, lang)
        norm = vm._normalize_pronunciation(ipa, lang)
        entry["ipa"] = ipa
        entry["strong"] = vm._convert_pronunciation(norm, lang, "strong")
        entry["weak"] = vm._convert_pronunciation(norm, lang, "weak")
    except Exception as error:  # noqa: BLE001 - recording any failure is the point
        entry["error"] = type(error).__name__
    cases.append(entry)


corpus = repo / "test" / "testcases"
for lang_dir in sorted(corpus.iterdir()):
    lang = lang_dir.name
    if lang not in vm.LANGUAGE_CHOICES:
        continue
    for file in sorted(lang_dir.glob("*.txt")):
        for line in file.read_text(encoding="utf-8").splitlines():
            if line.strip():
                add(lang, line)

for lang, texts in {**EXTRA}.items():
    for text in texts:
        add(lang, text)
for lang, texts in ERRORS.items():
    for text in texts:
        add(lang, text)

seen, unique = set(), []
for c in cases:
    key = (c["lang"], c["text"])
    if key not in seen:
        seen.add(key)
        unique.append(c)

out = here.parent / "test" / "golden.json"
out.write_text(json.dumps(unique, ensure_ascii=False, indent=0), encoding="utf-8")
errors = sum("error" in c for c in unique)
print(f"wrote {out}: {len(unique)} cases, {errors} expected errors")
