# Vietify (web)

**Give foreign pronunciation a Vietnamese-style spelling — in your browser.**

A static-site port of [Vietify](../vietify). English (UK/US), French, German,
Russian, Mandarin (pinyin), Japanese (Hepburn) and raw IPA, with weak / strong /
IPA output, file batch mode, speech, and a Vietnamese / English interface.
Everything runs client-side; eSpeak NG is compiled to WebAssembly.

## Use

Serve `public/` from any static host (the `.wasm` file must be served as
`application/wasm`; the pages must be served over http(s), not opened as `file://`).

```sh
npm run serve        # http://localhost:8080
```

## Layout

| Path | What |
| --- | --- |
| `public/` | The deployable site (HTML, CSS, JS, WASM) |
| `public/js/core/` | Parsers + converters ported from Python (`converter`, IPA/pinyin/Hepburn parsers) |
| `public/js/phonemize.js` | What `phonemizer` did around eSpeak: punctuation hiding, output tidy-up |
| `public/js/pipeline.js` | Port of `main.py`: phonemize → normalise → convert |
| `public/espeak/` | eSpeak NG 1.51 WASM build + trimmed data (≈ 5 MB, compresses to ≈ 2 MB) |
| `wasm/` | Build script and C glue for the WASM engine |
| `tools/` | Generate rule tables and the Python golden corpus |
| `test/` | Parity tests against the Python implementation |

## Develop

```sh
npm test                 # replays test/golden.json (419 Python results) through the JS code
npm run export:rules     # regenerate rule/grammar tables from ../vietify
npm run export:golden    # regenerate test/golden.json from ../vietify (needs its .venv)
npm run build:wasm       # rebuild public/espeak (needs emsdk download, autotools, espeak-ng 1.51 data)
```

No runtime or build dependencies besides Node ≥ 22 for the tests. See
[PORTING.md](PORTING.md) for the compatibility matrix, design decisions and
known differences.

## Deploy

Copy `public/` to any static host (GitHub Pages, Netlify, S3, nginx…). Paths
are relative, so a sub-path deployment works. Enable gzip/brotli for
`.wasm`, `.data` and `.js` to cut the download to ≈ 2 MB.

## License

GPL-3.0-or-later (it bundles eSpeak NG and ports GPL Vietify). Based on
[ipa-to-vie](https://github.com/vuadu/ipa-to-vie) (MIT) by Rezza Inc.
See `public/NOTICE.txt`.
