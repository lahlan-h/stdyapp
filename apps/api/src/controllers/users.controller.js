import * as userService from "../services/user.service.js";

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
