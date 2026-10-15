import { fileURLToPath } from "node:url";
import { loadEspeak } from "../public/js/espeak.js";

const espeakDir = new URL("../public/espeak/", import.meta.url);

let engine;
/** Shared eSpeak WASM engine for tests (loaded from disk, no server needed). */
export async function getEngine() {
  engine ??= await loadEspeak({ locateFile: (file) => fileURLToPath(new URL(file, espeakDir)) });
  return engine;
}
