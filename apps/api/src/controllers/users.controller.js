import * as userService from "../services/user.service.js";
import * as avatarService from "../services/avatar.service.js";

/**
 * POST /api/users - creates a user.
 * 201 on success, 409 on a duplicate email/username, 400 on a bad body.
 */
export const createUser = async (req, res) => {
  const user = await userService.createUser(req.validated.body);
  res.status(201).json({ data: user });
};

/**
 * GET /api/users - one page of users, newest first.
 *
 * Offset pagination (page/limit) rather than cursor: the consumer is an
 * admin/discover list that wants page numbers, and the dataset is a student
 * cohort. Revisit with cursors when the social feed lands - a feed genuinely
 * needs them.
 */
export const listUsers = async (req, res) => {
  const { items, total, page, limit } = await userService.listUsers(
    req.validated.query,
  );

  res.status(200).json({
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
    },
  });
};

/**
 * GET /api/users/:id - one user. 404 is raised by the service.
 */
export const getUser = async (req, res) => {
  const user = await userService.getUserById(req.validated.params.id);
  res.status(200).json({ data: user });
};

/**
 * PATCH /api/users/:id - partial update.
 *
 * PATCH rather than PUT: a correct PUT is a full replacement, which would force
 * clients to resend `password` on every profile edit, and id/createdAt/
 * updatedAt are server-owned so "replace the whole resource" is not meaningful.
 */
export const updateUser = async (req, res) => {
  const user = await userService.updateUser(
    req.validated.params.id,
    req.validated.body,
  );
  res.status(200).json({ data: user });
};

/**
 * DELETE /api/users/:id - 204 with no body.
 * 409 when the user still has study sessions, 404 when they do not exist.
 */
export const deleteUser = async (req, res) => {
  await userService.deleteUser(req.validated.params.id);
  res.status(204).end();
};

/**
 * PUT /api/users/:id/photo - uploads or replaces the avatar.
 *
 * PUT rather than POST because the photo is a SINGLETON sub-resource and the
 * request body is its complete representation, which is what PUT means. The
 * argument against PUT recorded above updateUser does not apply: there is no
 * other field here that a client would be forced to resend.
 *
 * 200 rather than 201, and the updated USER rather than a bare URL. The user row
 * is what changed; returning it lets a client update its profile view from this
 * one response instead of following up with GET /api/users/:id.
 *
 * req.body rather than req.validated.body, the one deviation from house style in
 * this file: the payload is a Buffer of image bytes, not JSON that Zod could
 * parse. rawImage() in the route chain is what guarantees it is a non-empty
 * Buffer within the size cap, and avatar.service.js re-identifies the format
 * from the bytes themselves.
 *
 * 415 when the bytes are not a JPEG, PNG or WebP; 502 when R2 is unreachable.
 */
export const uploadUserPhoto = async (req, res) => {
  const user = await avatarService.setAvatar(req.validated.params.id, req.body);
  res.status(200).json({ data: user });
};

/**
 * DELETE /api/users/:id/photo - clears the avatar.
 *
 * 200 with the updated user rather than the 204 deleteUser returns, and for a
 * reason: this deletes a FIELD, not the resource. The user still exists, the
 * client still wants to render it, and avatarUrl being null in the response is
 * the confirmation.
 *
 * Idempotent - removing an absent avatar is a 200, not a 404. See removeAvatar.
 */
export const removeUserPhoto = async (req, res) => {
  const user = await avatarService.removeAvatar(req.validated.params.id);
  res.status(200).json({ data: user });
};
