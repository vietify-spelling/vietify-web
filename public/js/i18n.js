// Interface text in Vietnamese (default) and English. Mirrors the desktop GUI.

export const DEFAULT_UI_LANGUAGE = "vi";
export const UI_LANGUAGES = { vi: "Tiếng Việt", en: "English" };

// value -> [emoji, English label, Vietnamese label]
export const MODES = {
  all: ["😊", "Default (all three results)", "Mặc định (cả ba kết quả)"],
  weak: ["🤓", "Weak", "Sát"],
  strong: ["🤪", "Strong", "Việt hóa mạnh"],
  ipa: ["💯", "IPA", "IPA"],
};

export const LANGUAGE_NAMES = {
  en: {
    "en-gb": "English (UK)", "en-us": "English (US)", fr: "French", de: "German", ru: "Russian",
    ch: "Chinese (pinyin)", ja: "Japanese (Hepburn)", ipa: "Input is IPA",
  },
  vi: {
    "en-gb": "Tiếng Anh (Anh)", "en-us": "Tiếng Anh (Mỹ)", fr: "Tiếng Pháp", de: "Tiếng Đức", ru: "Tiếng Nga",
    ch: "Tiếng Trung (pinyin)", ja: "Tiếng Nhật (Hepburn)", ipa: "Đầu vào là IPA",
  },
};

export const STRINGS = {
  en: {
    tagline: "Give foreign pronunciation a Vietnamese-style spelling.",
    text_heading: "Text to convert",
    text_placeholder: "Type or paste text…",
    drop_hint: "Drop a text file here, or use Browse",
    file_label: "File: {name}",
    browse: "Browse",
    clear: "Clear",
    language: "Language",
    output_mode: "Output mode",
    convert: "Convert",
    convert_hint: "Ctrl+Enter",
    ready: "Type or paste text, or drop/browse a file.",
    file_mode: "File input gives IPA, strong and weak for every line, as the CLI does.",
    loading_engine: "Loading the eSpeak engine…",
    engine_failed: "Could not load the eSpeak engine: {error}",
    engine_needed: "This language needs the eSpeak engine, which is still loading.",
    working: "Working…",
    done: "Done.",
    failed: "Failed: {error}",
    nothing: "Nothing to convert.",
    lines_done: "{count} line(s) converted.",
    lines_failed: "{count} line(s) had errors.",
    download: "Download result (.txt)",
    copy: "Copy",
    copied: "Copied",
    speak: "Speak",
    stop: "Stop",
    speaking: "Speaking ({language})…",
    paste_to_hear: "Type some text to hear it.",
    no_voice: "There is no voice for this input type.",
    speech_failed: "Could not speak: {error}",
    result_ipa: "IPA",
    result_strong: "Strong",
    result_weak: "Weak",
    warnings: "Warnings",
    errors: "Errors",
    line: "Line {n}",
    file_too_large: "That file is large ({mb} MB); conversion may take a while.",
    file_read_failed: "Could not read that file as UTF-8 text.",
    about: "Runs entirely in your browser — nothing you type is sent anywhere.",
    credits:
      "Based on vuadu/ipa-to-vie (MIT). Pronunciation by eSpeak NG compiled to WebAssembly. Licensed GPL-3.0-or-later.",
    source: "Source & notes",
    interface_language: "Interface language",
  },
  vi: {
    tagline: "Phiên âm tiếng nước ngoài theo cách đánh vần tiếng Việt.",
    text_heading: "Văn bản cần chuyển đổi",
    text_placeholder: "Nhập hoặc dán văn bản…",
    drop_hint: "Thả tệp văn bản vào đây, hoặc bấm Chọn tệp",
    file_label: "Tệp: {name}",
    browse: "Chọn tệp",
    clear: "Xóa",
    language: "Ngôn ngữ",
    output_mode: "Chế độ xuất",
    convert: "Chuyển đổi",
    convert_hint: "Ctrl+Enter",
    ready: "Nhập hoặc dán văn bản, hoặc thả/chọn một tệp.",
    file_mode: "Tệp đầu vào luôn xuất IPA, Việt hóa mạnh và Sát cho từng dòng, giống dòng lệnh.",
    loading_engine: "Đang tải bộ máy eSpeak…",
    engine_failed: "Không tải được bộ máy eSpeak: {error}",
    engine_needed: "Ngôn ngữ này cần bộ máy eSpeak, đang tải.",
    working: "Đang xử lý…",
    done: "Xong.",
    failed: "Thất bại: {error}",
    nothing: "Không có gì để chuyển đổi.",
    lines_done: "Đã chuyển đổi {count} dòng.",
    lines_failed: "{count} dòng bị lỗi.",
    download: "Tải kết quả (.txt)",
    copy: "Sao chép",
    copied: "Đã chép",
    speak: "Đọc",
    stop: "Dừng",
    speaking: "Đang đọc ({language})…",
    paste_to_hear: "Nhập văn bản để nghe.",
    no_voice: "Kiểu đầu vào này không có giọng đọc.",
    speech_failed: "Không đọc được: {error}",
    result_ipa: "IPA",
    result_strong: "Việt hóa mạnh",
    result_weak: "Sát",
    warnings: "Cảnh báo",
    errors: "Lỗi",
    line: "Dòng {n}",
    file_too_large: "Tệp khá lớn ({mb} MB); việc chuyển đổi có thể mất thời gian.",
    file_read_failed: "Không đọc được tệp này dưới dạng văn bản UTF-8.",
    about: "Chạy hoàn toàn trong trình duyệt — không có gì bạn nhập bị gửi đi.",
    credits:
      "Dựa trên vuadu/ipa-to-vie (MIT). Phát âm bởi eSpeak NG biên dịch sang WebAssembly. Giấy phép GPL-3.0-or-later.",
    source: "Mã nguồn & ghi chú",
    interface_language: "Ngôn ngữ giao diện",
  },
};

export function translate(uiLanguage, key, values = {}) {
  const table = STRINGS[uiLanguage] ?? STRINGS[DEFAULT_UI_LANGUAGE];
  const template = table[key] ?? STRINGS.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}
