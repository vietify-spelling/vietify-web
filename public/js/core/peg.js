// Minimal PEG helpers. A matcher is (text, index) -> end index, or -1 on failure.
// Ordered choice commits to the first literal that matches (no backtracking
// into it), exactly like parsimonious' OneOf.

export const oneOf = (literals) => (text, i) => {
  for (const literal of literals) {
    if (text.startsWith(literal, i)) return i + literal.length;
  }
  return -1;
};

export const optional = (matcher) => (text, i) => {
  const end = matcher(text, i);
  return end < 0 ? i : end;
};

export const star = (matcher) => (text, i) => {
  for (;;) {
    const end = matcher(text, i);
    if (end < 0 || end === i) return i;
    i = end;
  }
};

export class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "ParseError";
  }
}
