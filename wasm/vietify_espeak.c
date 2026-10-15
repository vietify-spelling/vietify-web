/*
 * Thin C layer over libespeak-ng for the Vietify web app.
 *
 * vf_phonemize mirrors what phonemizer's EspeakWrapper.text_to_phonemes does
 * (espeak_TextToPhonemes in a loop, IPA mode, '_' between phonemes), so the
 * browser sees the same raw espeak output as the Python version.
 * vf_synth renders speech to 16-bit mono PCM (synchronous build, no audio device).
 */
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>
#include <espeak-ng/speak_lib.h>

static char *out = NULL;
static size_t out_len = 0, out_cap = 0;

static void out_reset(void) { out_len = 0; if (out) out[0] = 0; }

static void out_append(const char *s, size_t n) {
    if (out_len + n + 1 > out_cap) {
        out_cap = (out_len + n + 1) * 2;
        out = realloc(out, out_cap);
    }
    memcpy(out + out_len, s, n);
    out_len += n;
    out[out_len] = 0;
}

EMSCRIPTEN_KEEPALIVE
int vf_init(const char *data_path) {
    /* returns sample rate (>0) or a negative error */
    return espeak_Initialize(AUDIO_OUTPUT_SYNCHRONOUS, 0, data_path,
                             espeakINITIALIZE_DONT_EXIT);
}

EMSCRIPTEN_KEEPALIVE
int vf_set_voice(const char *name) {
    return (int)espeak_SetVoiceByName(name);
}

EMSCRIPTEN_KEEPALIVE
const char *vf_phonemize(const char *text) {
    const void *cursor = text;
    int first = 1;
    out_reset();
    while (cursor != NULL) {
        const char *ph = espeak_TextToPhonemes(&cursor, espeakCHARS_UTF8,
                                               ('_' << 8) | 0x02);
        if (ph && *ph) {
            if (!first) out_append(" ", 1);
            out_append(ph, strlen(ph));
            first = 0;
        }
    }
    if (!out) out_append("", 0);
    return out;
}

/* ---- speech ---- */
static short *pcm = NULL;
static size_t pcm_len = 0, pcm_cap = 0;

static int synth_cb(short *wav, int numsamples, espeak_EVENT *events) {
    (void)events;
    if (!wav || numsamples <= 0) return 0;
    if (pcm_len + numsamples > pcm_cap) {
        pcm_cap = (pcm_len + numsamples) * 2;
        pcm = realloc(pcm, pcm_cap * sizeof(short));
    }
    memcpy(pcm + pcm_len, wav, numsamples * sizeof(short));
    pcm_len += numsamples;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int vf_synth(const char *text) {
    /* returns number of samples; read with vf_pcm() */
    pcm_len = 0;
    espeak_SetSynthCallback(synth_cb);
    espeak_ERROR e = espeak_Synth(text, strlen(text) + 1, 0, POS_CHARACTER, 0,
                                  espeakCHARS_UTF8, NULL, NULL);
    if (e != EE_OK) return -1;
    espeak_Synchronize();
    return (int)pcm_len;
}

EMSCRIPTEN_KEEPALIVE
const short *vf_pcm(void) { return pcm; }

EMSCRIPTEN_KEEPALIVE
const char *vf_version(void) { return espeak_Info(NULL); }
