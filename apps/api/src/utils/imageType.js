/**
 * Identifies an image by its MAGIC BYTES rather than by what the client said it
 * was sending.
 *
 * This is the security boundary for uploads, and the distinction is not
 * academic. uploadFile() in packages/core/src/storage.js passes `contentType`
 * straight to R2 as the object's Content-Type, and that object is served from a
 * public origin. A client that declares `image/png` while sending HTML would
 * otherwise get an attacker-authored document served from our own domain with a
 * Content-Type that makes a browser render it - stored XSS, delivered by the
 * CDN. Anything derived from the header (the stored content type, the file
 * extension) must therefore come from THIS module, never from req.headers.
 *
 * A hand-rolled sniffer rather than the `file-type` package: three signatures at
 * fixed offsets is a dozen lines, and the package pulls a large detector table
 * plus a stream API for formats this API will never accept. Adding a format here
 * means adding a SIGNATURES entry and the matching mime to AVATAR_MIME_TYPES in
 * config/upload.js - both, or the parser will reject what this can identify.
 */

/**
 * Offsets are absolute from the start of the buffer, so a signature can sit
 * anywhere - which WebP needs, its marker being 8 bytes in.
 *
 * JPEG is matched on three bytes, not the full four-byte SOI+APPn: the fourth
 * varies by encoder (E0 for JFIF, E1 for EXIF, DB for a bare quantisation
 * table), and FF D8 FF is the part every JPEG shares.
 *
 * @type {Array<{ mime: string, ext: string, parts: Array<{ offset: number, bytes: number[] }> }>}
 */
const SIGNATURES = [
  {
    mime: "image/jpeg",
    ext: "jpg",
    parts: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  },
  {
    mime: "image/png",
    ext: "png",
    // The full 8-byte PNG signature. The trailing CR LF SUB LF is a
    // transfer-corruption canary, so checking all of it also rejects a PNG that
    // has been mangled by an FTP client in text mode.
    parts: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  },
  {
    mime: "image/webp",
    ext: "webp",
    // A RIFF container: "RIFF" at 0, then a 4-byte little-endian length we do
    // not care about, then the form type at 8. "RIFF" alone would also match a
    // WAV or an AVI, so both parts are required.
    parts: [
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // "RIFF"
      { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // "WEBP"
    ],
  },
];

/**
 * @param {Buffer} buffer
 * @param {{ offset: number, bytes: number[] }} part
 * @returns {boolean}
 */
const matchesPart = (buffer, { offset, bytes }) =>
  // Length-checked first: buffer[i] on a short buffer is undefined, which would
  // compare false anyway, but reading past the end of a truncated upload is
  // worth refusing explicitly rather than relying on that.
  buffer.length >= offset + bytes.length &&
  bytes.every((byte, index) => buffer[offset + index] === byte);

/**
 * Returns the image's real type, or null when the bytes are not one of the
 * formats this API accepts.
 *
 * Never throws - a caller can pass anything, including an empty buffer, and gets
 * null. The 415 is the caller's to raise, since only it knows which status the
 * surrounding request should carry.
 *
 * @param {Buffer} buffer - the complete uploaded body
 * @returns {{ mime: string, ext: string } | null}
 */
export const detectImageType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;

  const match = SIGNATURES.find(({ parts }) =>
    parts.every((part) => matchesPart(buffer, part)),
  );

  return match ? { mime: match.mime, ext: match.ext } : null;
};

/**
 * The extensions detectImageType can produce, for the ownership regex in
 * avatar.service.js.
 *
 * Derived rather than written out a second time, so adding a format to
 * SIGNATURES cannot leave that regex silently refusing to recognise - and
 * therefore refusing to clean up - keys this module has just created.
 *
 * @type {string[]}
 */
export const IMAGE_EXTENSIONS = SIGNATURES.map(({ ext }) => ext);
