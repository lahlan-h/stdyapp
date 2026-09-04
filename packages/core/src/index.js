/**
 * Public surface of @stdyapp/core. Keeping `import { prisma } from "@stdyapp/core"`
 * working means package.json "main" must point here.
 *
 * None of these modules open a connection or read process.env at import time -
 * the redis/rabbitmq/r2 clients are created on the first getX() call - so
 * importing this barrel is free and safe before dotenv has run.
 */
export { createLogger, logger } from "./logger.js";
export { prisma } from "./db.js";
export { getRedis, checkRedis, closeRedis } from "./redis.js";
export { getRabbitMq, checkRabbitMq, closeRabbitMq } from "./rabbitmq.js";
export {
  getR2,
  checkR2,
  connectR2,
  closeR2,
  uploadFile,
  deleteFile,
  getFile,
} from "./storage.js";
