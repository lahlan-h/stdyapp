import { prisma } from "@stdyapp/core";

export const createPost = ({ userId, sessionId, routineId, caption, photoUrl }) => {
  return prisma.post.create({
    data: { userId, sessionId, routineId, caption, photoUrl },
  });
};

export const findPostById = (id) => {
  return prisma.post.findUnique({ where: { id } });
};

// Newest first, matching findSessionsByUser — a feed reads backwards in time.
// Served straight out of the @@index([userId, createdAt]) on posts.
export const findPostsByUser = (userId) => {
  return prisma.post.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
};

export const updatePost = (id, data) => {
  return prisma.post.update({ where: { id }, data });
};

export const deletePost = (id) => {
  return prisma.post.delete({ where: { id } });
};
