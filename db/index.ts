import { Pool } from "pg";

const globalForDatabase = globalThis as unknown as { loginPool?: Pool };

export const pool =
  globalForDatabase.loginPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.loginPool = pool;
}
