import { prisma } from "@stdyapp/core";

export const getHealth = async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: "ok",
      db: "connected",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("DB health check failed:", err);
    res.status(503).json({
      status: "error",
      db: "unreachable",
    });
  }
};