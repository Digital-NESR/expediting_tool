/**
 * Builds an RFC 6266 `Content-Disposition` value for a file download.
 *
 * HTTP header values are ByteStrings — every character has to be <= 255 — so a filename
 * carrying anything outside that range makes the `Response` constructor throw
 * "Cannot convert argument to a ByteString", which reaches the user as a bare 500 on
 * download. It happens more often than it sounds: a curly apostrophe pasted out of
 * Outlook (U+2019, as in "FW_ New Hire’s Laptop .msg") is enough, as is any accented or
 * Arabic character in an uploaded file's name.
 *
 * So emit both forms the spec allows: a sanitised ASCII `filename` any client can parse,
 * and `filename*` carrying the real UTF-8 name percent-encoded. Every current browser
 * prefers `filename*`, so the download still lands with its original name intact.
 */
export function attachmentContentDisposition(filename: string | null | undefined): string {
  const name = (filename ?? '').trim() || 'download';
  const ascii = [...name]
    .map(ch => {
      const code = ch.codePointAt(0) ?? 0;
      const printable = code >= 0x20 && code <= 0x7e;
      // A quote would close the quoted-string early; a backslash would escape whatever follows.
      const unsafe = ch === '"' || code === 0x5c;
      return printable && !unsafe ? ch : '_';
    })
    .join('');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
