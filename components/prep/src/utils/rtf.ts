/**
 * RTF declares an ANSI (single-byte, e.g. cp1252) character set via \ansi, so any
 * literal multi-byte UTF-8 character embedded as-is (em dashes, curly quotes, etc.)
 * gets misread byte-by-byte by RTF consumers — e.g. an em dash's UTF-8 bytes
 * (0xE2 0x80 0x94) render as "â€”". The RTF spec's fix is to represent those
 * characters as \uN control words instead of raw bytes.
 */
export function escapeNonAsciiForRtf(text: string): string {
  return Array.from(text)
    .map(char => {
      const code = char.codePointAt(0) ?? 0;
      if (code <= 127) return char;
      // \uN takes a signed 16-bit decimal per the RTF spec
      const signed = code > 32767 ? code - 65536 : code;
      return `\\u${signed}?`;
    })
    .join('');
}
