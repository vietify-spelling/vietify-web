#!/usr/bin/env bash
# Build espeak-ng 1.51 (the version Debian/Ubuntu ship, which the Python
# version of Vietify phonemizes with) to WebAssembly, plus a trimmed data pack.
#
# Needs: git, autoconf, automake, libtool, make, an installed espeak-ng 1.51
# (only for its espeak-ng-data directory). Downloads emsdk + espeak-ng sources
# into $WORK (default ./.build). Output: ../public/espeak/
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${WORK:-$HERE/.build}"
DATA_SRC="${ESPEAK_DATA:-/usr/lib/x86_64-linux-gnu/espeak-ng-data}"
OUT="$HERE/../public/espeak"
EMSDK_VERSION=3.1.74
ESPEAK_TAG=1.51

mkdir -p "$WORK" "$OUT"
cd "$WORK"
[ -d emsdk ] || git clone --depth 1 https://github.com/emscripten-core/emsdk.git
./emsdk/emsdk install "$EMSDK_VERSION" >/dev/null && ./emsdk/emsdk activate "$EMSDK_VERSION" >/dev/null
EMSDK_QUIET=1 source ./emsdk/emsdk_env.sh >/dev/null
[ -d espeak-ng ] || git clone --depth 1 --branch "$ESPEAK_TAG" https://github.com/espeak-ng/espeak-ng.git

cd espeak-ng
if [ ! -f config.h ]; then
  ./autogen.sh
  emconfigure ./configure --without-async --without-mbrola --without-sonic \
    --without-pcaudiolib --without-klatt --without-speechplayer \
    --disable-shared --enable-static
fi

SRCS="$(ls src/ucd-tools/src/*.c)
$(for f in compiledata compiledict dictionary encoding error espeak_api ieee80 intonation mnemonics numbers readclause phoneme phonemelist setlengths soundicon spect speech ssml synthdata synthesize synth_mbrola translate tr_languages voices wavegen; do echo src/libespeak-ng/$f.c; done)"

# Trimmed data: tables, the dictionaries and voices of the supported languages.
DATA="$WORK/data/espeak-ng-data"
rm -rf "$WORK/data"; mkdir -p "$DATA"/lang/{gmw,roa,zle,sit,jpx}
for f in phondata phonindex phontab intonations en_dict fr_dict de_dict ru_dict cmn_dict ja_dict; do cp "$DATA_SRC/$f" "$DATA/"; done
cp "$DATA_SRC"/lang/gmw/{en,en-US,en-GB-x-rp,de} "$DATA/lang/gmw/"
cp "$DATA_SRC/lang/roa/fr" "$DATA/lang/roa/"
cp "$DATA_SRC/lang/zle/ru" "$DATA/lang/zle/"
cp "$DATA_SRC/lang/sit/cmn" "$DATA/lang/sit/"
cp "$DATA_SRC/lang/jpx/ja" "$DATA/lang/jpx/"

emcc -O2 -I. -Isrc/include -Isrc/ucd-tools/src/include -Isrc/libespeak-ng \
  -DHAVE_CONFIG_H -DPATH_ESPEAK_DATA='"/espeak-ng-data"' \
  $SRCS "$HERE/vietify_espeak.c" -o "$OUT/espeak.js" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createEspeak \
  -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=33554432 \
  -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,FS,UTF8ToString,HEAP16 \
  -sFILESYSTEM=1 -sSINGLE_FILE=0 \
  --preload-file "$WORK/data/espeak-ng-data@/espeak-ng-data"
echo "built -> $OUT"
