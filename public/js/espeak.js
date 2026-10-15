// Loader and thin wrapper for the eSpeak NG WebAssembly build (see wasm/).

// Language code (CLI/UI) -> eSpeak voice identifier. These are the identifiers
// phonemizer resolves for fr-fr, en-us, ... on eSpeak NG 1.51.
export const VOICES = {
  "en-gb": "gmw/en",
  "en-us": "gmw/en-US",
  fr: "roa/fr",
  de: "gmw/de",
  ru: "zle/ru",
  ch: "sit/cmn",
  ja: "jpx/ja",
};

export class Espeak {
  #m;
  #voice = null;
  #cwrap(name, ret, args) {
    return this.#m.cwrap(name, ret, args);
  }

  constructor(module) {
    this.#m = module;
    this._phonemize = this.#cwrap("vf_phonemize", "string", ["string"]);
    this._setVoice = this.#cwrap("vf_set_voice", "number", ["string"]);
    this._synth = this.#cwrap("vf_synth", "number", ["string"]);
    this._pcm = this.#cwrap("vf_pcm", "number", []);
    const rate = this.#cwrap("vf_init", "number", ["string"])("/");
    if (rate <= 0) throw new Error(`eSpeak failed to initialise (${rate})`);
    this.sampleRate = rate;
  }

  /** Select the voice for a Vietify language code. */
  setLanguage(language) {
    const voice = VOICES[language];
    if (!voice) throw new Error(`no eSpeak voice for language '${language}'`);
    if (voice === this.#voice) return;
    const status = this._setVoice(voice);
    if (status !== 0) throw new Error(`eSpeak voice '${voice}' not found (${status})`);
    this.#voice = voice;
  }

  /** Raw IPA with "_" between phonemes (what phonemizer reads from eSpeak). */
  textToPhonemes(text) {
    return this._phonemize(text);
  }

  /** Speak text with the current voice -> { samples: Int16Array, sampleRate }. */
  synthesize(text) {
    const count = this._synth(text);
    if (count < 0) throw new Error("eSpeak could not synthesise this text");
    const start = this._pcm() >> 1;
    return { samples: this.#m.HEAP16.slice(start, start + count), sampleRate: this.sampleRate };
  }
}

/**
 * Load the module. In the browser, files resolve next to this script; in Node
 * (tests) pass `locateFile` returning filesystem paths.
 */
export async function loadEspeak({ locateFile } = {}) {
  const base = new URL("../espeak/", import.meta.url);
  const { default: createEspeak } = await import(new URL("espeak.js", base).href);
  const module = await createEspeak({ locateFile: locateFile ?? ((file) => new URL(file, base).href) });
  return new Espeak(module);
}
