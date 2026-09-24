/** C0 and C1 control characters, including line breaks and tabs. */
const isControl = (ch: string) => {
  const code = ch.codePointAt(0)!;
  return code < 0x20 || (code >= 0x7f && code <= 0x9f);
};
export const hasControl = (s: string) => Array.from(s).some(isControl);
/** Replaces every run of control characters with one space. */
export const flattenControl = (s: string) =>
  Array.from(s, (ch) => (isControl(ch) ? '\n' : ch))
    .join('')
    .replace(/\n+/g, ' ');
