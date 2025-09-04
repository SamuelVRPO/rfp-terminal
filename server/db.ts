import { Pool } from "pg";
import { DATABASE_URL } from "./config.ts";

export const pool = new Pool({ connectionString: DATABASE_URL });

export async function query<T = any>(text: string, params?: any[]) {
  return pool.query<T>(text, params);
}

export async function closePool() {
  await pool.end().catch(() => {});
}

