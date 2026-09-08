// @recipe-systems/database — Prisma client entry point.
// The generated client lives in generated/ (gitignored; `prisma generate` runs in CI/local verify).
import { PrismaClient } from '../generated/index.js';

export { PrismaClient };
export * from '../generated/index.js';

export const prisma = new PrismaClient();
