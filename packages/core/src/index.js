/**
 * Public surface of @stdyapp/core. Keeping `import { prisma } from "@stdyapp/core"`
 * working means package.json "main" must point here.
 *
 * None of these modules open a connection at import time - the redis/rabbitmq
 * clients are created on the first getX() call - so importing this barrel is
 * free and safe before dotenv has run.
 */
export { prisma } from "./db.js";
export { getRedis, checkRedis, closeRedis } from "./redis.js";
export { getRabbitMq, checkRabbitMq, closeRabbitMq } from "./rabbitmq.js";
