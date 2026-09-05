import express from "express";

import { HttpError } from "../utils/httpError.js";

/**
 * Buffers a raw binary image body, the way validate.js buffers a JSON one.
 *
 * A factory returning a request handler, the shape validate.js and rateLimit.js
 * established for parameterised middleware.
 *
 * WHY RAW BYTES AND NOT multipart/form-data: an avatar upload is a single file
 * with no accompanying fields, which is the one case multipart buys nothing for.
 * A raw PUT needs no parser dependency, cannot smuggle a second file past a
 * one-file limit, and is a one-liner from both fetch(file) on the web and
 * React Native. If a route ever needs a file PLUS form fields, that is the point
 * to reach for multer - not this.
 *
 * express.json() in index.js is NOT a conflict, which is worth stating because
 * it looks like one. It claims `application/json` only, so an `image/jpeg`
 * request passes through it untouched with the stream unread, and this parser
 * gets the body. The two never both consume a request.
 *
 * Everything this adds over a bare express.raw() is error shaping. body-parser's
 * two failure modes are both wrong out of the box for an API that has spent
 * effort on its messages:
 *
 *  - Over the limit, it produces the bare string "request entity too large",
 *    which does not say what the limit IS.
 *  - On a type it was not configured for, it does not fail at all. It calls
 *    next() with req.body left as the `{}` its own first line assigns, so
 *    without the Buffer check below the controller would receive an object
 *    where it expects bytes and the request would 500 somewhere further in.
 */

/**
 * Formats a byte count for the 413 message. Whole MB only - every limit this is
 * used for is a round number, and "5 MB" reads better than "5242880 bytes".
 *
 * @param {number} bytes
 * @returns {string}
 */
const formatLimit = (bytes) => `${Math.round(bytes / (1024 * 1024))} MB`;

/**
 * The bare media type, with any parameters stripped.
 *
 * `image/jpeg; charset=binary` is a legal thing for a client to send and must
 * not be treated as an unknown type, so the parameters are dropped before
 * comparison. Absent header returns "", which matches nothing and produces the
 * 415 naming the accepted types.
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
const mediaType = (req) =>
  String(req.headers["content-type"] ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();

/**
 * @param {{ types: string[], limit: number }} options
 *   types - acceptable Content-Type values. This gates the PARSER only; the
 *   bytes are re-identified from their magic bytes in utils/imageType.js, and
 *   THAT is what decides what gets stored. See the doc block there.
 *   limit - maximum body size in bytes. Enforced by body-parser while the body
 *   is still streaming, so an oversized upload is aborted rather than buffered
 *   and then measured.
 * @returns {import("express").RequestHandler}
 */
export const rawImage = ({ types, limit }) => {
  // Built once at mount time rather than per request, matching how rateLimit
  // builds its key prefix once.
  const parseRaw = express.raw({ type: types, limit });
  const accepted = types.join(", ");

  return (req, res, next) => {
    parseRaw(req, res, (err) => {
      if (err) {
        // body-parser tags this one specifically; every other failure (a broken
        // stream, a bad Content-Encoding) already carries a sensible status and
        // is passed through to the error middleware in index.js unchanged.
        if (err.type === "entity.too.large") {
          return next(
            new HttpError(413, `Image must be at most ${formatLimit(limit)}`, {
              cause: err,
            }),
          );
        }

        return next(err);
      }

      // Not a Buffer means body-parser skipped: either the Content-Type was not
      // one of `types`, or there was no body at all. Separated here because they
      // are different client mistakes and deserve different statuses.
      if (!Buffer.isBuffer(req.body)) {
        if (!types.includes(mediaType(req))) {
          return next(
            new HttpError(
              415,
              `Content-Type must be one of: ${accepted}`,
            ),
          );
        }

        return next(new HttpError(400, "Request body is empty"));
      }

      // A declared Content-Length of 0 DOES reach here as a zero-length Buffer
      // rather than being skipped, so this is not covered by the branch above.
      if (req.body.length === 0) {
        return next(new HttpError(400, "Request body is empty"));
      }

      next();
    });
  };
};
