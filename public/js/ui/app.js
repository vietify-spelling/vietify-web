import { loadEspeak, VOICES } from "../espeak.js";
import { LANGUAGES, PHONEMIZED_LANGUAGES, formatBatch, processLines, textToVietify, textToVietifyAll } from "../pipeline.js";
import { DEFAULT_UI_LANGUAGE, LANGUAGE_NAMES, MODES, UI_LANGUAGES, translate } from "../i18n.js";

const $ = (id) => document.getElementById(id);
const els = {
  text: $("text"), language: $("language"), modes: $("modes"), convert: $("convert"),
  status: $("status"), results: $("results"), notes: $("notes"), speak: $("speak"),
  speakLabel: $("speak-label"), file: $("file"), browse: $("browse"), clear: $("clear"),
  fileLabel: $("file-label"), drop: $("drop"), uiLanguage: $("ui-language"),
};

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } },
};

const state = {
  ui: store.get("vietify.ui") in UI_LANGUAGES ? store.get("vietify.ui") : DEFAULT_UI_LANGUAGE,
  engine: null,
  enginePromise: null,
  engineError: null,
  file: null, // { name, text } when a file is loaded (batch mode)
  statusKey: null,
  statusValues: {},
  statusIsError: false,
  lastBatch: null,
  audio: null, // { ctx, source }
};

const t = (key, values) => translate(state.ui, key, values);

// ---- status --------------------------------------------------------------
function setStatus(key, values = {}, isError = false) {
  state.statusKey = key;
  state.statusValues = values;
  state.statusIsError = isError;
  els.status.textContent = t(key, values);
  els.status.classList.toggle("error", isError);
}

// ---- engine --------------------------------------------------------------
function ensureEngine() {
  state.enginePromise ??= loadEspeak().then(
    (engine) => { state.engine = engine; return engine; },
    (error) => { state.engineError = error; throw error; },
  );
  return state.enginePromise;
}

// ---- rendering of static controls ----------------------------------------
function currentLanguage() { return els.language.value; }
function currentMode() { return els.modes.querySelector("input:checked")?.value ?? "all"; }

function renderStaticText() {
  document.documentElement.lang = state.ui;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  els.text.placeholder = t("text_placeholder");

  const language = currentLanguage() || "en-us";
  els.language.replaceChildren(
    ...LANGUAGES.map((code) => new Option(LANGUAGE_NAMES[state.ui][code], code, false, code === language)),
  );

  const mode = currentMode();
  els.modes.replaceChildren(
    ...Object.entries(MODES).map(([value, [emoji, en, vi]]) => {
      const label = document.createElement("label");
      label.className = "mode";
      const input = Object.assign(document.createElement("input"), {
        type: "radio", name: "mode", value, checked: value === mode,
      });
      label.append(input, document.createTextNode(`${emoji} ${state.ui === "vi" ? vi : en}`));
      return label;
    }),
  );
  applyFileModeUi();
  updateSpeakButton();
  if (state.statusKey) setStatus(state.statusKey, state.statusValues, state.statusIsError);
  if (state.lastBatch) renderBatch(state.lastBatch);
  else if (state.lastSingle) renderSingle(state.lastSingle);
}

function applyFileModeUi() {
  els.modes.classList.toggle("disabled", Boolean(state.file));
  els.modes.querySelectorAll("input").forEach((i) => { i.disabled = Boolean(state.file); });
  els.fileLabel.textContent = state.file ? t("file_label", { name: state.file.name }) : t("drop_hint");
  els.text.readOnly = Boolean(state.file);
}

// ---- results -------------------------------------------------------------
function resultBox(titleKeyOrText, value, { emoji } = {}) {
  const box = document.createElement("article");
  box.className = "result";
  const head = document.createElement("div");
  head.className = "row-head";
  const h = document.createElement("h3");
  h.textContent = `${emoji ? emoji + " " : ""}${titleKeyOrText}`;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "btn";
  copy.textContent = t("copy");
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(value); } catch { selectText(out); }
    copy.textContent = t("copied");
    setTimeout(() => { copy.textContent = t("copy"); }, 1200);
  });
  head.append(h, copy);
  const out = document.createElement("output");
  out.textContent = value;
  box.append(head, out);
  return box;
}

function selectText(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function renderNotes({ warnings = [], errors = [] }) {
  const uniqueWarnings = [...new Set(warnings)];
  els.notes.hidden = !uniqueWarnings.length && !errors.length;
  els.notes.classList.toggle("has-errors", errors.length > 0);
  els.notes.replaceChildren();
  for (const [key, items] of [["errors", errors], ["warnings", uniqueWarnings]]) {
    if (!items.length) continue;
    const h = document.createElement("h2");
    h.textContent = t(key);
    const ul = document.createElement("ul");
    ul.replaceChildren(...items.slice(0, 50).map((text) => Object.assign(document.createElement("li"), { textContent: text })));
    els.notes.append(h, ul);
  }
}

function renderSingle(single) {
  state.lastSingle = single;
  state.lastBatch = null;
  const boxes = single.rows.map(({ mode, value }) =>
    resultBox(mode === "ipa" ? t("result_ipa") : mode === "strong" ? t("result_strong") : t("result_weak"), value, {
      emoji: MODES[mode === "ipa" ? "ipa" : mode][0],
    }),
  );
  els.results.replaceChildren(...boxes);
  renderNotes({ warnings: single.warnings });
}

function renderBatch(batch) {
  state.lastBatch = batch;
  state.lastSingle = null;
  const box = document.createElement("article");
  box.className = "result";
  const head = document.createElement("div");
  head.className = "row-head";
  const h = document.createElement("h3");
  h.textContent = `${batch.name} — ${t("lines_done", { count: batch.entries.length })}`;
  const download = document.createElement("button");
  download.type = "button";
  download.className = "btn";
  download.textContent = t("download");
  download.addEventListener("click", () => downloadText(batch.output, batch.name.replace(/\.[^.]*$/, "") + ".vietify.txt"));
  head.append(h, download);
  box.append(head);

  const LIMIT = 200;
  for (const entry of batch.entries.slice(0, LIMIT)) {
    const line = document.createElement("div");
    line.className = "batch-line";
    const src = document.createElement("p");
    src.className = "src";
    src.textContent = `${t("line", { n: entry.line })}: ${entry.text}`;
    const dl = document.createElement("dl");
    for (const [label, value] of [["IPA", entry.ipa], [t("result_strong"), entry.strong], [t("result_weak"), entry.weak]]) {
      const dt = Object.assign(document.createElement("dt"), { textContent: label });
      const dd = Object.assign(document.createElement("dd"), { textContent: value });
      dl.append(dt, dd);
    }
    line.append(src, dl);
    box.append(line);
  }
  if (batch.entries.length > LIMIT) {
    box.append(Object.assign(document.createElement("p"), {
      className: "muted", textContent: `… +${batch.entries.length - LIMIT}`,
    }));
  }
  els.results.replaceChildren(box);

  const errors = batch.entries.flatMap((e) => e.errors.map((m) => `${t("line", { n: e.line })} ${m}`));
  renderNotes({ warnings: batch.entries.flatMap((e) => e.warnings), errors });
}

function downloadText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- convert -------------------------------------------------------------
async function convert() {
  const language = currentLanguage();
  const source = state.file ? state.file.text : els.text.value;
  if (!source.trim()) { setStatus("nothing", {}, true); return; }

  if (PHONEMIZED_LANGUAGES.has(language) && !state.engine) {
    setStatus("loading_engine");
    try { await ensureEngine(); } catch (error) { setStatus("engine_failed", { error: error.message }, true); return; }
  }
  setStatus("working");
  els.convert.disabled = true;
  await new Promise((resolve) => setTimeout(resolve)); // let "Working…" paint
  try {
    if (state.file) {
      const entries = processLines(source, language, state.engine);
      const failed = entries.filter((e) => e.errors.length).length;
      renderBatch({ name: state.file.name, entries, output: formatBatch(entries) });
      setStatus(failed ? "lines_failed" : "lines_done", { count: failed || entries.length }, failed > 0);
    } else {
      const mode = currentMode();
      let rows, warnings;
      if (mode === "all") {
        const all = textToVietifyAll(source, language, state.engine);
        rows = [{ mode: "ipa", value: all.ipa }, { mode: "strong", value: all.strong }, { mode: "weak", value: all.weak }];
        warnings = all.warnings;
      } else {
        const one = textToVietify(source, language, mode, state.engine);
        rows = [{ mode, value: one.output }];
        warnings = one.warnings;
      }
      renderSingle({ rows, warnings });
      setStatus("done");
    }
  } catch (error) {
    console.error(error);
    setStatus("failed", { error: error.message }, true);
  } finally {
    els.convert.disabled = false;
  }
}

// ---- files ---------------------------------------------------------------
async function loadFile(file) {
  if (!file) return;
  let text;
  try {
    text = await file.text();
    if (text.includes("�")) throw new Error("not utf-8");
  } catch {
    setStatus("file_read_failed", {}, true);
    return;
  }
  state.file = { name: file.name, text: text.replace(/^﻿/, "") };
  els.text.value = state.file.text;
  applyFileModeUi();
  setStatus(file.size > 2_000_000 ? "file_too_large" : "file_mode", { mb: (file.size / 1e6).toFixed(1) });
}

function clearFile() {
  state.file = null;
  state.lastBatch = null;
  els.text.value = "";
  els.file.value = "";
  applyFileModeUi();
  setStatus("ready");
}

// ---- speech --------------------------------------------------------------
function updateSpeakButton() {
  const playing = Boolean(state.audio);
  els.speak.setAttribute("aria-pressed", String(playing));
  els.speakLabel.textContent = playing ? t("stop") : t("speak");
  els.speak.disabled = !(currentLanguage() in VOICES);
  els.speak.title = els.speak.disabled ? t("no_voice") : "";
}

function stopSpeech() {
  if (!state.audio) return;
  const { ctx, source } = state.audio;
  state.audio = null;
  try { source.onended = null; source.stop(); } catch { /* already stopped */ }
  ctx.close().catch(() => {});
  updateSpeakButton();
}

async function toggleSpeech() {
  if (state.audio) { stopSpeech(); return; }
  const text = els.text.value.trim();
  if (!text) { setStatus("paste_to_hear"); return; }
  const language = currentLanguage();
  if (!state.engine) {
    setStatus("loading_engine");
    try { await ensureEngine(); } catch (error) { setStatus("engine_failed", { error: error.message }, true); return; }
  }
  try {
    state.engine.setLanguage(language);
    const { samples, sampleRate } = state.engine.synthesize(text);
    if (!samples.length) throw new Error("no audio");
    const ctx = new AudioContext({ sampleRate });
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = stopSpeech;
    state.audio = { ctx, source };
    source.start();
    updateSpeakButton();
    setStatus("speaking", { language: LANGUAGE_NAMES[state.ui][language] });
  } catch (error) {
    console.error(error);
    setStatus("speech_failed", { error: error.message }, true);
  }
}

// ---- wiring --------------------------------------------------------------
els.uiLanguage.replaceChildren(...Object.entries(UI_LANGUAGES).map(([v, name]) => new Option(name, v, false, v === state.ui)));
els.uiLanguage.addEventListener("change", () => {
  state.ui = els.uiLanguage.value;
  store.set("vietify.ui", state.ui);
  renderStaticText();
});
els.convert.addEventListener("click", convert);
els.text.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); convert(); } });
els.language.addEventListener("change", () => { stopSpeech(); updateSpeakButton(); store.set("vietify.lang", currentLanguage()); });
els.speak.addEventListener("click", toggleSpeech);
els.browse.addEventListener("click", () => els.file.click());
els.file.addEventListener("change", () => loadFile(els.file.files[0]));
els.clear.addEventListener("click", clearFile);
for (const type of ["dragenter", "dragover"]) {
  els.drop.addEventListener(type, (e) => { e.preventDefault(); els.drop.classList.add("over"); });
}
for (const type of ["dragleave", "drop"]) {
  els.drop.addEventListener(type, (e) => { e.preventDefault(); els.drop.classList.remove("over"); });
}
els.drop.addEventListener("drop", (e) => loadFile(e.dataTransfer?.files?.[0]));

const savedLanguage = store.get("vietify.lang");
renderStaticText();
if (LANGUAGES.includes(savedLanguage)) { els.language.value = savedLanguage; updateSpeakButton(); }
setStatus("loading_engine");
ensureEngine().then(
  () => { if (state.statusKey === "loading_engine") setStatus("ready"); },
  (error) => setStatus("engine_failed", { error: error.message }, true),
);
