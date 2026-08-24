export const getHealth = (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};

// Once Prisma is wired up in packages/core, extend this to also
// ping the DB, e.g.:
//
// import { prisma } from "@stdyapp/core";
//
// export const getHealth = async (req, res) => {
//   try {
//     await prisma.$queryRaw`SELECT 1`;
//     res.status(200).json({ status: "ok", db: "connected" });
//   } catch (err) {
//     res.status(503).json({ status: "error", db: "unreachable" });
//   }
// };