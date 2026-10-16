import multer from "multer";

import { HttpError } from "../utils/httpError.js";

/**
 * Parses a multipart/form-data upload carrying exactly one image, plus whatever
 * text fields travel with it.
 *
 * A factory returning a request handler, the shape validate.js and rateLimit.js
 * established for parameterised middleware.
 *
 * WHY MULTIPART. A post sends a photo AND a caption, and one HTTP body cannot
 * hold bytes and fields at once without a container format. This is that format.
 * Avatars have no accompanying fields and could have stayed on raw bytes, but two
 * upload mechanisms in one API is worse than either alone, so both routes use
 * this and the raw-body middleware it replaced is gone.
 *
 * MEMORY STORAGE, never disk. The buffer goes straight to R2, so a temp file
 * would be written and unlinked for no reason - and every disk-backed upload is a
 * cleanup path that leaks when a request dies midway. The size limit below is
 * what keeps "hold it in memory" safe; it is not optional.
 *
 * express.json() in index.js is NOT a conflict, which is worth stating because it
 * looks like one. It claims application/json only, so a multipart request passes
 * through it with the stream unread. The two never both consume a request.
 *
 * ORDERING: whatever runs AFTER this can read req.body; nothing before it can.
 * multer is what populates req.body from the form fields, so validate({ body })
 * MUST be mounted after this middleware - the reverse of the rule users.routes.js
 * states for JSON routes, and the reason post.routes.js documents the inversion.
 *
 * Everything here beyond calling multer is error shaping. Its raw failures are
 * all wrong for this API: the size error does not say what the limit is, a
 * misnamed field produces a bare "Unexpected field", and a non-multipart request
 * does not fail at all - multer simply skips, leaving req.file undefined for a
 * controller that has every reason to assume it is there.
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
 * Whether this request is multipart at all.
 *
 * Hand-rolled rather than using type-is, which multer depends on but this package
 * does not declare - the same undeclared-dependency rule utils/prismaError.js
 * follows when it duck-types Prisma errors instead of importing the client.
 *
 * Matches on the prefix so the required boundary parameter is ignored.
 *
 * @param {import("express").Request} req
 * @returns {boolean}
 */
const isMultipart = (req) =>
  /^multipart\/form-data/i.test(String(req.headers["content-type"] ?? ""));

/**
 * Upper bound on non-file form fields. Generous next to the three a post sends,
 * and it exists so a client cannot make the parser do unbounded work with a
 * flood of tiny named parts that never hit the file size cap.
 */
const MAX_FIELDS = 10;

// Files plus fields. Must exceed MAX_FIELDS or a legitimate full request would be
// refused by the part counter before the field counter ever applied.
const MAX_PARTS = MAX_FIELDS + 2;

/**
 * @param {{ field: string, types: string[], limit: number }} options
 *   field - the form field carrying the file, e.g. "photo"
 *   types - acceptable Content-Type values FOR THE FILE PART. This gates the
 *   parser only; the bytes are re-identified from their magic bytes in
 *   utils/imageType.js, and THAT is what decides what gets stored. See the doc
 *   block there for why a client-declared type must never reach R2.
 *   limit - maximum file size in bytes, enforced while the part is still
 *   streaming, so an oversized upload is aborted rather than buffered and then
 *   measured.
 * @returns {import("express").RequestHandler}
 */
export const uploadImage = ({ field, types, limit }) => {
  const accepted = types.join(", ");

  // Built once at mount time rather than per request, matching how rateLimit
  // builds its key prefix once.
  const parseMultipart = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: limit, files: 1, fields: MAX_FIELDS, parts: MAX_PARTS },
    fileFilter: (req, file, cb) => {
      if (types.includes(file.mimetype)) return cb(null, true);

      // Passing an error rather than cb(null, false): rejecting silently would
      // leave req.file undefined and surface below as the far less helpful
      // "photo is required".
      cb(new HttpError(415, `${field} must be one of: ${accepted}`));
    },
  }).single(field);

  return (req, res, next) => {
    parseMultipart(req, res, (err) => {
      if (err) {
        // Anything that is not a MulterError is either the HttpError our
        // fileFilter raised, or a genuine stream failure. Both already carry the
        // right status, or deliberately have none and become a 500.
        if (!(err instanceof multer.MulterError)) return next(err);

        switch (err.code) {
          case "LIMIT_FILE_SIZE":
            return next(
              new HttpError(413, `Image must be at most ${formatLimit(limit)}`, {
                cause: err,
              }),
            );

          // A file arrived under the wrong name, or a second file arrived under
          // the right one - single() treats both the same way.
          case "LIMIT_UNEXPECTED_FILE":
            return next(
              new HttpError(
                400,
                `Unexpected file field "${err.field}" - send exactly one file in a "${field}" field`,
                { cause: err },
              ),
            );

          case "LIMIT_FILE_COUNT":
            return next(
              new HttpError(400, `Send exactly one file, in the "${field}" field`, {
                cause: err,
              }),
            );

          case "LIMIT_PART_COUNT":
          case "LIMIT_FIELD_COUNT":
            return next(
              new HttpError(400, "Too many form fields", { cause: err }),
            );

          default:
            // MulterError messages are safe to show - they describe the request,
            // never the server. 400 because every remaining code is a malformed
            // upload rather than a fault on our side.
            return next(new HttpError(400, err.message, { cause: err }));
        }
      }

      // No file and no error means multer skipped or found nothing. The two are
      // different client mistakes and deserve different statuses.
      if (!req.file) {
        if (!isMultipart(req)) {
          return next(
            new HttpError(
              415,
              `Content-Type must be multipart/form-data, with the image in a "${field}" field`,
            ),
          );
        }

        return next(new HttpError(400, `${field} is required`));
      }

      // A part can be present and empty - an <input type="file"> submitted with
      // nothing chosen sends a zero-length part with an empty filename. Caught
      // here so detectImageType is never handed an empty buffer.
      if (req.file.buffer.length === 0) {
        return next(new HttpError(400, `${field} is empty`));
      }

      next();
    });
  };
};
